import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { HermesApiClient } from '@/api/hermes/client'
import type { HermesConnectionConfig, HermesStatus } from '@/api/hermes/types'

const STORAGE_KEY_GATEWAY = 'hermes_gateway'
const STORAGE_KEY_CONNECTION_CONFIG = 'hermes_connection_config'

function readStoredGateway(): 'openclaw' | 'hermes' {
  const raw = localStorage.getItem(STORAGE_KEY_GATEWAY)
  if (raw === 'hermes') return 'hermes'
  return 'openclaw'
}

function readStoredConnectionConfig(): HermesConnectionConfig {
  const raw = localStorage.getItem(STORAGE_KEY_CONNECTION_CONFIG)
  if (!raw) {
    return {
      webUrl: 'http://localhost:9119',
      apiUrl: 'http://localhost:8642',
      apiKey: '',
    }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HermesConnectionConfig>
    return {
      webUrl: parsed.webUrl || 'http://localhost:9119',
      apiUrl: parsed.apiUrl || 'http://localhost:8642',
      apiKey: parsed.apiKey || '',
    }
  } catch {
    return {
      webUrl: 'http://localhost:9119',
      apiUrl: 'http://localhost:8642',
      apiKey: '',
    }
  }
}

export const useHermesConnectionStore = defineStore('hermes-connection', () => {
  // ---- 状态 ----

  const currentGateway = ref<'openclaw' | 'hermes'>(readStoredGateway())
  const hermesConnected = ref(false)
  const hermesConnecting = ref(false)
  const hermesError = ref<string | null>(null)
  const connectionConfig = ref<HermesConnectionConfig>(readStoredConnectionConfig())
  const hermesStatus = ref<HermesStatus | null>(null)

  // ---- 内部 ----

  let client: HermesApiClient | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const RECONNECT_BASE_DELAY = 2000

  // 持久化网关选择
  watch(currentGateway, (val) => {
    localStorage.setItem(STORAGE_KEY_GATEWAY, val)
  })

  // 持久化连接配置
  watch(
    connectionConfig,
    (val) => {
      localStorage.setItem(STORAGE_KEY_CONNECTION_CONFIG, JSON.stringify(val))
    },
    { deep: true },
  )

  // ---- 计算属性 ----

  function getClient(): HermesApiClient | null {
    if (!hermesConnected.value) return null
    return client
  }

  /**
   * 获取 Hermes API 客户端，如果未连接则自动等待连接完成。
   * 所有 store 的数据获取方法应优先使用此方法。
   */
  async function getClientAsync(): Promise<HermesApiClient> {
    if (!hermesConnected.value) {
      await connect()
    }
    if (!hermesConnected.value) {
      throw new Error('Hermes 连接失败')
    }
    return client!
  }

  // ---- 方法 ----

  /**
   * 切换网关
   */
  function switchGateway(gateway: 'openclaw' | 'hermes') {
    if (gateway === currentGateway.value) return
    if (gateway === 'openclaw') {
      disconnect()
    }
    currentGateway.value = gateway
  }

  /**
   * 更新连接配置
   */
  function updateConnectionConfig(patch: Partial<HermesConnectionConfig>) {
    connectionConfig.value = {
      ...connectionConfig.value,
      ...patch,
    }
    // 如果已连接，用新配置重新连接
    if (hermesConnected.value) {
      disconnect()
      connect()
    }
  }

  /**
   * 连接 Hermes
   */
  async function connect(): Promise<boolean> {
    if (hermesConnecting.value || hermesConnected.value) return hermesConnected.value

    hermesConnecting.value = true
    hermesError.value = null
    reconnectAttempts = 0

    try {
      client = new HermesApiClient(undefined, connectionConfig.value.apiKey)
      const status = await client.getStatus()
      hermesStatus.value = status
      hermesConnected.value = true
      currentGateway.value = 'hermes'
      console.log('[HermesConnection] Connected, version:', status.version)
      return true
    } catch (error) {
      hermesConnected.value = false
      hermesError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConnection] Connect failed:', error)
      scheduleReconnect()
      return false
    } finally {
      hermesConnecting.value = false
    }
  }

  /**
   * 断开 Hermes 连接
   */
  function disconnect() {
    clearReconnectTimer()
    client = null
    hermesConnected.value = false
    hermesConnecting.value = false
    hermesError.value = null
    hermesStatus.value = null
  }

  /**
   * 测试连接（不改变当前连接状态）
   */
  async function testConnection(
    apiUrl: string,
    apiKey = '',
  ): Promise<{ ok: boolean; status?: HermesStatus; error?: string }> {
    try {
      const testClient = new HermesApiClient(undefined, apiKey)
      const status = await testClient.getStatus()
      return { ok: true, status }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 刷新状态
   */
  async function refreshStatus(): Promise<void> {
    if (!client) return
    try {
      hermesStatus.value = await client.getStatus()
    } catch (error) {
      console.error('[HermesConnection] refreshStatus failed:', error)
      // 状态刷新失败不代表断连，仅记录日志
    }
  }

  // ---- 自动重连 ----

  function scheduleReconnect() {
    clearReconnectTimer()
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[HermesConnection] Max reconnect attempts reached')
      return
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts),
      30000,
    )
    reconnectAttempts++
    console.log(
      `[HermesConnection] Reconnecting in ${delay}ms, attempt ${reconnectAttempts}`,
    )
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  return {
    // 状态
    currentGateway,
    hermesConnected,
    hermesConnecting,
    hermesError,
    connectionConfig,
    hermesStatus,
    // 方法
    getClient,
    getClientAsync,
    switchGateway,
    updateConnectionConfig,
    connect,
    disconnect,
    testConnection,
    refreshStatus,
  }
})
