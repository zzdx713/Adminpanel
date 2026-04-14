// ============================================================
// Hermes Agent API 类型定义
// ============================================================

// --- 连接相关 ---

export interface HermesConnectionConfig {
  webUrl: string
  apiUrl: string
  apiKey: string
}

export interface HermesStatus {
  version: string
  uptime: number
  connected: boolean
  platform?: string
  hostname?: string
}

// --- 聊天相关 ---

export interface HermesMessage {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp?: string
  model?: string
  provider?: string
  stopReason?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
}

export interface HermesChatSendParams {
  sessionId?: string
  message: string
  model?: string
  stream?: boolean
}

export interface HermesStreamDelta {
  type: 'delta' | 'tool_call' | 'tool_result' | 'error' | 'done'
  content?: string
  toolCallId?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  isError?: boolean
  error?: string
}

// --- 会话相关 ---

export interface HermesSession {
  id: string
  title?: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
  model?: string
  platform?: string
}

export interface HermesSessionDetail extends HermesSession {
  messages?: HermesMessage[]
}

export interface HermesSearchResult {
  query: string
  sessions: HermesSession[]
  total: number
}

// --- 模型相关 ---

export interface HermesModel {
  id: string
  label?: string
  provider?: string
  enabled?: boolean
  available?: boolean
  description?: string
  contextWindow?: number
  capabilities?: string[]
}

// --- 配置相关 ---

export interface HermesConfig {
  model?: string
  modelProvider?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  contextWindow?: number
  platforms?: Record<string, unknown>
  skills?: Record<string, unknown>
  cron?: Record<string, unknown>
  memory?: Record<string, unknown>
  [key: string]: unknown
}

export interface HermesConfigUpdateParams {
  model?: string
  modelProvider?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  contextWindow?: number
  [key: string]: unknown
}

// --- 渠道/平台相关 ---

export interface HermesPlatform {
  id: string
  name: string
  type: string
  enabled: boolean
  configured: boolean
  config?: Record<string, unknown>
}

// --- 技能相关 ---

export interface HermesSkill {
  name: string
  description?: string
  version?: string
  enabled: boolean
  category?: string
  config?: Record<string, unknown>
}

// --- 定时任务相关 ---

export interface HermesCronJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  schedule: string
  command?: string
  timezone?: string
  nextRun?: string
  lastRun?: string
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  createdAt?: string
  updatedAt?: string
}

export interface HermesCronJobCreateParams {
  name: string
  description?: string
  enabled?: boolean
  schedule: string
  command?: string
  timezone?: string
}

export interface HermesCronJobUpdateParams {
  name?: string
  description?: string
  enabled?: boolean
  schedule?: string
  command?: string
  timezone?: string
}

// --- 记忆相关 ---

export interface HermesMemoryContent {
  content: string
  updatedAt?: string
  size?: number
}

// --- 工具集相关 ---

export interface HermesToolset {
  name: string
  enabled: boolean
  configured: boolean
  tools?: string[]
  description?: string
}

// --- 环境变量相关 ---

export interface HermesEnvVar {
  key: string
  value: string
  masked?: boolean
}

// --- 使用分析相关 ---

export interface HermesUsageAnalytics {
  days: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  daily?: Array<{
    date: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
  }>
}

// --- 聊天流式增量 ---

export interface HermesChatDelta {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index: number
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string | null
  }>
}

// --- API 响应 ---

export interface HermesApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  message?: string
}
