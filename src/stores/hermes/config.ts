import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import type { HermesConfig, HermesConfigUpdateParams } from '@/api/hermes/types'

export const useHermesConfigStore = defineStore('hermes-config', () => {
  // ---- 状态 ----

  const config = ref<HermesConfig | null>(null)
  const rawConfig = ref('')
  const configSchema = ref<unknown>(null)
  const defaults = ref<HermesConfig | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  // ---- 方法 ----

  /**
   * 加载配置
   */
  async function fetchConfig() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      config.value = await client.getConfig()
    } catch (error) {
      config.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchConfig failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新配置（部分更新）
   */
  async function updateConfig(params: HermesConfigUpdateParams) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.updateConfig(params)
      // Re-fetch to get updated config
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] updateConfig failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 加载原始 YAML 配置
   */
  async function fetchRawConfig() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      rawConfig.value = await client.getRawConfig()
    } catch (error) {
      rawConfig.value = ''
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchRawConfig failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新原始 YAML 配置
   */
  async function updateRawConfig(yaml: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.updateRawConfig(yaml)
      rawConfig.value = yaml
      // 更新后重新加载结构化配置
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] updateRawConfig failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 加载配置默认值
   */
  async function fetchDefaults() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      defaults.value = await client.getConfigDefaults()
    } catch (error) {
      defaults.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchDefaults failed:', error)
    }
  }

  /**
   * 加载配置 Schema
   */
  async function fetchConfigSchema() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      configSchema.value = await client.getConfigSchema()
    } catch (error) {
      configSchema.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchConfigSchema failed:', error)
    }
  }

  /**
   * 加载全部配置数据（配置 + 默认值 + Schema）
   */
  async function fetchAll() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      const [configResult, defaultsResult, schemaResult] = await Promise.allSettled([
        client.getConfig(),
        client.getConfigDefaults(),
        client.getConfigSchema(),
      ])

      if (configResult.status === 'fulfilled') {
        config.value = configResult.value
      } else {
        lastError.value = configResult.reason instanceof Error
          ? configResult.reason.message
          : String(configResult.reason)
      }

      if (defaultsResult.status === 'fulfilled') {
        defaults.value = defaultsResult.value
      }

      if (schemaResult.status === 'fulfilled') {
        configSchema.value = schemaResult.value
      }
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    config,
    rawConfig,
    configSchema,
    defaults,
    loading,
    saving,
    lastError,
    // 方法
    fetchConfig,
    updateConfig,
    fetchRawConfig,
    updateRawConfig,
    fetchDefaults,
    fetchConfigSchema,
    fetchAll,
  }
})
