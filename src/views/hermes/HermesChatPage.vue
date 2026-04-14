<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NInput,
  NButton,
  NIcon,
  NText,
  NTag,
  NSpin,
  NEmpty,
  NSelect,
  NAlert,
  NSwitch,
  NModal,
  NForm,
  NFormItem,
  NPopconfirm,
  NSpace,
  NTooltip,
  useMessage,
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import {
  SendOutline,
  StopCircleOutline,
  RefreshOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CopyOutline,
  ChatbubblesOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesChatStore } from '@/stores/hermes/chat'
import { useHermesSessionStore } from '@/stores/hermes/session'
import { useHermesModelStore } from '@/stores/hermes/model'
import { useHermesSkillStore } from '@/stores/hermes/skill'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { renderSimpleMarkdown } from '@/utils/markdown'
import type { HermesMessage } from '@/api/hermes/types'

const { t, locale } = useI18n()
const message = useMessage()
const chatStore = useHermesChatStore()
const sessionStore = useHermesSessionStore()
const modelStore = useHermesModelStore()
const skillStore = useHermesSkillStore()
const connStore = useHermesConnectionStore()

// ---- Types ----

interface QuickReply {
  id: string
  title: string
  content: string
  updatedAt: number
}

interface CommandItem {
  key: string
  label: string
  description: string
  category: string
  argsHint: string
  hasArgs: boolean
  action: (args?: string) => void
}

// ---- Constants ----

const QUICK_REPLIES_STORAGE_KEY = 'hermes_chat_quick_replies_v1'
const BOTTOM_GAP = 32

// ---- State ----

const inputText = ref('')
const selectedModel = ref<string | null>(null)
const messageListRef = ref<HTMLElement | null>(null)

// Auto-scroll
const autoFollowBottom = ref(true)
const showScrollToBottomBtn = ref(false)
let pendingForceScroll = false
let pendingScroll = false
let destroyed = false

// Token usage tracking
const lastTokenUsage = ref<{ input: number; output: number; total: number } | null>(null)

// Command panel
const showCommandPanel = ref(false)
const commandFilter = ref('')
const selectedCommandIndex = ref(0)

// Sidebar collapse
const sideCollapsed = ref(false)

// Tool call expand state
const expandedToolCalls = ref(new Set<string>())

// Copy state
const copiedMessageId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

// Quick replies
const quickReplies = ref<QuickReply[]>([])
const quickReplySearch = ref('')
const showQuickReplyModal = ref(false)
const quickReplyModalMode = ref<'create' | 'edit'>('create')
const editingQuickReplyId = ref('')
const quickReplyForm = reactive({
  title: '',
  content: '',
})

// Role filter
const roleFilter = ref<'all' | 'user' | 'assistant' | 'system'>('all')

// ---- Commands (aligned with Hermes Agent official COMMAND_REGISTRY) ----

const commands = computed<CommandItem[]>(() => {
  const list: CommandItem[] = [
    // Session
    {
      key: '/new', label: '/new', category: 'Session',
      description: t('pages.hermesChat.cmdNew'), argsHint: '', hasArgs: false,
      action: handleNewSession,
    },
    {
      key: '/retry', label: '/retry', category: 'Session',
      description: t('pages.hermesChat.cmdRetry'), argsHint: '', hasArgs: false,
      action: () => {
        // Re-send the last user message
        const lastUserMsg = [...chatStore.messages].reverse().find(m => m.role === 'user')
        if (lastUserMsg) {
          chatStore.sendMessage(lastUserMsg.content, { model: selectedModel.value || undefined }).catch(() => {})
        }
      },
    },
    {
      key: '/undo', label: '/undo', category: 'Session',
      description: t('pages.hermesChat.cmdUndo'), argsHint: '', hasArgs: false,
      action: () => {
        const msgs = chatStore.messages
        // Remove last assistant + user pair
        while (msgs.length > 0) {
          const last = msgs[msgs.length - 1]!
          msgs.pop()
          if (last.role === 'user') break
        }
        chatStore.messages = [...msgs]
      },
    },
    {
      key: '/title', label: '/title', category: 'Session',
      description: t('pages.hermesChat.cmdTitle'), argsHint: '[name]', hasArgs: true,
      action: (args) => {
        if (args && args.trim()) {
          message.info(t('pages.hermesChat.cmdTitleSet', { title: args.trim() }))
        }
      },
    },
    {
      key: '/compress', label: '/compress', category: 'Session',
      description: t('pages.hermesChat.cmdCompress'), argsHint: '[focus topic]', hasArgs: true,
      action: (args) => {
        message.info(t('pages.hermesChat.cmdCompressHint'))
      },
    },
    {
      key: '/stop', label: '/stop', category: 'Session',
      description: t('pages.hermesChat.cmdStop'), argsHint: '', hasArgs: false,
      action: () => {
        chatStore.stopGeneration()
        message.success(t('pages.hermesChat.cmdStopped'))
      },
    },
    {
      key: '/status', label: '/status', category: 'Session',
      description: t('pages.hermesChat.cmdStatus'), argsHint: '', hasArgs: false,
      action: () => {
        const session = selectedSession.value
        if (session) {
          message.info(
            `${t('pages.hermesChat.cmdStatusSession')}: ${session.title || session.id}\n` +
            `${t('pages.hermesChat.cmdStatusModel')}: ${session.model || '-'}\n` +
            `${t('pages.hermesChat.cmdStatusMessages')}: ${chatStore.messages.length}`,
          )
        }
      },
    },
    {
      key: '/clear', label: '/clear', category: 'Session',
      description: t('pages.hermesChat.cmdClear'), argsHint: '', hasArgs: false,
      action: () => {
        chatStore.clearMessages()
        lastTokenUsage.value = null
      },
    },

    // Configuration
    {
      key: '/model', label: '/model', category: 'Configuration',
      description: t('pages.hermesChat.cmdModel'), argsHint: '[model]', hasArgs: true,
      action: (args) => {
        if (args && args.trim()) {
          const target = args.trim()
          const found = modelStore.models.find(m => m.id === target || m.label === target)
          if (found) {
            selectedModel.value = found.id
            modelStore.setCurrentModel(found.id)
            message.success(t('pages.hermesChat.cmdModelSwitched', { model: found.label || found.id }))
          } else {
            message.warning(t('pages.hermesChat.cmdModelNotFound', { model: target }))
          }
        }
      },
    },
    {
      key: '/provider', label: '/provider', category: 'Configuration',
      description: t('pages.hermesChat.cmdProvider'), argsHint: '', hasArgs: false,
      action: () => {
        const providers = [...new Set(modelStore.models.map(m => m.provider || 'custom'))]
        message.info(`${t('pages.hermesChat.cmdProviderList')}: ${providers.join(', ')}`)
      },
    },
    {
      key: '/yolo', label: '/yolo', category: 'Configuration',
      description: t('pages.hermesChat.cmdYolo'), argsHint: '', hasArgs: false,
      action: () => {
        message.info(t('pages.hermesChat.cmdYoloHint'))
      },
    },

    // Tools & Skills
    {
      key: '/reload', label: '/reload', category: 'Tools & Skills',
      description: t('pages.hermesChat.cmdReload'), argsHint: '', hasArgs: false,
      action: () => {
        connStore.connect().then(() => {
          message.success(t('pages.hermesChat.cmdReloadSuccess'))
        }).catch(() => {
          message.error(t('pages.hermesChat.cmdReloadFailed'))
        })
      },
    },
    {
      key: '/reload-mcp', label: '/reload-mcp', category: 'Tools & Skills',
      description: t('pages.hermesChat.cmdReloadMcp'), argsHint: '', hasArgs: false,
      action: () => {
        message.info(t('pages.hermesChat.cmdReloadMcpHint'))
      },
    },
    {
      key: '/skills', label: '/skills', category: 'Tools & Skills',
      description: t('pages.hermesChat.cmdSkills'), argsHint: '[search|list]', hasArgs: true,
      action: (args) => {
        skillStore.fetchSkills().then(() => {
          const skills = skillStore.skills
          if (args && args.trim()) {
            const keyword = args.trim().toLowerCase()
            const matched = skills.filter(s =>
              s.name.toLowerCase().includes(keyword) ||
              (s.description || '').toLowerCase().includes(keyword) ||
              (s.category || '').toLowerCase().includes(keyword),
            )
            if (matched.length === 0) {
              message.warning(t('pages.hermesChat.cmdSkillsNoMatch', { keyword: args.trim() }))
            } else {
              const list = matched.slice(0, 20).map(s =>
                `  ${s.enabled ? '✅' : '⬜'} ${s.name}${s.version ? ` v${s.version}` : ''} — ${s.description || s.category || ''}`,
              ).join('\n')
              message.info(`【${t('pages.hermesChat.cmdSkillsMatched')}】(${matched.length})\n${list}`, { duration: 10000 })
            }
          } else {
            const enabled = skills.filter(s => s.enabled).length
            const disabled = skills.length - enabled
            const categories = [...new Set(skills.map(s => s.category || 'other'))]
            const list = skills.slice(0, 30).map(s =>
              `  ${s.enabled ? '✅' : '⬜'} ${s.name}${s.version ? ` v${s.version}` : ''} — ${s.description || s.category || ''}`,
            ).join('\n')
            const summary = `${t('pages.hermesChat.cmdSkillsTotal')}: ${skills.length} (${t('pages.hermesChat.cmdSkillsEnabled')}: ${enabled}, ${t('pages.hermesChat.cmdSkillsDisabled')}: ${disabled})\n${t('pages.hermesChat.cmdSkillsCategories')}: ${categories.join(', ')}`
            message.info(`${summary}\n\n${list}${skills.length > 30 ? '\n  ...' : ''}`, { duration: 12000 })
          }
        }).catch(() => {
          message.error(t('pages.hermesChat.cmdSkillsFailed'))
        })
      },
    },

    // Info
    {
      key: '/commands', label: '/commands', category: 'Info',
      description: t('pages.hermesChat.cmdCommands'), argsHint: '[page]', hasArgs: true,
      action: (args) => {
        const categories = [...new Set(commands.value.map(c => c.category))]
        const grouped = categories.map(cat => {
          const cmds = commands.value.filter(c => c.category === cat)
          const lines = cmds.map(c => {
            const hint = c.argsHint ? ` ${c.argsHint}` : ''
            return `  ${c.key}${hint.padEnd(20 - c.key.length - hint.length)} ${c.description}`
          }).join('\n')
          return `【${cat}】\n${lines}`
        }).join('\n\n')
        message.info(`${t('pages.hermesChat.cmdCommandsHeader')} (${commands.value.length})\n\n${grouped}`, { duration: 12000 })
      },
    },
    {
      key: '/help', label: '/help', category: 'Info',
      description: t('pages.hermesChat.cmdHelp'), argsHint: '', hasArgs: false,
      action: () => {
        const lines = commands.value.map(c => `  ${c.key.padEnd(16)} ${c.description}`)
        const categories = [...new Set(commands.value.map(c => c.category))]
        const grouped = categories.map(cat => {
          const cmds = commands.value.filter(c => c.category === cat).map(c => `  ${c.key.padEnd(16)} ${c.description}`).join('\n')
          return `【${cat}】\n${cmds}`
        }).join('\n\n')
        message.info(grouped, { duration: 8000 })
      },
    },
    {
      key: '/usage', label: '/usage', category: 'Info',
      description: t('pages.hermesChat.cmdUsage'), argsHint: '', hasArgs: false,
      action: () => {
        if (lastTokenUsage.value) {
          message.info(
            `${t('pages.hermesChat.tokenInput')}: ${lastTokenUsage.value.input}\n` +
            `${t('pages.hermesChat.tokenOutput')}: ${lastTokenUsage.value.output}\n` +
            `${t('pages.hermesChat.tokenTotal')}: ${lastTokenUsage.value.total}`,
          )
        } else {
          message.info(t('pages.hermesChat.cmdUsageEmpty'))
        }
      },
    },
  ]
  return list
})

const filteredCommands = computed(() => {
  if (!commandFilter.value) return commands.value
  const filter = commandFilter.value.toLowerCase()
  return commands.value.filter(
    (cmd) =>
      cmd.key.toLowerCase().includes(filter) ||
      cmd.description.toLowerCase().includes(filter),
  )
})

// ---- Computed ----

const modelOptions = computed(() =>
  modelStore.models.map((m) => ({
    label: m.label || m.id,
    value: m.id,
  })),
)

const isConnected = computed(() => connStore.hermesConnected)

const messageCount = computed(() => chatStore.messages.length)

const roleFilterOptions = computed<SelectOption[]>(() => [
  { label: t('pages.hermesChat.filters.all'), value: 'all' },
  { label: t('pages.hermesChat.filters.user'), value: 'user' },
  { label: t('pages.hermesChat.filters.assistant'), value: 'assistant' },
  { label: t('pages.hermesChat.filters.system'), value: 'system' },
])

// Token usage tags
const tokenMetricTags = computed(() => {
  const usage = lastTokenUsage.value
  if (!usage) return []
  return [
    { key: 'total', label: t('pages.hermesChat.tokenTotal'), value: formatTokenCount(usage.total), highlight: true },
    { key: 'input', label: t('pages.hermesChat.tokenInput'), value: formatTokenCount(usage.input), highlight: false },
    { key: 'output', label: t('pages.hermesChat.tokenOutput'), value: formatTokenCount(usage.output), highlight: false },
  ]
})

// Streaming text display
const displayMessages = computed(() => {
  const msgs = chatStore.messages
  if (msgs.length === 0) return msgs
  if (chatStore.streaming && msgs[msgs.length - 1]!.role === 'assistant') {
    return msgs.map((m, i) => {
      if (i === msgs.length - 1) {
        return { ...m, content: chatStore.streamingText || m.content }
      }
      return m
    })
  }
  return msgs
})

// Role-filtered messages
const filteredMessages = computed(() => {
  if (roleFilter.value === 'all') return displayMessages.value
  return displayMessages.value.filter((m) => m.role === roleFilter.value)
})

// Character count
const inputCharCount = computed(() => inputText.value.length)

// Session options for NSelect
const sessionOptions = computed(() =>
  sessionStore.sessions.map((s) => ({
    label: s.title || s.id,
    value: s.id,
  })),
)

// Selected session metadata
const selectedSession = computed(() => {
  if (!chatStore.currentSessionId) return null
  return sessionStore.sessions.find((s) => s.id === chatStore.currentSessionId) || null
})

// Stats
const stats = computed(() => {
  const list = displayMessages.value
  let user = 0
  let assistant = 0
  let system = 0

  for (const msg of list) {
    if (msg.role === 'user') user += 1
    else if (msg.role === 'assistant') assistant += 1
    else if (msg.role === 'system') system += 1
  }

  const last = list.length > 0 ? list[list.length - 1] : null
  return {
    total: list.length,
    user,
    assistant,
    system,
    lastMessageAt: last?.timestamp ? formatRelativeTime(last.timestamp) : '-',
  }
})

// Filtered quick replies
const filteredQuickReplies = computed(() => {
  const query = quickReplySearch.value.trim().toLowerCase()
  const list = [...quickReplies.value].sort((a, b) => b.updatedAt - a.updatedAt)
  if (!query) return list
  return list.filter((item) =>
    [item.title, item.content].some((field) => field.toLowerCase().includes(query)),
  )
})

// ---- Lifecycle ----

onMounted(async () => {
  loadQuickReplies()

  if (!isConnected.value) {
    await connStore.connect()
  }
  try {
    await sessionStore.fetchSessions()
  } catch { /* ignore */ }
  try {
    await modelStore.fetchModels()
  } catch { /* ignore */ }

  // Auto-select first session if none selected
  if (!chatStore.currentSessionId && sessionStore.sessions.length > 0) {
    const firstSession = sessionStore.sessions[0]
    if (firstSession) {
      await handleSelectSession(firstSession.id)
    }
  }
})

onUnmounted(() => {
  destroyed = true
  pendingForceScroll = false
  pendingScroll = false
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
})

// ---- Scroll Logic ----

function isNearBottom(): boolean {
  const el = messageListRef.value
  if (!el) return true
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= BOTTOM_GAP
}

function handleMessagesScroll() {
  const near = isNearBottom()
  autoFollowBottom.value = near
  showScrollToBottomBtn.value = !near
}

function scrollToBottom(options?: { force?: boolean }) {
  const el = messageListRef.value
  if (!el) return

  const force = options?.force ?? false
  if (!force && !autoFollowBottom.value) return

  el.scrollTop = el.scrollHeight
}

function requestScrollToBottom(options?: { force?: boolean }) {
  const force = options?.force ?? false
  if (!force && !autoFollowBottom.value) return
  if (force) pendingForceScroll = true
  if (pendingScroll) return

  pendingScroll = true
  const schedule =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (fn: () => void) => Promise.resolve().then(fn)
  schedule(() => {
    pendingScroll = false
    if (destroyed) return
    const forceNow = pendingForceScroll
    pendingForceScroll = false
    scrollToBottom({ force: forceNow })
  })
}

function handleClickScrollToBottom() {
  autoFollowBottom.value = true
  showScrollToBottomBtn.value = false
  requestScrollToBottom({ force: true })
}

// Watch messages length
watch(
  () => chatStore.messages.length,
  () => {
    requestScrollToBottom()
  },
)

// Watch streaming text
watch(
  () => chatStore.streamingText,
  () => {
    if (chatStore.streaming) {
      requestScrollToBottom()
    }
  },
)

// ---- Markdown Rendering ----

function renderChatMarkdown(content: string, role: HermesMessage['role']): string {
  if (!content || !content.trim()) return ''
  if (role === 'user') {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')
  }
  return renderSimpleMarkdown(content)
}

// ---- Token Usage ----

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(
    Math.max(0, value),
  )
}

watch(
  () => chatStore.streaming,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false && !chatStore.error) {
      const lastAssistant = [...chatStore.messages]
        .reverse()
        .find((m) => m.role === 'assistant')
      if (lastAssistant && (lastAssistant as any).usage) {
        const usage = (lastAssistant as any).usage
        lastTokenUsage.value = {
          input: typeof usage.input === 'number' ? usage.input : 0,
          output: typeof usage.output === 'number' ? usage.output : 0,
          total: typeof usage.total === 'number' ? usage.total : 0,
        }
      }
    }
  },
)

// ---- Command Panel ----

function handleInputUpdate(value: string) {
  inputText.value = value
  if (value.startsWith('/') && !value.includes('\n')) {
    const spaceIdx = value.indexOf(' ')
    commandFilter.value = spaceIdx >= 0 ? value.slice(0, spaceIdx) : value
    showCommandPanel.value = true
    selectedCommandIndex.value = 0
  } else {
    showCommandPanel.value = false
    commandFilter.value = ''
  }
}

function handleCommandSelect(cmd: CommandItem) {
  if (cmd.hasArgs) {
    // For commands with arguments: keep the command in input, close panel, let user type args
    // e.g. "/model " -> user types model name -> presses Enter to execute
    inputText.value = cmd.key + ' '
    showCommandPanel.value = false
    commandFilter.value = ''
    // Focus the input so user can continue typing
    nextTick(() => {
      const textarea = document.querySelector('.chat-input-area textarea') as HTMLTextAreaElement
      if (textarea) {
        textarea.focus()
        // Move cursor to end
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      }
    })
  } else {
    // For commands without arguments: execute immediately
    showCommandPanel.value = false
    commandFilter.value = ''
    inputText.value = ''
    cmd.action()
  }
}

function handleCommandKeydown(e: KeyboardEvent) {
  if (!showCommandPanel.value || filteredCommands.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedCommandIndex.value =
      (selectedCommandIndex.value + 1) % filteredCommands.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedCommandIndex.value =
      (selectedCommandIndex.value - 1 + filteredCommands.value.length) %
      filteredCommands.value.length
  } else if (e.key === 'Tab') {
    // Tab: auto-complete command (keep command in input for args)
    e.preventDefault()
    const cmd = filteredCommands.value[selectedCommandIndex.value]
    if (cmd) {
      inputText.value = cmd.key + ' '
      showCommandPanel.value = false
      commandFilter.value = ''
    }
  } else if (e.key === 'Enter') {
    // Enter on a filtered command: apply it (same as click)
    if (filteredCommands.value.length === 1) {
      e.preventDefault()
      handleCommandSelect(filteredCommands.value[0]!)
    }
    // If multiple commands match, don't intercept Enter — let the normal send handle it
  } else if (e.key === 'Escape') {
    e.preventDefault()
    showCommandPanel.value = false
    commandFilter.value = ''
  }
}

// ---- Actions ----

function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return

  // If command panel is open and a command is selected, handle it
  if (showCommandPanel.value && filteredCommands.value.length > 0) {
    const cmd = filteredCommands.value[selectedCommandIndex.value]
    if (cmd) {
      handleCommandSelect(cmd)
      return
    }
  }

  // Check if input starts with a known command (e.g. "/model qwen3.5")
  if (text.startsWith('/')) {
    const spaceIdx = text.indexOf(' ')
    const cmdKey = spaceIdx >= 0 ? text.slice(0, spaceIdx) : text
    const args = spaceIdx >= 0 ? text.slice(spaceIdx + 1).trim() : ''
    const matchedCmd = commands.value.find(c => c.key === cmdKey)

    if (matchedCmd) {
      inputText.value = ''
      showCommandPanel.value = false
      commandFilter.value = ''
      matchedCmd.action(args)
      return
    }
    // Unknown command — send as normal message to the AI
  }

  inputText.value = ''
  showCommandPanel.value = false
  commandFilter.value = ''

  chatStore.sendMessage(text, {
    model: selectedModel.value || undefined,
  }).catch(() => {
    message.error(chatStore.error || t('pages.hermesChat.sendFailed'))
  })

  // Refresh session list after sending
  nextTick(() => {
    sessionStore.fetchSessions().catch(() => {})
  })
}

function handleStop() {
  chatStore.stopGeneration()
}

function handleNewSession() {
  chatStore.clearMessages()
  lastTokenUsage.value = null
  autoFollowBottom.value = true
  showScrollToBottomBtn.value = false
  nextTick(() => requestScrollToBottom({ force: true }))
}

async function handleSelectSession(sessionId: string) {
  try {
    await chatStore.loadSessionMessages(sessionId)
    lastTokenUsage.value = null
    autoFollowBottom.value = true
    showScrollToBottomBtn.value = false
    nextTick(() => requestScrollToBottom({ force: true }))
  } catch {
    message.error(t('pages.hermesChat.loadMessagesFailed'))
  }
}

async function handleDeleteSession(sessionId: string) {
  try {
    await sessionStore.deleteSession(sessionId)
    if (chatStore.currentSessionId === sessionId) {
      chatStore.clearMessages()
      lastTokenUsage.value = null
    }
    message.success(t('pages.hermesChat.deleteSessionSuccess'))
  } catch {
    message.error(t('pages.hermesChat.deleteSessionFailed'))
  }
}

async function handleRefreshChatData() {
  try {
    await sessionStore.fetchSessions()
    if (chatStore.currentSessionId) {
      await chatStore.loadSessionMessages(chatStore.currentSessionId)
      autoFollowBottom.value = true
      nextTick(() => requestScrollToBottom({ force: true }))
    }
  } catch {
    // ignore
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showCommandPanel.value) {
    handleCommandKeydown(e)
    return
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function getRoleTagType(role: HermesMessage['role']): 'info' | 'success' | 'warning' | 'error' {
  switch (role) {
    case 'user': return 'info'
    case 'assistant': return 'success'
    case 'tool': return 'warning'
    case 'system': return 'error'
    default: return 'info'
  }
}

function getRoleLabel(role: HermesMessage['role']): string {
  switch (role) {
    case 'user': return t('pages.hermesChat.roleUser')
    case 'assistant': return t('pages.hermesChat.roleAssistant')
    case 'tool': return t('pages.hermesChat.roleTool')
    case 'system': return t('pages.hermesChat.roleSystem')
    default: return role
  }
}

// ---- Tool Call Expand/Collapse ----

function toggleToolCallExpand(key: string) {
  const set = expandedToolCalls.value
  if (set.has(key)) {
    set.delete(key)
  } else {
    set.add(key)
  }
  expandedToolCalls.value = new Set(set)
}

// ---- Copy Message ----

async function copyMessageContent(msg: HermesMessage) {
  const content = msg.content || ''
  try {
    await navigator.clipboard.writeText(content)
    copiedMessageId.value = msg.id || null
    message.success(t('common.copied'))
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedMessageId.value = null
      copiedTimer = null
    }, 2000)
  } catch {
    message.error(t('common.copyFailed'))
  }
}

// ---- Time Formatting ----

function formatMessageTime(timestamp?: string): string {
  if (!timestamp) return ''
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return '-'
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return `${diffSec}s`
    if (diffMin < 60) return `${diffMin}m`
    if (diffHour < 24) return `${diffHour}h`
    if (diffDay < 30) return `${diffDay}d`
    return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
  } catch {
    return '-'
  }
}

function formatSessionDate(timestamp?: string): string {
  if (!timestamp) return '-'
  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

// ---- Quick Replies ----

function loadQuickReplies() {
  try {
    const raw = localStorage.getItem(QUICK_REPLIES_STORAGE_KEY)
    if (!raw) {
      quickReplies.value = []
      return
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      quickReplies.value = []
      return
    }
    quickReplies.value = parsed.filter(
      (item: any) =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.content === 'string',
    )
  } catch {
    quickReplies.value = []
  }
}

function persistQuickReplies() {
  localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(quickReplies.value))
}

function resetQuickReplyForm() {
  quickReplyForm.title = ''
  quickReplyForm.content = ''
}

function openCreateQuickReply() {
  quickReplyModalMode.value = 'create'
  editingQuickReplyId.value = ''
  resetQuickReplyForm()
  showQuickReplyModal.value = true
}

function openEditQuickReply(item: QuickReply) {
  quickReplyModalMode.value = 'edit'
  editingQuickReplyId.value = item.id
  quickReplyForm.title = item.title
  quickReplyForm.content = item.content
  showQuickReplyModal.value = true
}

function handleDeleteQuickReply(id: string) {
  quickReplies.value = quickReplies.value.filter((item) => item.id !== id)
  persistQuickReplies()
  message.success(t('pages.hermesChat.quickReplies.saved'))
}

function handleInsertQuickReply(item: QuickReply) {
  const text = item.content.trim()
  if (!text) return
  inputText.value = inputText.value.trim() ? `${inputText.value}\n${text}` : text
  message.success(t('pages.hermesChat.quickReplies.saved'))
}

function handleSendQuickReply(item: QuickReply) {
  inputText.value = item.content
  nextTick(() => handleSend())
}

function handleSaveQuickReply() {
  const title = quickReplyForm.title.trim()
  const content = quickReplyForm.content.trim()
  if (!title) {
    message.warning(t('pages.hermesChat.quickReplies.titleLabel'))
    return
  }
  if (!content) {
    message.warning(t('pages.hermesChat.quickReplies.contentLabel'))
    return
  }

  if (quickReplyModalMode.value === 'edit' && editingQuickReplyId.value) {
    quickReplies.value = quickReplies.value.map((item) =>
      item.id === editingQuickReplyId.value
        ? { ...item, title, content, updatedAt: Date.now() }
        : item,
    )
  } else {
    quickReplies.value = [
      {
        id: `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content,
        updatedAt: Date.now(),
      },
      ...quickReplies.value,
    ]
  }

  persistQuickReplies()
  showQuickReplyModal.value = false
  message.success(t('pages.hermesChat.quickReplies.saved'))
}
</script>

<template>
  <div class="hermes-chat-page">
    <NCard :title="t('pages.hermesChat.sessions')" class="app-card chat-root-card">
      <template #header-extra>
        <NSpace :size="8" class="app-toolbar">
          <div v-if="tokenMetricTags.length" class="chat-token-metrics">
            <NTag
              v-for="metric in tokenMetricTags"
              :key="metric.key"
              size="small"
              :bordered="false"
              round
              class="chat-token-chip"
              :class="{ 'chat-token-chip--total': metric.highlight }"
            >
              <span class="chat-token-chip__label">{{ metric.label }}</span>
              <span class="chat-token-chip__value">{{ metric.value }}</span>
            </NTag>
          </div>
          <NButton
            size="small"
            class="app-toolbar-btn app-toolbar-btn--refresh"
            :loading="sessionStore.loading || chatStore.loading"
            @click="handleRefreshChatData"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.hermesChat.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NGrid cols="1 l:3" responsive="screen" :x-gap="12" :y-gap="12" class="chat-grid" :class="{ 'chat-grid--collapsed': sideCollapsed }">
        <!-- Sidebar -->
        <NGridItem :span="1" class="chat-grid-side" :class="{ 'chat-grid-side--collapsed': sideCollapsed }">
          <!-- Collapse button -->
          <div class="chat-side-collapse-btn" @click="sideCollapsed = !sideCollapsed">
            <NIcon :component="ChevronBackOutline" size="14" />
          </div>

          <NCard v-show="!sideCollapsed" embedded :bordered="false" class="chat-side-card">
            <NSpace vertical :size="12">
              <!-- Stats panel -->
              <div class="chat-side-stats">
                <div class="chat-stat-item">
                  <span class="chat-stat-label">{{ t('pages.hermesChat.stats.total') }}</span>
                  <strong>{{ stats.total }}</strong>
                </div>
                <div class="chat-stat-item">
                  <span class="chat-stat-label">{{ t('pages.hermesChat.stats.assistant') }}</span>
                  <strong>{{ stats.assistant }}</strong>
                </div>
                <div class="chat-stat-item">
                  <span class="chat-stat-label">{{ t('pages.hermesChat.stats.lastMessage') }}</span>
                  <strong>{{ stats.lastMessageAt }}</strong>
                </div>
              </div>

              <!-- Session selector -->
              <div>
                <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesChat.sessionSelector') }}</NText>
                <NSelect
                  :value="chatStore.currentSessionId"
                  :options="sessionOptions"
                  filterable
                  :placeholder="t('pages.hermesChat.sessionSelectorPlaceholder')"
                  style="min-width: 240px; margin-top: 6px;"
                  @update:value="handleSelectSession"
                />
              </div>

              <!-- Quick Replies panel -->
              <div class="chat-quick-panel">
                <NSpace justify="space-between" align="center">
                  <NText strong>{{ t('pages.hermesChat.quickReplies.title') }}</NText>
                  <NButton size="tiny" type="primary" secondary @click="openCreateQuickReply">
                    {{ t('pages.hermesChat.quickReplies.add') }}
                  </NButton>
                </NSpace>
                <NInput
                  v-model:value="quickReplySearch"
                  size="small"
                  style="margin-top: 8px;"
                  :placeholder="t('pages.hermesChat.quickReplies.searchPlaceholder')"
                />

                <div v-if="filteredQuickReplies.length" class="chat-quick-list">
                  <div v-for="item in filteredQuickReplies" :key="item.id" class="chat-quick-item">
                    <NSpace justify="space-between" align="start" :wrap="false">
                      <div style="min-width: 0; flex: 1;">
                        <NText strong>{{ item.title }}</NText>
                        <NText depth="3" style="display: block; font-size: 12px; margin-top: 4px;">
                          {{ item.content.length > 78 ? item.content.slice(0, 78) + '...' : item.content }}
                        </NText>
                      </div>
                      <NSpace :size="2">
                        <NButton size="tiny" text @click="handleInsertQuickReply(item)">
                          {{ t('pages.hermesChat.quickReplies.insert') }}
                        </NButton>
                        <NButton size="tiny" text type="primary" @click="handleSendQuickReply(item)">
                          {{ t('pages.hermesChat.quickReplies.send') }}
                        </NButton>
                        <NButton size="tiny" text @click="openEditQuickReply(item)">
                          {{ t('pages.hermesChat.quickReplies.edit') }}
                        </NButton>
                        <NPopconfirm
                          :positive-text="t('common.delete')"
                          :negative-text="t('common.cancel')"
                          @positive-click="handleDeleteQuickReply(item.id)"
                        >
                          <template #trigger>
                            <NButton size="tiny" text type="error">
                              {{ t('pages.hermesChat.quickReplies.delete') }}
                            </NButton>
                          </template>
                          {{ t('pages.hermesChat.quickReplies.confirmDelete') }}
                        </NPopconfirm>
                      </NSpace>
                    </NSpace>
                  </div>
                </div>
                <NEmpty v-else :description="t('pages.hermesChat.quickReplies.empty')" style="padding: 14px 0 8px;" />
              </div>

              <!-- Preferences -->
              <div class="chat-side-switches">
                <NSpace justify="space-between" align="center">
                  <NText>{{ t('pages.hermesChat.preferences.autoFollow') }}</NText>
                  <NSwitch v-model:value="autoFollowBottom" />
                </NSpace>
                <NSpace justify="space-between" align="center" style="margin-top: 8px;">
                  <NText>{{ t('pages.hermesChat.filters.title') }}</NText>
                  <NSelect
                    v-model:value="roleFilter"
                    size="small"
                    :options="roleFilterOptions"
                    style="width: 132px;"
                  />
                </NSpace>
              </div>

              <!-- Session metadata -->
              <div v-if="selectedSession" class="chat-side-kv">
                <div class="chat-kv-row">
                  <span>{{ t('pages.hermesChat.sessionInfo.title') }}</span>
                  <code class="chat-kv-label">{{ selectedSession.title || selectedSession.id }}</code>
                </div>
                <div v-if="selectedSession.model" class="chat-kv-row">
                  <span>{{ t('pages.hermesChat.sessionInfo.model') }}</span>
                  <NTag size="small" :bordered="false" round>{{ selectedSession.model }}</NTag>
                </div>
                <div v-if="selectedSession.platform" class="chat-kv-row">
                  <span>{{ t('pages.hermesChat.sessionInfo.platform') }}</span>
                  <NTag size="small" :bordered="false" round type="info">{{ selectedSession.platform }}</NTag>
                </div>
                <div class="chat-kv-row">
                  <span>{{ t('pages.hermesChat.sessionInfo.messages') }}</span>
                  <code>{{ selectedSession.messageCount ?? chatStore.messages.length }}</code>
                </div>
                <div v-if="selectedSession.createdAt" class="chat-kv-row">
                  <span>{{ t('pages.hermesChat.sessionInfo.created') }}</span>
                  <code>{{ formatSessionDate(selectedSession.createdAt) }}</code>
                </div>
              </div>
            </NSpace>
          </NCard>
        </NGridItem>

        <!-- Main Chat Area -->
        <NGridItem :span="sideCollapsed ? 3 : 2" class="chat-grid-main">
          <!-- Expand button -->
          <div v-if="sideCollapsed" class="chat-side-expand-btn" @click="sideCollapsed = false">
            <NIcon :component="ChevronForwardOutline" size="14" />
          </div>

          <div class="chat-main-column">
            <!-- Chat Header -->
            <NCard embedded :bordered="false" class="chat-transcript-card">
              <NSpace justify="space-between" align="center" style="margin-bottom: 10px;">
                <NSpace align="center" :size="8">
                  <NSelect
                    v-model:value="selectedModel"
                    :options="modelOptions"
                    :placeholder="t('pages.hermesChat.selectModel')"
                    clearable
                    style="width: 240px;"
                    size="small"
                  />
                  <NTag v-if="messageCount > 0" size="small" :bordered="false" round>
                    {{ messageCount }} {{ t('pages.hermesChat.messages') }}
                  </NTag>
                </NSpace>
                <NText depth="3" style="font-size: 12px;">
                  {{ stats.user }} / {{ stats.assistant }} / {{ stats.system }}
                </NText>
              </NSpace>

              <!-- Messages -->
              <div class="chat-transcript-shell">
                <NSpin :show="chatStore.loading" class="chat-transcript-spin">
                  <div
                    ref="messageListRef"
                    class="chat-transcript"
                    @scroll="handleMessagesScroll"
                  >
                    <!-- Empty state -->
                    <div v-if="filteredMessages.length === 0 && !chatStore.loading" class="hermes-chat-empty">
                      <div class="hermes-chat-empty-content">
                        <NIcon :component="ChatbubblesOutline" size="48" depth="3" />
                        <NText depth="3" style="font-size: 14px; margin-top: 12px;">
                          {{ t('pages.hermesChat.noMessages') }}
                        </NText>
                        <NText depth="3" style="font-size: 12px; margin-top: 4px;">
                          {{ t('pages.hermesChat.emptyHint') }}
                        </NText>
                      </div>
                    </div>

                    <!-- Message list -->
                    <div v-else class="hermes-chat-message-list">
                      <div
                        v-for="(msg, msgIdx) in filteredMessages"
                        :key="msg.id || msgIdx"
                        class="chat-bubble"
                        :class="`is-${msg.role}`"
                      >
                        <!-- Bubble meta -->
                        <NSpace justify="space-between" align="center" class="chat-bubble-meta" :size="8">
                          <NSpace align="center" :size="6">
                            <NTag :type="getRoleTagType(msg.role)" size="small" :bordered="false" round>
                              {{ getRoleLabel(msg.role) }}
                            </NTag>
                          </NSpace>
                          <NText v-if="msg.timestamp" depth="3" style="font-size: 12px;">
                            {{ formatMessageTime(msg.timestamp) }}
                          </NText>
                        </NSpace>

                        <!-- Message content -->
                        <div class="chat-bubble-content-wrapper">
                          <div
                            v-if="msg.role === 'assistant'"
                            class="chat-bubble-content chat-markdown"
                            v-html="renderChatMarkdown(msg.content, msg.role)"
                          ></div>
                          <div
                            v-else
                            class="chat-bubble-content"
                            v-html="renderChatMarkdown(msg.content, msg.role)"
                          ></div>
                          <!-- Copy button on hover -->
                          <div class="chat-content-copy-btn">
                            <NTooltip>
                              <template #trigger>
                                <NButton
                                  quaternary
                                  size="tiny"
                                  :type="copiedMessageId === (msg.id || msgIdx) ? 'success' : 'default'"
                                  @click="copyMessageContent(msg)"
                                >
                                  <template #icon>
                                    <NIcon :component="CopyOutline" />
                                  </template>
                                </NButton>
                              </template>
                              {{ t('common.copy') }}
                            </NTooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </NSpin>
              </div>

              <!-- Tool Calls (collapsible panels) -->
              <div v-if="chatStore.activeToolCalls.length > 0" class="hermes-chat-tool-calls">
                <div
                  v-for="(tc, tcIdx) in chatStore.activeToolCalls"
                  :key="tc.toolCallId || tcIdx"
                  class="tool-call-card"
                >
                  <NSpace align="center" justify="space-between">
                    <NSpace align="center" :size="6">
                      <NTag size="small" type="warning" :bordered="false" round>
                        {{ t('pages.hermesChat.toolCall') }}
                      </NTag>
                      <NText strong style="font-size: 13px;">{{ tc.toolName }}</NText>
                    </NSpace>
                    <NButton
                      v-if="tc.argsPreview"
                      size="tiny"
                      text
                      @click="toggleToolCallExpand(tc.toolCallId || `tc-${tcIdx}`)"
                    >
                      {{ expandedToolCalls.has(tc.toolCallId || `tc-${tcIdx}`) ? t('pages.hermesChat.hideArgs') : t('pages.hermesChat.viewArgs') }}
                    </NButton>
                  </NSpace>
                  <div
                    v-if="tc.argsPreview && expandedToolCalls.has(tc.toolCallId || `tc-${tcIdx}`)"
                    class="tool-call-args"
                  >
                    <pre class="tool-call-args__content">{{ tc.argsPreview }}</pre>
                  </div>
                </div>
              </div>

              <!-- Streaming indicator -->
              <div v-if="chatStore.streaming" class="hermes-chat-streaming">
                <NText depth="3" style="font-size: 12px;">
                  <NSpin size="small" /> {{ t('pages.hermesChat.streaming') }}
                </NText>
              </div>
            </NCard>

            <!-- Input Area -->
            <NCard embedded :bordered="false" class="chat-compose-card">
              <NSpace vertical :size="10">
                <!-- Command Panel -->
                <Transition name="hermes-slide">
                  <div v-if="showCommandPanel && filteredCommands.length > 0" class="hermes-command-panel">
                    <div
                      v-for="(cmd, idx) in filteredCommands"
                      :key="cmd.key"
                      class="hermes-command-item"
                      :class="{ 'hermes-command-item--active': idx === selectedCommandIndex }"
                      @click="handleCommandSelect(cmd)"
                      @mouseenter="selectedCommandIndex = idx"
                    >
                      <NSpace :size="8" align="center" justify="space-between">
                        <NSpace :size="8" align="center">
                          <NText strong style="font-size: 13px; min-width: 80px;">{{ cmd.key }}</NText>
                          <NText v-if="cmd.argsHint" depth="3" style="font-size: 11px; font-style: italic;">{{ cmd.argsHint }}</NText>
                        </NSpace>
                        <NSpace :size="6" align="center">
                          <NTag size="tiny" :bordered="false" type="info">{{ cmd.category }}</NTag>
                          <NText depth="3" style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ cmd.description }}</NText>
                        </NSpace>
                      </NSpace>
                    </div>
                  </div>
                </Transition>

                <NInput
                  :value="inputText"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 8 }"
                  :placeholder="t('pages.hermesChat.inputPlaceholder')"
                  :disabled="!isConnected"
                  @update:value="handleInputUpdate"
                  @keydown="handleKeydown"
                />

                <NSpace justify="space-between" align="center">
                  <NText v-if="inputCharCount > 0" depth="3" style="font-size: 11px;">
                    {{ inputCharCount }}
                  </NText>
                  <span v-else />
                  <NSpace :size="8">
                    <NButton
                      v-if="chatStore.streaming"
                      type="warning"
                      size="small"
                      class="app-toolbar-btn"
                      @click="handleStop"
                    >
                      <template #icon><NIcon :component="StopCircleOutline" /></template>
                      {{ t('pages.hermesChat.stop') }}
                    </NButton>
                    <NButton
                      type="primary"
                      size="small"
                      class="app-toolbar-btn"
                      :disabled="!inputText.trim() || chatStore.streaming || !isConnected"
                      @click="handleSend"
                    >
                      <template #icon><NIcon :component="SendOutline" /></template>
                      {{ t('pages.hermesChat.send') }}
                    </NButton>
                  </NSpace>
                </NSpace>
              </NSpace>
            </NCard>
          </div>
        </NGridItem>
      </NGrid>

      <!-- Error -->
      <NAlert v-if="chatStore.error" type="error" :bordered="false" closable style="margin-top: 12px;">
        {{ chatStore.error }}
      </NAlert>
    </NCard>

    <!-- Quick Reply Modal -->
    <NModal
      v-model:show="showQuickReplyModal"
      preset="card"
      :title="quickReplyModalMode === 'edit'
        ? t('pages.hermesChat.quickReplies.editTitle')
        : t('pages.hermesChat.quickReplies.createTitle')"
      style="width: 640px; max-width: calc(100vw - 28px);"
    >
      <NForm label-placement="left" label-width="72">
        <NFormItem :label="t('pages.hermesChat.quickReplies.titleLabel')" required>
          <NInput v-model:value="quickReplyForm.title" :placeholder="t('pages.hermesChat.quickReplies.titlePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesChat.quickReplies.contentLabel')" required>
          <NInput
            v-model:value="quickReplyForm.content"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            :placeholder="t('pages.hermesChat.quickReplies.contentPlaceholder')"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showQuickReplyModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleSaveQuickReply">
            {{ quickReplyModalMode === 'edit'
              ? t('common.save')
              : t('pages.hermesChat.quickReplies.add') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.hermes-chat-page {
  min-height: 0;
}

/* Desktop: fill available height */
@media (min-width: 1024px) {
  .hermes-chat-page {
    height: calc(100vh - var(--header-height) - 48px);
    display: flex;
    flex-direction: column;
  }

  :deep(.chat-root-card) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :deep(.chat-root-card .n-card__content) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .chat-grid {
    flex: 1;
    min-height: 0;
    align-content: stretch;
  }

  .chat-grid-side,
  .chat-grid-main {
    min-height: 0;
    display: flex;
    position: relative;
  }

  /* Collapse button */
  .chat-side-collapse-btn {
    position: absolute;
    right: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 48px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 0 4px 4px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .chat-side-collapse-btn:hover {
    background: var(--bg-secondary);
    opacity: 1;
  }

  /* Expand button */
  .chat-side-expand-btn {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 48px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px 0 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .chat-side-expand-btn:hover {
    background: var(--bg-secondary);
    opacity: 1;
  }

  /* Sidebar collapsed state */
  .chat-grid-side--collapsed {
    width: 0 !important;
    min-width: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden;
  }

  .chat-grid-side--collapsed .chat-side-card {
    display: none;
  }

  .chat-grid-side--collapsed .chat-side-collapse-btn {
    display: none;
  }

  .chat-side-card {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .chat-main-column {
    flex: 1;
    min-height: 0;
  }
}

/* Token metrics */
.chat-token-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.chat-token-chip.n-tag {
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.chat-token-chip--total.n-tag {
  background: rgba(32, 128, 240, 0.12);
}

.chat-token-chip__label {
  color: var(--text-secondary);
  margin-right: 4px;
}

.chat-token-chip__value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Side card */
.chat-side-card {
  border-radius: var(--radius);
}

.chat-main-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.chat-side-switches,
.chat-side-stats,
.chat-side-kv,
.chat-quick-panel {
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  background: var(--bg-primary);
}

/* Quick replies */
.chat-quick-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
}

.chat-quick-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-secondary);
}

.chat-quick-footnote {
  margin-top: 8px;
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
}

/* Stats */
.chat-side-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.chat-stat-item {
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-stat-item strong {
  font-size: 13px;
  line-height: 1.3;
}

.chat-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Session metadata KV rows */
.chat-kv-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px dashed var(--border-color);
}

.chat-kv-row:last-child {
  border-bottom: none;
}

.chat-kv-row code {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-secondary);
  word-break: break-all;
}

.chat-kv-label {
  font-style: italic;
  color: var(--text-secondary);
}

/* Transcript card */
.chat-transcript-card,
.chat-compose-card {
  border-radius: var(--radius);
}

.chat-transcript-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.chat-transcript-card .n-card__content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-transcript-shell {
  flex: 1;
  min-height: 0;
}

:deep(.chat-transcript-shell .n-spin-container),
:deep(.chat-transcript-shell .n-spin-content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-transcript {
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  padding-bottom: 20px;
  overflow-anchor: none;
  overscroll-behavior: contain;
  background:
    radial-gradient(circle at top right, rgba(24, 160, 88, 0.06), transparent 30%),
    var(--bg-primary);
}

/* Compose card */
.chat-compose-card {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  position: relative;
}

/* Empty state */
.hermes-chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.hermes-chat-empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
}

/* Message list */
.hermes-chat-message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Chat bubbles */
.chat-bubble {
  position: relative;
  width: fit-content;
  max-width: min(840px, 88%);
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.chat-bubble.is-user {
  margin-left: auto;
  border-color: rgba(24, 160, 88, 0.35);
  background: rgba(24, 160, 88, 0.09);
}

.chat-bubble.is-assistant {
  margin-right: auto;
  border-color: rgba(24, 144, 255, 0.3);
  background: rgba(24, 144, 255, 0.08);
}

.chat-bubble.is-tool {
  margin-right: auto;
  border-style: dashed;
}

.chat-bubble.is-system {
  margin: 0 auto 12px;
  border-style: dashed;
  background: rgba(250, 173, 20, 0.08);
}

.chat-bubble-meta {
  margin-bottom: 6px;
}

.chat-bubble-content-wrapper {
  position: relative;
}

.chat-bubble-content {
  white-space: pre-wrap;
  line-height: 1.65;
  word-break: break-word;
}

.chat-content-copy-btn {
  position: absolute;
  top: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.chat-bubble-content-wrapper:hover .chat-content-copy-btn {
  opacity: 1;
}

/* Tool calls */
.hermes-chat-tool-calls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.tool-call-card {
  border: 1px solid rgba(250, 173, 20, 0.35);
  border-radius: 8px;
  background: rgba(250, 173, 20, 0.08);
  padding: 10px;
  transition: border-color 0.15s ease;
}

.tool-call-card:hover {
  border-color: rgba(250, 173, 20, 0.55);
}

.tool-call-args {
  margin-top: 10px;
}

.tool-call-args__content {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
}

/* Streaming indicator */
.hermes-chat-streaming {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Command panel */
.hermes-command-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #efeff5);
  border-radius: var(--card-radius-xl, 8px) var(--card-radius-xl, 8px) 0 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  z-index: 20;
  max-height: 320px;
  overflow-y: auto;
}

.hermes-command-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.hermes-command-item:hover,
.hermes-command-item--active {
  background: var(--primary-color-hover, rgba(32, 128, 240, 0.08));
}

.hermes-slide-enter-active,
.hermes-slide-leave-active {
  transition: all 0.2s ease;
}

.hermes-slide-enter-from,
.hermes-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ---- Markdown styles (mirrors ChatPage chat-markdown) ---- */

.chat-markdown {
  white-space: normal;
  font-size: 12.5px;
  line-height: 1.72;
  word-break: break-word;
  overflow-wrap: break-word;
}

.chat-markdown :deep(> :first-child) {
  margin-top: 0;
}

.chat-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

/* Headings */
.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
  margin: 16px 0 4px;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.chat-markdown :deep(h1) { font-size: 1.25em; }
.chat-markdown :deep(h2) { font-size: 1.12em; }
.chat-markdown :deep(h3) { font-size: 1.02em; }

/* Paragraphs */
.chat-markdown :deep(p) {
  margin: 4px 0;
  line-height: 1.72;
}

/* Tables (GFM) */
.chat-markdown :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  padding: 10px 12px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
  text-align: left;
}

.chat-markdown :deep(th) {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-weight: 600;
}

.chat-markdown :deep(th:last-child),
.chat-markdown :deep(td:last-child) {
  border-right: none;
}

.chat-markdown :deep(tr:last-child > td) {
  border-bottom: none;
}

/* Unordered lists */
.chat-markdown :deep(ul) {
  margin: 4px 0;
  padding-left: 1.1em;
  list-style: none;
}

.chat-markdown :deep(ul > li) {
  position: relative;
  margin: 2px 0;
  line-height: 1.72;
}

.chat-markdown :deep(ul > li::before) {
  content: '';
  position: absolute;
  left: -0.88em;
  top: 0.58em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--md-bullet-color);
}

/* Nested lists */
.chat-markdown :deep(ul ul) {
  margin: 1px 0 1px 0.15em;
}

.chat-markdown :deep(ul ul > li::before) {
  width: 3.5px;
  height: 3.5px;
  background: transparent;
  border: 1px solid var(--md-bullet-nested-color);
  top: 0.62em;
}

/* Ordered lists */
.chat-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 1.5em;
  list-style-position: outside;
}

.chat-markdown :deep(ol > li) {
  margin: 2px 0;
  line-height: 1.72;
}

.chat-markdown :deep(ol > li::marker) {
  color: var(--md-bullet-color);
  font-size: 0.9em;
  font-weight: 500;
}

/* Links */
.chat-markdown :deep(a) {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  transition: color 0.12s ease, text-decoration-color 0.12s ease;
  text-decoration-line: underline;
  text-decoration-color: var(--link-underline);
}

.chat-markdown :deep(a:hover) {
  color: var(--link-color-hover);
  text-decoration-color: var(--link-color-hover);
}

/* Blockquotes */
.chat-markdown :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 10px;
  border-left: 2.5px solid var(--md-blockquote-border);
  border-radius: 0 4px 4px 0;
  background: var(--md-blockquote-bg);
}

.chat-markdown :deep(blockquote p) {
  margin: 2px 0;
  color: var(--text-secondary);
  font-size: 0.94em;
}

/* Code */
.chat-markdown :deep(pre) {
  margin: 6px 0;
  padding: 9px 11px;
  border-radius: 6px;
  border: 1px solid var(--md-code-border);
  background: var(--md-pre-bg);
  overflow-x: auto;
  line-height: 1.52;
}

.chat-markdown :deep(code) {
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 0.87em;
}

.chat-markdown :deep(p code),
.chat-markdown :deep(li code),
.chat-markdown :deep(td code),
.chat-markdown :deep(th code) {
  padding: 0.5px 4.5px;
  border-radius: 3px;
  border: 1px solid var(--md-code-border);
  background: var(--md-code-bg);
}

/* Code block container (with line numbers) */
.chat-markdown :deep(.code-block-container) {
  display: flex;
  position: relative;
  margin: 6px 0;
  border-radius: 6px;
  border: 1px solid var(--md-code-border);
  background: var(--md-pre-bg);
  overflow-x: auto;
}

.chat-markdown :deep(.code-block-container pre) {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  overflow: visible;
}

.chat-markdown :deep(.code-line-numbers) {
  display: flex;
  flex-direction: column;
  padding: 10px 8px;
  background: rgba(0, 0, 0, 0.03);
  border-right: 1px solid var(--md-code-border);
  text-align: right;
  user-select: none;
  min-width: 40px;
}

.chat-markdown :deep(.line-number) {
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 0.87em;
  line-height: 1.52;
  color: var(--text-tertiary);
  padding: 0 4px;
}

.chat-markdown :deep(.code-content) {
  flex: 1;
  padding: 10px 12px;
  overflow-x: auto;
  min-width: 0;
}

.chat-markdown :deep(.code-content code) {
  display: block;
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 0.87em;
  line-height: 1.52;
  white-space: pre;
}

.chat-markdown :deep(.code-copy-btn) {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 4px 6px;
  border: 1px solid var(--md-code-border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.chat-markdown :deep(.code-block-container:hover .code-copy-btn) {
  opacity: 1;
}

.chat-markdown :deep(.code-copy-btn:hover) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.chat-markdown :deep(.code-copy-btn.copied) {
  color: var(--link-color);
}

/* Horizontal rule */
.chat-markdown :deep(hr) {
  border: 0;
  height: 1px;
  background: var(--border-color);
  margin: 10px 0;
}

/* Strong / Em */
.chat-markdown :deep(strong) {
  font-weight: 600;
}

.chat-markdown :deep(em) {
  font-style: italic;
}

/* Images */
.chat-markdown :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 4px 0;
}

/* KaTeX */
.chat-markdown :deep(.katex-display) {
  margin: 8px 0;
  overflow-x: auto;
}

/* Responsive */
@media (max-width: 1200px) {
  .chat-side-card {
    min-height: auto;
  }

  .chat-main-column {
    height: auto;
    min-height: 0;
  }

  .chat-transcript {
    min-height: 320px;
    max-height: 52vh;
  }
}

@media (max-width: 640px) {
  .chat-side-stats {
    grid-template-columns: 1fr;
  }

  .chat-bubble {
    max-width: 96%;
  }
}
</style>
