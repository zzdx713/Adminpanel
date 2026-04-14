<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NIcon,
  NSpace,
  NTag,
  NText,
  NSpin,
  NInput,
  NSelect,
  NSwitch,
  NInputNumber,
  NDynamicTags,
  NCollapse,
  NCollapseItem,
  NTooltip,
  NPopconfirm,
  NEmpty,
  NDivider,
  useMessage,
} from 'naive-ui'
import {
  PlayOutline,
  StopOutline,
  ExpandOutline,
  ContractOutline,
  RefreshOutline,
  AddOutline,
  LinkOutline,
  TrashOutline,
  CreateOutline,
  LogOutOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesCliStore, type HermesCliSessionInfo } from '@/stores/hermes-cli'

const message = useMessage()
const { t } = useI18n()
const hermesCliStore = useHermesCliStore()

const terminalContainerRef = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
const showFullscreenHint = ref(false)
const terminalLoading = ref(true)
const terminalError = ref<string | null>(null)

const terminal = shallowRef<any>(null)
const fitAddon = shallowRef<any>(null)
const resizeObserver = shallowRef<ResizeObserver | null>(null)

// Launch config state
const showLaunchConfig = ref(false)

const launchConfigExpandedNames = computed<string[]>(() =>
  showLaunchConfig.value ? ['launch-config'] : [],
)

function onLaunchConfigChange(names: string[]) {
  showLaunchConfig.value = names.includes('launch-config')
}
const launchConfig = ref({
  model: '',
  provider: null as string | null,
  skills: [] as string[],
  toolsets: '',
  resumeSession: '',
  continueSession: '',
  yolo: false,
  checkpoints: false,
  maxTurns: null as number | null,
  verbose: false,
  quiet: false,
  source: '',
})

const providerOptions = computed(() => [
  { label: 'auto', value: 'auto' },
  { label: 'openrouter', value: 'openrouter' },
  { label: 'anthropic', value: 'anthropic' },
  { label: 'gemini', value: 'gemini' },
  { label: 'custom', value: 'custom' },
])

function buildCliArgs(): string[] {
  const args: string[] = ['chat']
  if (launchConfig.value.model) {
    args.push('-m', launchConfig.value.model)
  }
  if (launchConfig.value.provider) {
    args.push('--provider', launchConfig.value.provider)
  }
  for (const skill of launchConfig.value.skills) {
    args.push('-s', skill)
  }
  if (launchConfig.value.toolsets) {
    args.push('-t', launchConfig.value.toolsets)
  }
  if (launchConfig.value.resumeSession) {
    args.push('-r', launchConfig.value.resumeSession)
  }
  if (launchConfig.value.continueSession) {
    args.push('-c', launchConfig.value.continueSession)
  }
  if (launchConfig.value.yolo) {
    args.push('--yolo')
  }
  if (launchConfig.value.checkpoints) {
    args.push('--checkpoints')
  }
  if (launchConfig.value.maxTurns !== null) {
    args.push('--max-turns', String(launchConfig.value.maxTurns))
  }
  if (launchConfig.value.verbose) {
    args.push('-v')
  }
  if (launchConfig.value.quiet) {
    args.push('-Q')
  }
  if (launchConfig.value.source) {
    args.push('--source', launchConfig.value.source)
  }
  return args
}

// Session management
const editingSessionId = ref<string | null>(null)
const editingSessionName = ref('')

const connectedSessions = computed(() =>
  hermesCliStore.sessions.filter(s => s.status === 'connected'),
)

const backgroundSessions = computed(() =>
  hermesCliStore.sessions.filter(s => s.status === 'running'),
)

const connectionTagType = computed<'success' | 'warning' | 'error' | 'default'>(() => {
  if (hermesCliStore.isConnected) return 'success'
  if (hermesCliStore.isConnecting) return 'warning'
  if (hermesCliStore.error) return 'error'
  return 'default'
})

const connectionLabel = computed(() => {
  if (hermesCliStore.isConnected) return t('pages.hermesCli.connected')
  if (hermesCliStore.isConnecting) return t('pages.hermesCli.connecting')
  if (hermesCliStore.error) return t('pages.hermesCli.error')
  return t('pages.hermesCli.disconnected')
})

function getSessionDisplayName(session: HermesCliSessionInfo): string {
  return session.name || session.id.slice(0, 8) + '...'
}

function isCurrentSession(session: HermesCliSessionInfo): boolean {
  return hermesCliStore.currentSession?.id === session.id
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

async function initTerminal() {
  if (!terminalContainerRef.value) return

  terminalLoading.value = true
  terminalError.value = null

  try {
    const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
    ])

    if (terminal.value) {
      terminal.value.dispose()
    }

    terminal.value = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace",
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: true,
      cols: 120,
      rows: 36,
    })

    fitAddon.value = new FitAddon()
    terminal.value.loadAddon(fitAddon.value)
    terminal.value.loadAddon(new WebLinksAddon())

    terminal.value.open(terminalContainerRef.value)

    setTimeout(() => {
      fitAddon.value?.fit()
    }, 100)

    terminal.value.onData((data: string) => {
      if (data === '\x1b' && isFullscreen.value) {
        isFullscreen.value = false
        return
      }
      if (hermesCliStore.isConnected) {
        hermesCliStore.sendInput(data)
      }
    })

    terminal.value.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (hermesCliStore.isConnected) {
        hermesCliStore.resize(cols, rows)
      }
    })

    terminal.value.onSelectionChange(() => {
      const selection = terminal.value?.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          message.success(t('pages.hermesCli.copied'), { duration: 1500 })
        }).catch(() => {
          // Ignore copy errors
        })
      }
    })

    hermesCliStore.onOutput((data: string) => {
      if (terminal.value) {
        terminal.value.write(data)
      }
    })

    hermesCliStore.onConnected((sessionId: string) => {
      if (hermesCliStore.isReconnect) {
        terminal.value?.write('\x1b[32m\x1b[1mReconnected to Hermes CLI\x1b[0m\r\n')
      } else {
        terminal.value?.write('\x1b[32m\x1b[1mConnected to Hermes CLI\x1b[0m\r\n')
      }
      const name = hermesCliStore.currentSession?.name
      if (name) {
        terminal.value?.write(`\x1b[36mSession: ${name}\x1b[0m\r\n`)
      } else {
        terminal.value?.write(`\x1b[36mSession: ${sessionId.slice(0, 8)}...\x1b[0m\r\n`)
      }
      terminal.value?.write('\r\n')
    })

    hermesCliStore.onDisconnected(() => {
      terminal.value?.write('\r\n\x1b[33mConnection closed (process still running in background)\x1b[0m\r\n')
    })

    terminalContainerRef.value.addEventListener('contextmenu', async (e: MouseEvent) => {
      e.preventDefault()
      if (!hermesCliStore.isConnected) return

      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          hermesCliStore.sendInput(text)
          message.success(t('pages.hermesCli.pasted'), { duration: 1500 })
        }
      } catch {
        // Ignore paste errors
      }
    })

    resizeObserver.value = new ResizeObserver(() => {
      fitAddon.value?.fit()
    })
    resizeObserver.value.observe(terminalContainerRef.value)

    terminalLoading.value = false
  } catch (e) {
    terminalLoading.value = false
    terminalError.value = e instanceof Error ? e.message : 'Failed to initialize terminal'
    console.error('Hermes CLI terminal init error:', e)
  }
}

async function handleNewSession() {
  if (!showLaunchConfig.value) {
    showLaunchConfig.value = true
    return
  }

  // Clear terminal before new session
  terminal.value?.clear()
  terminal.value?.write('\x1b[33mLaunching new session...\x1b[0m\r\n')

  const args = buildCliArgs()
  try {
    await hermesCliStore.connectNew(args, 120, 36)
  } catch {
    terminal.value?.write('\x1b[31mFailed to launch session\x1b[0m\r\n')
  }
}

async function handleReconnectSession(session: HermesCliSessionInfo) {
  if (isCurrentSession(session) && hermesCliStore.isConnected) {
    return
  }

  terminal.value?.clear()
  terminal.value?.write('\x1b[33mReconnecting to session...\x1b[0m\r\n')

  try {
    await hermesCliStore.connect(120, 36, session.id)
  } catch {
    terminal.value?.write('\x1b[31mFailed to reconnect\x1b[0m\r\n')
  }
}

async function handleDetach() {
  hermesCliStore.detach()
  message.info(t('pages.hermesCli.detachHint'), { duration: 3000 })
}

async function handleDestroy() {
  await hermesCliStore.destroy()
  terminal.value?.clear()
}

function handleConnect() {
  if (hermesCliStore.isConnected) {
    handleDetach()
  } else if (hermesCliStore.currentSession) {
    // Reconnect to last session
    handleReconnectSession({ id: hermesCliStore.currentSession.id, name: hermesCliStore.currentSession.name || null, args: [], createdAt: 0, lastHeartbeat: 0, status: 'running' })
  } else {
    handleNewSession()
  }
}

function handleClear() {
  terminal.value?.clear()
}

function handleFullscreen() {
  isFullscreen.value = !isFullscreen.value

  if (isFullscreen.value) {
    showFullscreenHint.value = true
    setTimeout(() => {
      showFullscreenHint.value = false
    }, 3000)
  }

  nextTick(() => {
    setTimeout(() => {
      fitAddon.value?.fit()
    }, 100)
  })
}

function handleTerminalResize() {
  fitAddon.value?.fit()
}

watch(isFullscreen, () => {
  nextTick(() => {
    setTimeout(() => {
      fitAddon.value?.fit()
    }, 100)
  })
})

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
  }
}

function startEditSession(session: HermesCliSessionInfo) {
  editingSessionId.value = session.id
  editingSessionName.value = session.name || ''
}

async function confirmRenameSession() {
  if (editingSessionId.value && editingSessionName.value.trim()) {
    const ok = await hermesCliStore.renameSession(editingSessionId.value, editingSessionName.value.trim())
    if (ok) {
      message.success(t('common.saveSuccess') || 'Saved')
    }
  }
  editingSessionId.value = null
  editingSessionName.value = ''
}

function cancelEditSession() {
  editingSessionId.value = null
  editingSessionName.value = ''
}

async function handleDestroySession(session: HermesCliSessionInfo) {
  try {
    const authStore = await import('@/stores/auth').then(m => m.useAuthStore())
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = authStore.getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    await fetch('/api/hermes-cli/destroy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId: session.id }),
    })

    if (isCurrentSession(session)) {
      hermesCliStore.disconnect()
      terminal.value?.clear()
    }

    hermesCliStore.fetchSessions()
  } catch {
    // Ignore
  }
}

onMounted(async () => {
  await initTerminal()
  window.addEventListener('resize', handleTerminalResize)
  window.addEventListener('keydown', handleKeyDown)

  // Fetch existing sessions
  await hermesCliStore.fetchSessions()

  // Auto-connect to last session if available, otherwise create new
  if (hermesCliStore.sessions.length > 0) {
    const lastSession = hermesCliStore.sessions[hermesCliStore.sessions.length - 1]!
    if (lastSession.status === 'running') {
      try {
        await hermesCliStore.connect(120, 36, lastSession.id!)
      } catch {
        // Fall through to new session
      }
    }
  }

  if (!hermesCliStore.isConnected) {
    try {
      await hermesCliStore.connectNew([], 120, 36)
    } catch {
      // Connection will be handled by error state
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleTerminalResize)
  window.removeEventListener('keydown', handleKeyDown)
  if (resizeObserver.value) {
    resizeObserver.value.disconnect()
  }
  if (hermesCliStore.isConnected) {
    hermesCliStore.detach()
  }
  if (terminal.value) {
    terminal.value.dispose()
  }
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Session List Card -->
    <NCard :title="t('pages.hermesCli.runningSessions')" class="app-card" size="small">
      <template #header-extra>
        <NButton
          type="primary"
          size="small"
          class="app-toolbar-btn"
          @click="handleNewSession"
        >
          <template #icon><NIcon :component="AddOutline" /></template>
          {{ t('pages.hermesCli.newSession') }}
        </NButton>
      </template>

      <div v-if="hermesCliStore.sessions.length === 0" style="padding: 8px 0;">
        <NEmpty :description="t('pages.hermesCli.noSessions')" size="small" />
      </div>

      <template v-else>
        <!-- Connected sessions -->
        <template v-if="connectedSessions.length > 0">
          <NText depth="3" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            {{ t('pages.hermesCli.connectedSessions') }} ({{ connectedSessions.length }})
          </NText>
          <div style="margin-top: 6px;">
            <div
              v-for="session in connectedSessions"
              :key="session.id"
              class="session-item session-item--active"
            >
              <div class="session-item__info">
                <NTag type="success" :bordered="false" size="small" round style="margin-right: 8px;">
                  {{ t('pages.hermesCli.connected') }}
                </NTag>
                <!-- Editable name -->
                <template v-if="editingSessionId === session.id">
                  <NInput
                    v-model:value="editingSessionName"
                    size="tiny"
                    style="width: 160px; margin-right: 4px;"
                    @keyup.enter="confirmRenameSession"
                    @keyup.escape="cancelEditSession"
                  />
                  <NButton size="tiny" type="primary" quaternary @click="confirmRenameSession">
                    {{ t('common.confirm') }}
                  </NButton>
                  <NButton size="tiny" quaternary @click="cancelEditSession">
                    {{ t('common.cancel') }}
                  </NButton>
                </template>
                <template v-else>
                  <NText strong style="font-size: 13px;">{{ getSessionDisplayName(session) }}</NText>
                  <NButton
                    size="tiny"
                    quaternary
                    style="margin-left: 4px;"
                    @click="startEditSession(session)"
                  >
                    <template #icon><NIcon :component="CreateOutline" /></template>
                  </NButton>
                </template>
                <NText depth="3" style="font-size: 11px; margin-left: 8px;">
                  {{ formatTime(session.createdAt) }}
                </NText>
              </div>
              <div class="session-item__actions">
                <NTooltip trigger="hover">
                  <template #trigger>
                    <NButton size="tiny" quaternary @click="handleDetach">
                      <template #icon><NIcon :component="LogOutOutline" /></template>
                    </NButton>
                  </template>
                  {{ t('pages.hermesCli.detach') }}
                </NTooltip>
                <NPopconfirm @positive-click="handleDestroySession(session)">
                  <template #trigger>
                    <NButton size="tiny" quaternary type="error">
                      <template #icon><NIcon :component="TrashOutline" /></template>
                    </NButton>
                  </template>
                  {{ t('common.confirm') }}?
                </NPopconfirm>
              </div>
            </div>
          </div>
        </template>

        <!-- Background sessions -->
        <template v-if="backgroundSessions.length > 0">
          <NDivider v-if="connectedSessions.length > 0" style="margin: 8px 0;" />
          <NText depth="3" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            {{ t('pages.hermesCli.backgroundSessions') }} ({{ backgroundSessions.length }})
          </NText>
          <div style="margin-top: 6px;">
            <div
              v-for="session in backgroundSessions"
              :key="session.id"
              class="session-item"
            >
              <div class="session-item__info">
                <NTag type="warning" :bordered="false" size="small" round style="margin-right: 8px;">
                  {{ t('pages.hermesCli.background') }}
                </NTag>
                <template v-if="editingSessionId === session.id">
                  <NInput
                    v-model:value="editingSessionName"
                    size="tiny"
                    style="width: 160px; margin-right: 4px;"
                    @keyup.enter="confirmRenameSession"
                    @keyup.escape="cancelEditSession"
                  />
                  <NButton size="tiny" type="primary" quaternary @click="confirmRenameSession">
                    {{ t('common.confirm') }}
                  </NButton>
                  <NButton size="tiny" quaternary @click="cancelEditSession">
                    {{ t('common.cancel') }}
                  </NButton>
                </template>
                <template v-else>
                  <NText style="font-size: 13px;">{{ getSessionDisplayName(session) }}</NText>
                  <NButton
                    size="tiny"
                    quaternary
                    style="margin-left: 4px;"
                    @click="startEditSession(session)"
                  >
                    <template #icon><NIcon :component="CreateOutline" /></template>
                  </NButton>
                </template>
                <NText depth="3" style="font-size: 11px; margin-left: 8px;">
                  {{ formatTime(session.createdAt) }}
                </NText>
              </div>
              <div class="session-item__actions">
                <NTooltip trigger="hover">
                  <template #trigger>
                    <NButton size="tiny" type="primary" quaternary @click="handleReconnectSession(session)">
                      <template #icon><NIcon :component="LinkOutline" /></template>
                    </NButton>
                  </template>
                  {{ t('pages.hermesCli.reconnect') }}
                </NTooltip>
                <NPopconfirm @positive-click="handleDestroySession(session)">
                  <template #trigger>
                    <NButton size="tiny" quaternary type="error">
                      <template #icon><NIcon :component="TrashOutline" /></template>
                    </NButton>
                  </template>
                  {{ t('common.confirm') }}?
                </NPopconfirm>
              </div>
            </div>
          </div>
        </template>
      </template>
    </NCard>

    <!-- Launch Config Panel -->
    <NCollapse :expanded-names="launchConfigExpandedNames" class="app-card" @update:expanded-names="onLaunchConfigChange">
      <NCollapseItem
        :title="t('pages.hermesCli.launchConfig')"
        name="launch-config"
      >
        <template #header-extra>
          <NButton
            type="primary"
            size="small"
            class="app-toolbar-btn"
            @click.stop="handleNewSession"
          >
            <template #icon><NIcon :component="PlayOutline" /></template>
            {{ t('pages.hermesCli.launch') }}
          </NButton>
        </template>

        <NSpace vertical :size="12">
          <!-- Model & Provider -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.model') }}</NText>
            <NInput
              v-model:value="launchConfig.model"
              :placeholder="'anthropic/claude-sonnet-4'"
              style="width: 300px;"
            />
          </NSpace>

          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.provider') }}</NText>
            <NSelect
              v-model:value="launchConfig.provider"
              :options="providerOptions"
              :placeholder="'auto'"
              clearable
              style="width: 300px;"
            />
          </NSpace>

          <!-- Skills -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.skills') }}</NText>
            <NDynamicTags v-model:value="launchConfig.skills" style="width: 300px;" />
          </NSpace>

          <!-- Toolsets -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.toolsets') }}</NText>
            <NInput
              v-model:value="launchConfig.toolsets"
              :placeholder="'tool1,tool2'"
              style="width: 300px;"
            />
          </NSpace>

          <!-- Resume & Continue -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.resumeSession') }}</NText>
            <NInput
              v-model:value="launchConfig.resumeSession"
              :placeholder="'session-id'"
              style="width: 300px;"
            />
          </NSpace>

          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.continueSession') }}</NText>
            <NInput
              v-model:value="launchConfig.continueSession"
              :placeholder="'session-name'"
              style="width: 300px;"
            />
          </NSpace>

          <!-- Toggles -->
          <NSpace :size="24" align="center" style="padding-left: 92px;">
            <NSpace :size="8" align="center">
              <NSwitch v-model:value="launchConfig.yolo" />
              <NText>{{ t('pages.hermesCli.yoloMode') }}</NText>
            </NSpace>
            <NSpace :size="8" align="center">
              <NSwitch v-model:value="launchConfig.checkpoints" />
              <NText>{{ t('pages.hermesCli.checkpoints') }}</NText>
            </NSpace>
          </NSpace>

          <NSpace :size="24" align="center" style="padding-left: 92px;">
            <NSpace :size="8" align="center">
              <NSwitch v-model:value="launchConfig.verbose" />
              <NText>{{ t('pages.hermesCli.verbose') }}</NText>
            </NSpace>
            <NSpace :size="8" align="center">
              <NSwitch v-model:value="launchConfig.quiet" />
              <NText>{{ t('pages.hermesCli.quiet') }}</NText>
            </NSpace>
          </NSpace>

          <!-- Max Turns -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.maxTurns') }}</NText>
            <NInputNumber
              v-model:value="launchConfig.maxTurns"
              :min="1"
              :max="1000"
              clearable
              style="width: 300px;"
            />
          </NSpace>

          <!-- Source -->
          <NSpace :size="12" align="center">
            <NText style="min-width: 80px; text-align: right;">{{ t('pages.hermesCli.source') }}</NText>
            <NInput
              v-model:value="launchConfig.source"
              :placeholder="'label'"
              style="width: 300px;"
            />
          </NSpace>
        </NSpace>
      </NCollapseItem>
    </NCollapse>

    <!-- Terminal Header Card -->
    <NCard :title="t('pages.hermesCli.title')" class="app-card">
      <template #header-extra>
        <NSpace :size="8" align="center">
          <NButton
            size="small"
            class="app-toolbar-btn"
            @click="handleClear"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
          </NButton>
          <NButton
            size="small"
            class="app-toolbar-btn"
            @click="handleFullscreen"
          >
            <template #icon>
              <NIcon :component="isFullscreen ? ContractOutline : ExpandOutline" />
            </template>
            {{ isFullscreen ? t('pages.hermesCli.exitFullscreen') : t('pages.hermesCli.fullscreen') }}
          </NButton>
          <NTooltip v-if="hermesCliStore.isConnected" trigger="hover">
            <template #trigger>
              <NButton
                size="small"
                class="app-toolbar-btn"
                @click="handleDetach"
              >
                <template #icon><NIcon :component="LogOutOutline" /></template>
                {{ t('pages.hermesCli.detach') }}
              </NButton>
            </template>
            {{ t('pages.hermesCli.detachHint') }}
          </NTooltip>
          <NPopconfirm v-if="hermesCliStore.isConnected" @positive-click="handleDestroy">
            <template #trigger>
              <NButton
                type="error"
                size="small"
                class="app-toolbar-btn"
              >
                <template #icon><NIcon :component="StopOutline" /></template>
                {{ t('pages.hermesCli.disconnect') }}
              </NButton>
            </template>
            {{ t('common.confirm') }}?
          </NPopconfirm>
          <NButton
            v-else
            type="primary"
            size="small"
            class="app-toolbar-btn"
            @click="handleConnect"
          >
            <template #icon>
              <NIcon :component="PlayOutline" />
            </template>
            {{ t('pages.hermesCli.reconnect') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace :size="12" align="center" style="flex-wrap: wrap; margin-bottom: 12px;">
        <NTag :type="connectionTagType" :bordered="false" round>
          {{ connectionLabel }}
        </NTag>
        <NTag v-if="hermesCliStore.currentSession" type="info" :bordered="false" round>
          {{ hermesCliStore.currentSession.name || (t('pages.hermesCli.session') + ': ' + hermesCliStore.currentSession.id.slice(0, 8) + '...') }}
        </NTag>
        <NText v-if="hermesCliStore.currentSession" depth="3" style="font-size: 12px;">
          {{ hermesCliStore.currentSession.cols }}x{{ hermesCliStore.currentSession.rows }}
        </NText>
      </NSpace>

      <NAlert
        v-if="hermesCliStore.error"
        type="error"
        :bordered="false"
        style="margin-bottom: 12px;"
      >
        {{ hermesCliStore.error }}
      </NAlert>
    </NCard>

    <!-- Terminal Card -->
    <NCard
      class="app-card terminal-container"
      :class="{ 'terminal-container--fullscreen': isFullscreen }"
    >
      <div v-if="isFullscreen && showFullscreenHint" class="fullscreen-hint">
        {{ t('pages.hermesCli.pressEscToExit') }}
      </div>
      <NSpin :show="terminalLoading">
        <NAlert
          v-if="terminalError"
          type="error"
          :bordered="false"
          style="margin-bottom: 12px;"
        >
          {{ terminalError }}
        </NAlert>
        <div ref="terminalContainerRef" class="terminal-xterm-wrapper"></div>
      </NSpin>
    </NCard>
  </NSpace>
</template>

<style>
@import '@xterm/xterm/css/xterm.css';

.terminal-container {
  position: relative;
}

.terminal-container--fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  border-radius: 0;
}

.terminal-container--fullscreen :deep(.n-card__content) {
  padding: 0;
  height: 100%;
}

.fullscreen-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 10;
  pointer-events: none;
  animation: fadeInOut 3s ease-in-out;
}

@keyframes fadeInOut {
  0% { opacity: 0; }
  10% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}

.terminal-xterm-wrapper {
  height: calc(100vh - 280px);
  min-height: 300px;
  background: #1e1e1e;
  border-radius: 8px;
  padding: 8px;
}

.terminal-container--fullscreen .terminal-xterm-wrapper {
  height: 100vh;
  border-radius: 0;
}

.terminal-xterm-wrapper .xterm {
  height: 100%;
}

.terminal-xterm-wrapper .xterm-viewport {
  border-radius: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background-color 0.2s;
}

.session-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.session-item--active {
  background-color: rgba(82, 196, 26, 0.06);
}

.session-item--active:hover {
  background-color: rgba(82, 196, 26, 0.1);
}

.session-item__info {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.session-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .terminal-xterm-wrapper {
    height: calc(100vh - 350px);
    min-height: 250px;
  }
}
</style>
