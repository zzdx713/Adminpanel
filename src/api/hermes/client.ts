import type {
  HermesStatus,
  HermesSession,
  HermesMessage,
  HermesModel,
  HermesConfig,
  HermesCronJob,
  HermesSkill,
  HermesToolset,
  HermesEnvVar,
  HermesUsageAnalytics,
  HermesChatDelta,
  HermesConnectionConfig,
  HermesSearchResult,
  HermesMemoryContent,
} from './types'

// ============================================================================
// Custom Errors
// ============================================================================

export class HermesConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HermesConnectionError'
  }
}

export class HermesApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    const msg = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as any).message)
      : `Hermes API error ${status}`
    super(msg)
    this.name = 'HermesApiError'
    this.status = status
    this.body = body
  }
}

// ============================================================================
// Hermes API Client
// ============================================================================

export class HermesApiClient {
  private baseUrl: string
  private authToken: string | null = null

  constructor(baseUrl?: string, authToken?: string) {
    this.baseUrl = baseUrl ?? '/api/hermes'
    if (authToken) {
      this.authToken = authToken
    }
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`
    }
    return h
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    })

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text().catch(() => null)
      }
      throw new HermesApiError(response.status, body)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  private async requestRaw(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    })

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text().catch(() => null)
      }
      throw new HermesApiError(response.status, body)
    }

    return response
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  async connect(config: HermesConnectionConfig): Promise<void> {
    await this.request('/connect', {
      method: 'POST',
      body: JSON.stringify(config),
    })
    this.authToken = config.apiKey
  }

  async testConnection(config: HermesConnectionConfig): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/test-connection', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async getConnectionConfig(): Promise<HermesConnectionConfig | null> {
    return this.request<HermesConnectionConfig | null>('/connect')
  }

  // --------------------------------------------------------------------------
  // System Status
  // --------------------------------------------------------------------------

  async getStatus(): Promise<HermesStatus> {
    return this.request<HermesStatus>('/status')
  }

  async getHealth(): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('/health')
  }

  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------

  async listSessions(limit?: number): Promise<HermesSession[]> {
    const params = limit != null ? `?limit=${limit}` : ''
    const result = await this.request<any>(`/sessions${params}`)
    // 后端返回 { sessions: [...], total, limit, offset } 格式
    if (Array.isArray(result)) return result
    return result.sessions || result.data || []
  }

  async searchSessions(query: string, limit?: number): Promise<HermesSearchResult> {
    const params = new URLSearchParams({ q: query })
    if (limit != null) params.set('limit', String(limit))
    return this.request<HermesSearchResult>(`/sessions/search?${params}`)
  }

  async getSession(id: string): Promise<HermesSession> {
    return this.request<HermesSession>(`/sessions/${encodeURIComponent(id)}`)
  }

  async getSessionMessages(id: string): Promise<HermesMessage[]> {
    const result = await this.request<{ session_id: string; messages: HermesMessage[] } | HermesMessage[]>(
      `/sessions/${encodeURIComponent(id)}/messages`,
    )
    // API may return { session_id, messages: [...] } or [...]
    if (Array.isArray(result)) return result
    return result.messages || []
  }

  async deleteSession(id: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  // --------------------------------------------------------------------------
  // Chat (SSE Streaming via POST)
  // --------------------------------------------------------------------------

  async sendChatStream(
    messages: Array<{ role: string; content: string }>,
    onDelta: (text: string) => void,
    sessionId?: string,
    model?: string,
    onToolCall?: (tool: any) => void,
    onDone?: () => void,
    onError?: (error: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      messages,
      stream: true,
    }
    if (sessionId) body.session_id = sessionId
    if (model) body.model = model

    let response: Response
    try {
      response = await this.requestRaw('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: abortSignal,
      })
    } catch (err: any) {
      if (err instanceof HermesApiError) {
        onError?.(err.message)
        return
      }
      if (err?.name === 'AbortError') {
        return
      }
      onError?.(err?.message ?? 'Unknown error')
      return
    }

    if (!response.body) {
      onError?.('No response body')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let chunkCount = 0
    let deltaCount = 0

    console.log('[HermesClient] sendChatStream: response status:', response.status, 'content-type:', response.headers.get('content-type'))

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[HermesClient] sendChatStream: stream done. chunks received:', chunkCount, 'deltas fired:', deltaCount)
          break
        }

        chunkCount++
        const text = decoder.decode(value, { stream: true })
        buffer += text
        console.log(`[HermesClient] sendChatStream: chunk #${chunkCount}, length=${text.length}, buffer length=${buffer.length}`)
        console.log('[HermesClient] sendChatStream: chunk text:', JSON.stringify(text.substring(0, 200)))

        // Process complete SSE lines
        const lines = buffer.split('\n')
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) {
            // Skip empty lines and SSE comments
            continue
          }

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)

            // Check for stream end
            if (data === '[DONE]') {
              console.log('[HermesClient] sendChatStream: received [DONE]')
              onDone?.()
              return
            }

            try {
              const parsed: HermesChatDelta = JSON.parse(data)

              for (const choice of parsed.choices) {
                // Handle text content delta
                if (choice.delta?.content) {
                  deltaCount++
                  console.log(`[HermesClient] sendChatStream: delta #${deltaCount}:`, JSON.stringify(choice.delta.content))
                  onDelta(choice.delta.content)
                }
                // Handle tool calls
                if (choice.delta?.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    onToolCall?.({
                      index: tc.index,
                      id: tc.id,
                      type: tc.type,
                      function: tc.function,
                    })
                  }
                }
              }
            } catch {
              // Non-JSON data line, could be a tool call event or other format
              // Try to extract tool call information
              if (onToolCall && trimmed.includes('tool_call')) {
                try {
                  const toolData = JSON.parse(data)
                  onToolCall(toolData)
                } catch {
                  // Ignore unparseable tool call data
                }
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const parsed: HermesChatDelta = JSON.parse(trimmed.slice(6))
            for (const choice of parsed.choices) {
              if (choice.delta?.content) {
                onDelta(choice.delta.content)
              }
            }
          } catch {
            // Ignore
          }
        }
      }

      onDone?.()
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return
      }
      onError?.(err?.message ?? 'Stream read error')
    } finally {
      reader.releaseLock()
    }
  }

  // --------------------------------------------------------------------------
  // Models
  // --------------------------------------------------------------------------

  async listModels(): Promise<HermesModel[]> {
    const result = await this.request<any>('/v1/models')
    // OpenAI 兼容格式: { object: "list", data: [...] }
    if (Array.isArray(result)) return result
    return result.data || result.models || []
  }

  async setCurrentModel(modelId: string): Promise<void> {
    await this.request('/config', {
      method: 'PUT',
      body: JSON.stringify({ model: modelId }),
    })
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  async getConfig(): Promise<HermesConfig> {
    return this.request<HermesConfig>('/config')
  }

  async getConfigDefaults(): Promise<HermesConfig> {
    return this.request<HermesConfig>('/config/defaults')
  }

  async getConfigSchema(): Promise<any> {
    return this.request<any>('/config/schema')
  }

  async updateConfig(config: Partial<HermesConfig>): Promise<void> {
    await this.request('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    })
  }

  async getRawConfig(): Promise<string> {
    const response = await this.requestRaw('/config/raw')
    return response.text()
  }

  async updateRawConfig(yaml: string): Promise<void> {
    await this.request('/config/raw', {
      method: 'PUT',
      body: yaml,
      headers: {
        'Content-Type': 'application/yaml',
      },
    })
  }

  // --------------------------------------------------------------------------
  // Environment Variables
  // --------------------------------------------------------------------------

  async listEnvVars(): Promise<HermesEnvVar[]> {
    return this.request<HermesEnvVar[]>('/env')
  }

  async setEnvVar(key: string, value: string): Promise<void> {
    await this.request('/env', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    })
  }

  async deleteEnvVar(key: string): Promise<void> {
    await this.request('/env', {
      method: 'DELETE',
      body: JSON.stringify({ key }),
    })
  }

  async revealEnvVar(key: string): Promise<string> {
    const result = await this.request<{ value: string }>('/env/reveal', {
      method: 'POST',
      body: JSON.stringify({ key }),
    })
    return result.value
  }

  // --------------------------------------------------------------------------
  // Cron Jobs
  // --------------------------------------------------------------------------

  async listCronJobs(): Promise<HermesCronJob[]> {
    return this.request<HermesCronJob[]>('/cron/jobs')
  }

  async getCronJob(id: string): Promise<HermesCronJob> {
    return this.request<HermesCronJob>(`/cron/jobs/${encodeURIComponent(id)}`)
  }

  async createCronJob(job: Partial<HermesCronJob>): Promise<HermesCronJob> {
    return this.request<HermesCronJob>('/cron/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    })
  }

  async updateCronJob(id: string, job: Partial<HermesCronJob>): Promise<HermesCronJob> {
    return this.request<HermesCronJob>(`/cron/jobs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(job),
    })
  }

  async pauseCronJob(id: string): Promise<void> {
    await this.request(`/cron/jobs/${encodeURIComponent(id)}/pause`, { method: 'POST' })
  }

  async resumeCronJob(id: string): Promise<void> {
    await this.request(`/cron/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST' })
  }

  async triggerCronJob(id: string): Promise<void> {
    await this.request(`/cron/jobs/${encodeURIComponent(id)}/trigger`, { method: 'POST' })
  }

  async deleteCronJob(id: string): Promise<void> {
    await this.request(`/cron/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  // --------------------------------------------------------------------------
  // Skills
  // --------------------------------------------------------------------------

  async listSkills(): Promise<HermesSkill[]> {
    return this.request<HermesSkill[]>('/skills')
  }

  async toggleSkill(name: string, enabled: boolean): Promise<void> {
    await this.request('/skills/toggle', {
      method: 'PUT',
      body: JSON.stringify({ name, enabled }),
    })
  }

  // --------------------------------------------------------------------------
  // Toolsets
  // --------------------------------------------------------------------------

  async listToolsets(): Promise<HermesToolset[]> {
    return this.request<HermesToolset[]>('/tools/toolsets')
  }

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  async getUsageAnalytics(days?: number): Promise<HermesUsageAnalytics> {
    const params = days != null ? `?days=${days}` : ''
    return this.request<HermesUsageAnalytics>(`/analytics/usage${params}`)
  }

  // --------------------------------------------------------------------------
  // Logs
  // --------------------------------------------------------------------------

  async getLogs(params?: {
    file?: string
    lines?: number
    level?: string
    component?: string
  }): Promise<string> {
    const searchParams = new URLSearchParams()
    if (params?.file) searchParams.set('file', params.file)
    if (params?.lines) searchParams.set('lines', String(params.lines))
    if (params?.level) searchParams.set('level', params.level)
    if (params?.component) searchParams.set('component', params.component)

    const query = searchParams.toString()
    const path = `/logs${query ? `?${query}` : ''}`

    const response = await this.requestRaw(path)
    return response.text()
  }

  // --------------------------------------------------------------------------
  // Platforms (via config extraction)
  // --------------------------------------------------------------------------

  async listPlatforms(): Promise<any[]> {
    // No dedicated platform endpoint in backend; extract from config
    const config = await this.getConfig()
    const platforms = config.platforms
    if (!platforms || typeof platforms !== 'object') return []
    return Object.entries(platforms as Record<string, unknown>).map(([id, conf]) => {
      const c = conf as Record<string, unknown>
      return {
        id,
        name: (c.name as string) || id,
        type: (c.type as string) || id,
        enabled: c.enabled !== false,
        configured: !!c.configured || !!c.token || !!c.apiKey,
        config: c,
      }
    })
  }

  async updatePlatform(platformId: string, platformConfig: Record<string, unknown>): Promise<any> {
    const config = await this.getConfig()
    const platforms = (config.platforms || {}) as Record<string, unknown>
    platforms[platformId] = { ...((platforms[platformId] as Record<string, unknown>) || {}), ...platformConfig }
    await this.updateConfig({ platforms })
    return { id: platformId, ...platformConfig }
  }

  // --------------------------------------------------------------------------
  // Memory
  // --------------------------------------------------------------------------

  async getMemory(): Promise<HermesMemoryContent> {
    const config = await this.getConfig()
    return {
      content: (config.memory as any)?.content || '',
      updatedAt: (config.memory as any)?.updatedAt,
      size: ((config.memory as any)?.content || '').length,
    }
  }

  async updateMemory(content: string): Promise<HermesMemoryContent> {
    await this.updateConfig({ memory: { content } })
    return { content, updatedAt: new Date().toISOString(), size: content.length }
  }
}
