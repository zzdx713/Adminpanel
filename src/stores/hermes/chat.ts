import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import type { HermesMessage } from '@/api/hermes/types'

export const useHermesChatStore = defineStore('hermes-chat', () => {
  // ---- 状态 ----

  const messages = ref<HermesMessage[]>([])
  const currentSessionId = ref<string | null>(null)
  const loading = ref(false)
  const streaming = ref(false)
  const streamingText = ref('')
  const error = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)

  // 工具调用进度追踪
  const activeToolCalls = ref<
    Array<{
      toolCallId: string
      toolName: string
      phase: 'start' | 'update' | 'result'
      argsPreview?: string
      partialPreview?: string
      resultPreview?: string
      isError?: boolean
    }>
  >([])

  // ---- 方法 ----

  /**
   * 发送消息（SSE 流式）
   */
  async function sendMessage(
    content: string,
    options?: { model?: string; sessionId?: string },
  ) {
    const text = content.trim()
    if (!text) return

    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接，请先连接 Hermes 网关')
    }

    // 如果传入了 sessionId，更新当前会话
    if (options?.sessionId) {
      currentSessionId.value = options.sessionId
    }

    // 添加用户消息到列表
    const userMessage: HermesMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    messages.value = [...messages.value, userMessage]

    // 准备助手消息占位
    const assistantMessageId = `assistant-${Date.now()}`
    const assistantMessage: HermesMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    messages.value = [...messages.value, assistantMessage]

    // 重置流式状态
    streaming.value = true
    streamingText.value = ''
    error.value = null
    activeToolCalls.value = []

    // 创建 AbortController
    abortController.value = new AbortController()

    return new Promise<void>((resolve, reject) => {
      client.sendChatStream(
        [{ role: 'user', content: text }],
        // onDelta
        (deltaText: string) => {
          streamingText.value += deltaText
          // 实时更新助手消息内容（直接修改属性，避免频繁创建新数组）
          const idx = messages.value.findIndex((m) => m.id === assistantMessageId)
          if (idx >= 0) {
            messages.value[idx]!.content = streamingText.value
            // 触发响应式更新
            messages.value = [...messages.value]
          }
        },
        currentSessionId.value || undefined,
        options?.model,
        // onToolCall
        (tool: any) => {
          const toolName = tool?.function?.name || tool?.toolName || 'unknown'
          const toolCallId = tool?.id || tool?.toolCallId || `tool-${Date.now()}`
          const argsPreview = tool?.function?.arguments
            ? typeof tool.function.arguments === 'string'
              ? tool.function.arguments
              : JSON.stringify(tool.function.arguments, null, 2)
            : undefined

          // Check if this tool call already exists (update)
          const existingIdx = activeToolCalls.value.findIndex((t) => t.toolCallId === toolCallId)
          if (existingIdx >= 0) {
            const updated = [...activeToolCalls.value]
            updated[existingIdx] = {
              ...updated[existingIdx]!,
              phase: 'update',
              partialPreview: argsPreview,
            }
            activeToolCalls.value = updated
          } else {
            activeToolCalls.value = [
              ...activeToolCalls.value,
              {
                toolCallId,
                toolName,
                phase: 'start',
                argsPreview,
              },
            ]
          }
        },
        // onDone
        () => {
          streaming.value = false
          abortController.value = null
          // 确保最终内容写入消息
          const idx = messages.value.findIndex((m) => m.id === assistantMessageId)
          if (idx >= 0 && messages.value[idx]!.content !== streamingText.value) {
            const updated = [...messages.value]
            updated[idx] = { ...updated[idx]!, content: streamingText.value }
            messages.value = updated
          }
          resolve()
        },
        // onError
        (err: string) => {
          streaming.value = false
          error.value = err
          abortController.value = null
          reject(new Error(err))
        },
        abortController.value?.signal,
      )
    })
  }

  /**
   * 停止生成
   */
  async function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }

    streaming.value = false
  }

  /**
   * 加载会话消息
   */
  async function loadSessionMessages(sessionId: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    currentSessionId.value = sessionId
    loading.value = true
    error.value = null

    try {
      const msgs = await client.getSessionMessages(sessionId)
      messages.value = msgs
    } catch (err) {
      messages.value = []
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[HermesChatStore] loadSessionMessages failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    messages.value = []
    streamingText.value = ''
    error.value = null
    activeToolCalls.value = []
    currentSessionId.value = null
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
  }

  /**
   * 设置当前会话 ID（不加载消息）
   */
  function setSessionId(sessionId: string | null) {
    currentSessionId.value = sessionId
  }

  return {
    // 状态
    messages,
    currentSessionId,
    loading,
    streaming,
    streamingText,
    error,
    abortController,
    activeToolCalls,
    // 方法
    sendMessage,
    stopGeneration,
    loadSessionMessages,
    clearMessages,
    setSessionId,
  }
})
