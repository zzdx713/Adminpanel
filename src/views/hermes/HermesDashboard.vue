<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,
  NGrid,
  NGridItem,
  NIcon,
  NSpace,
  NSpin,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  ChatbubblesOutline,
  ChatboxEllipsesOutline,
  ExtensionPuzzleOutline,
  FlashOutline,
  RefreshOutline,
  SettingsOutline,
  SparklesOutline,
  ListOutline,
  AddOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { useHermesSessionStore } from '@/stores/hermes/session'
import { useHermesModelStore } from '@/stores/hermes/model'
import { useHermesSkillStore } from '@/stores/hermes/skill'
import { formatRelativeTime } from '@/utils/format'
import type { HermesSession } from '@/api/hermes/types'

const router = useRouter()
const { t } = useI18n()
const message = useMessage()

const connStore = useHermesConnectionStore()
const sessionStore = useHermesSessionStore()
const modelStore = useHermesModelStore()
const skillStore = useHermesSkillStore()

const loading = ref(true)
const testingConnection = ref(false)

// ---- Connection Status ----

const connectionLabel = computed(() => {
  if (connStore.hermesConnecting) return t('pages.hermesDashboard.connection.connecting')
  if (connStore.hermesConnected) return t('pages.hermesDashboard.connection.connected')
  if (connStore.hermesError) return t('pages.hermesDashboard.connection.failed')
  return t('pages.hermesDashboard.connection.disconnected')
})

const connectionType = computed<'success' | 'warning' | 'error' | 'default'>(() => {
  if (connStore.hermesConnected) return 'success'
  if (connStore.hermesConnecting) return 'warning'
  if (connStore.hermesError) return 'error'
  return 'default'
})

const gatewayVersion = computed(() => connStore.hermesStatus?.version || '-')

const uptimeDisplay = computed(() => {
  const uptime = connStore.hermesStatus?.uptime
  if (!uptime) return '-'
  return formatUptime(uptime)
})

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return t('pages.hermesDashboard.uptime.days', { days, hours, minutes })
  if (hours > 0) return t('pages.hermesDashboard.uptime.hours', { hours, minutes })
  return t('pages.hermesDashboard.uptime.minutes', { minutes })
}

async function handleTestConnection() {
  testingConnection.value = true
  try {
    const result = await connStore.testConnection(
      connStore.connectionConfig.apiUrl,
      connStore.connectionConfig.apiKey,
    )
    if (result.ok) {
      message.success(t('pages.hermesDashboard.connection.testSuccess'))
    } else {
      message.error(t('pages.hermesDashboard.connection.testFailed', { error: result.error || 'Unknown' }))
    }
  } catch (err) {
    message.error(t('pages.hermesDashboard.connection.testFailed', { error: err instanceof Error ? err.message : String(err) }))
  } finally {
    testingConnection.value = false
  }
}

// ---- Quick Stats ----

const totalSessions = computed(() => sessionStore.sessions.length)

const totalMessages = computed(() =>
  sessionStore.sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0),
)

const activeModels = computed(() =>
  modelStore.models.filter((m) => m.enabled !== false && m.available !== false).length,
)

const enabledSkills = computed(() =>
  skillStore.skills.filter((s) => s.enabled).length,
)

// ---- Recent Sessions ----

const recentSessions = computed(() =>
  [...sessionStore.sessions]
    .sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 5),
)

const sessionColumns = computed<DataTableColumns<HermesSession>>(() => [
  {
    title: t('pages.hermesDashboard.recentSessions.columns.title'),
    key: 'title',
    ellipsis: { tooltip: true },
    minWidth: 150,
    render(row) {
      return row.title || t('pages.hermesDashboard.recentSessions.untitled')
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.model'),
    key: 'model',
    width: 140,
    ellipsis: { tooltip: true },
    render(row) {
      return row.model || '-'
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.messages'),
    key: 'messageCount',
    width: 100,
    align: 'center',
    render(row) {
      return row.messageCount || 0
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.lastUpdated'),
    key: 'updatedAt',
    width: 140,
    render(row) {
      return row.updatedAt ? formatRelativeTime(row.updatedAt) : '-'
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.actions'),
    key: 'actions',
    width: 80,
    align: 'center',
    render(row) {
      return h(
        NButton,
        {
          size: 'small',
          type: 'primary',
          secondary: true,
          class: 'app-toolbar-btn',
          onClick: () => goToChat(row.id),
        },
        { default: () => t('pages.hermesDashboard.recentSessions.chat') },
      )
    },
  },
])

function goToChat(sessionId?: string) {
  if (sessionId) {
    router.push({ name: 'HermesChat', query: { session: sessionId } })
  } else {
    router.push({ name: 'HermesChat' })
  }
}

function viewAllSessions() {
  router.push({ name: 'HermesSessions' })
}

// ---- Active Model ----

const currentModelInfo = computed(() => {
  if (modelStore.currentModel) {
    const found = modelStore.models.find((m) => m.id === modelStore.currentModel)
    if (found) return found
  }
  return modelStore.models.find((m) => m.enabled !== false) || modelStore.models[0] || null
})

function goToModels() {
  router.push({ name: 'HermesModels' })
}

// ---- Quick Actions ----

function newChat() {
  router.push({ name: 'HermesChat' })
}

function manageSessions() {
  router.push({ name: 'HermesSessions' })
}

function configureModels() {
  router.push({ name: 'HermesModels' })
}

function systemSettings() {
  router.push({ name: 'HermesSystem' })
}

// ---- Data Loading ----

async function refreshData() {
  loading.value = true
  try {
    if (!connStore.hermesConnected) {
      await connStore.connect()
    }
    await Promise.allSettled([
      sessionStore.fetchSessions(),
      modelStore.fetchModels(),
      skillStore.fetchSkills(),
    ])
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshData()
})
</script>

<template>
  <NSpin :show="loading">
    <div class="hermes-dashboard">
      <!-- Connection Status Card -->
      <NCard class="app-card hermes-hero" :bordered="false">
        <div class="hermes-hero-top">
          <div class="hermes-hero-info">
            <div class="hermes-hero-title">{{ t('pages.hermesDashboard.hero.title') }}</div>
            <div class="hermes-hero-subtitle">{{ t('pages.hermesDashboard.hero.subtitle') }}</div>
          </div>
          <NSpace :size="12" align="center" wrap>
            <div class="connection-indicator" :class="connectionType">
              <span class="connection-dot" />
              <NText>{{ connectionLabel }}</NText>
            </div>
          </NSpace>
        </div>

        <div class="hermes-hero-details">
          <div class="hero-detail-item">
            <NText depth="3">{{ t('pages.hermesDashboard.connection.version') }}</NText>
            <NText strong>{{ gatewayVersion }}</NText>
          </div>
          <div class="hero-detail-item">
            <NText depth="3">{{ t('pages.hermesDashboard.connection.uptime') }}</NText>
            <NText strong>{{ uptimeDisplay }}</NText>
          </div>
          <NButton
            class="app-toolbar-btn"
            :loading="testingConnection"
            @click="handleTestConnection"
          >
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.hermesDashboard.connection.testConnection') }}
          </NButton>
        </div>
      </NCard>

      <!-- Quick Stats Grid -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard class="app-card stat-card stat-card--sessions" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(24, 160, 88, 0.15); color: #18a058;">
                <NIcon :size="24" :component="ChatbubblesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ totalSessions }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.sessions') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--messages" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(42, 127, 255, 0.15); color: #2a7fff;">
                <NIcon :size="24" :component="ChatboxEllipsesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ totalMessages }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.messages') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--models" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(208, 48, 80, 0.15); color: #d03050;">
                <NIcon :size="24" :component="SparklesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ activeModels }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.models') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--skills" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                <NIcon :size="24" :component="ExtensionPuzzleOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ enabledSkills }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.skills') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Recent Sessions + Active Model -->
      <NGrid cols="1 l:3" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem :span="2">
          <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.recentSessions.title')">
            <template #header-extra>
              <NButton text type="primary" @click="viewAllSessions">
                {{ t('pages.hermesDashboard.recentSessions.viewAll') }}
              </NButton>
            </template>
            <NDataTable
              :columns="sessionColumns"
              :data="recentSessions"
              :bordered="false"
              :single-line="false"
              size="small"
              :row-props="(row: HermesSession) => ({
                style: 'cursor: pointer;',
                onClick: () => goToChat(row.id),
              })"
            />
          </NCard>
        </NGridItem>

        <NGridItem :span="1">
          <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.activeModel.title')">
            <template v-if="currentModelInfo">
              <div class="active-model-info">
                <div class="active-model-name">{{ currentModelInfo.label || currentModelInfo.id }}</div>
                <div class="active-model-provider">
                  <NTag size="small" :bordered="false" round type="info">
                    {{ currentModelInfo.provider || 'Unknown' }}
                  </NTag>
                </div>
                <div v-if="currentModelInfo.description" class="active-model-desc">
                  <NText depth="3">{{ currentModelInfo.description }}</NText>
                </div>
                <NButton
                  class="app-toolbar-btn"
                  type="primary"
                  secondary
                  block
                  style="margin-top: 12px;"
                  @click="goToModels"
                >
                  <template #icon><NIcon :component="SparklesOutline" /></template>
                  {{ t('pages.hermesDashboard.activeModel.changeModel') }}
                </NButton>
              </div>
            </template>
            <div v-else class="active-model-empty">
              <NText depth="3">{{ t('pages.hermesDashboard.activeModel.noModel') }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Quick Actions -->
      <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.quickActions.title')">
        <div class="quick-actions-grid">
          <div class="quick-action-item" @click="newChat">
            <div class="quick-action-icon" style="background: rgba(24, 160, 88, 0.12); color: #18a058;">
              <NIcon :size="22" :component="AddOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.newChat') }}</div>
          </div>
          <div class="quick-action-item" @click="manageSessions">
            <div class="quick-action-icon" style="background: rgba(42, 127, 255, 0.12); color: #2a7fff;">
              <NIcon :size="22" :component="ListOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.manageSessions') }}</div>
          </div>
          <div class="quick-action-item" @click="configureModels">
            <div class="quick-action-icon" style="background: rgba(208, 48, 80, 0.12); color: #d03050;">
              <NIcon :size="22" :component="SparklesOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.configureModels') }}</div>
          </div>
          <div class="quick-action-item" @click="systemSettings">
            <div class="quick-action-icon" style="background: rgba(139, 92, 246, 0.12); color: #8b5cf6;">
              <NIcon :size="22" :component="SettingsOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.systemSettings') }}</div>
          </div>
        </div>
      </NCard>
    </div>
  </NSpin>
</template>

<style scoped>
.hermes-dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Hero Card ---- */

.hermes-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 16%, rgba(42, 127, 255, 0.22), transparent 36%),
    linear-gradient(120deg, var(--bg-card), rgba(42, 127, 255, 0.08));
  border: 1px solid rgba(42, 127, 255, 0.18);
}

.hermes-hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.hermes-hero-info {
  flex: 1;
  min-width: 200px;
}

.hermes-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.hermes-hero-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.hermes-hero-details {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.hero-detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-detail-item .n-text {
  font-size: 13px;
}

.hero-detail-item .n-text strong,
.hero-detail-item .n-text[class*="strong"] {
  font-size: 15px;
}

/* ---- Connection Indicator ---- */

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.connection-indicator.success {
  background: rgba(24, 160, 88, 0.12);
  color: #18a058;
}

.connection-indicator.warning {
  background: rgba(240, 160, 32, 0.12);
  color: #f0a020;
}

.connection-indicator.error {
  background: rgba(208, 48, 80, 0.12);
  color: #d03050;
}

.connection-indicator.default {
  background: rgba(150, 150, 150, 0.12);
  color: #999;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.connection-indicator.success .connection-dot {
  background: #18a058;
  box-shadow: 0 0 6px rgba(24, 160, 88, 0.5);
}

.connection-indicator.warning .connection-dot {
  background: #f0a020;
  box-shadow: 0 0 6px rgba(240, 160, 32, 0.5);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.connection-indicator.error .connection-dot {
  background: #d03050;
  box-shadow: 0 0 6px rgba(208, 48, 80, 0.5);
}

.connection-indicator.default .connection-dot {
  background: #999;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ---- Stat Cards ---- */

.stat-card {
  border-radius: var(--radius-lg);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.stat-card--sessions {
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.08), rgba(24, 160, 88, 0.02));
  border: 1px solid rgba(24, 160, 88, 0.15);
}

.stat-card--messages {
  background: linear-gradient(135deg, rgba(42, 127, 255, 0.08), rgba(42, 127, 255, 0.02));
  border: 1px solid rgba(42, 127, 255, 0.15);
}

.stat-card--models {
  background: linear-gradient(135deg, rgba(208, 48, 80, 0.08), rgba(208, 48, 80, 0.02));
  border: 1px solid rgba(208, 48, 80, 0.15);
}

.stat-card--skills {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.02));
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.stat-card-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card-content {
  flex: 1;
  min-width: 0;
}

.stat-card-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-card-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ---- Cards ---- */

.hermes-card {
  border-radius: var(--radius-lg);
}

/* ---- Active Model ---- */

.active-model-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.active-model-name {
  font-size: 16px;
  font-weight: 600;
}

.active-model-desc {
  font-size: 13px;
  line-height: 1.5;
}

.active-model-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

/* ---- Quick Actions ---- */

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.quick-action-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  border-color: rgba(42, 127, 255, 0.3);
}

.quick-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-action-label {
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}

/* ---- Responsive ---- */

@media (max-width: 900px) {
  .hermes-hero-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .quick-actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .quick-actions-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
