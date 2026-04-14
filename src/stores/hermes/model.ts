import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import type { HermesModel } from '@/api/hermes/types'

export const useHermesModelStore = defineStore('hermes-model', () => {
  // ---- 状态 ----

  const models = ref<HermesModel[]>([])
  const currentModel = ref('')
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // ---- 方法 ----

  /**
   * 加载模型列表
   */
  async function fetchModels() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      models.value = await client.listModels()
    } catch (error) {
      models.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] fetchModels failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 设置当前模型（通过配置 API）
   */
  async function setCurrentModel(modelId: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      await client.setCurrentModel(modelId)
      currentModel.value = modelId
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] setCurrentModel failed:', error)
      throw error
    }
  }

  /**
   * 从配置中同步当前模型
   */
  function syncCurrentModelFromConfig(configModel?: string) {
    if (configModel) {
      currentModel.value = configModel
    }
  }

  return {
    // 状态
    models,
    currentModel,
    loading,
    lastError,
    // 方法
    fetchModels,
    setCurrentModel,
    syncCurrentModelFromConfig,
  }
})
