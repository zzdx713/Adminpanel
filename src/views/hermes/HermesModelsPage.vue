<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import {
  CheckmarkCircleOutline,
  CloudOutline,
  CubeOutline,
  RefreshOutline,
  SearchOutline,
  ServerOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesModelStore } from '@/stores/hermes/model'
import { useHermesConfigStore } from '@/stores/hermes/config'

const { t } = useI18n()
const modelStore = useHermesModelStore()
const configStore = useHermesConfigStore()
const message = useMessage()

// ---- 筛选状态 ----

const searchQuery = ref('')
const providerFilter = ref<string | null>(null)

const currentModelFromConfig = computed(() => configStore.config?.model || '')

// ---- 统计数据 ----

const totalModels = computed(() => modelStore.models.length)

const activeModelLabel = computed(() => {
  if (!currentModelFromConfig.value) return '-'
  const found = modelStore.models.find((m) => m.id === currentModelFromConfig.value)
  return found?.label || found?.id || currentModelFromConfig.value
})

const uniqueProviders = computed(() => {
  const set = new Set<string>()
  modelStore.models.forEach((m) => {
    if (m.provider) set.add(m.provider)
  })
  return set.size
})

const avgContextWindow = computed(() => {
  const withWindow = modelStore.models.filter((m) => m.contextWindow && m.contextWindow > 0)
  if (withWindow.length === 0) return 0
  const sum = withWindow.reduce((acc, m) => acc + (m.contextWindow || 0), 0)
  return Math.round(sum / withWindow.length)
})

function formatContextWindow(val: number): string {
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M'
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'K'
  return val.toLocaleString()
}

// ---- Provider 筛选选项 ----

const providerOptions = computed<SelectOption[]>(() => {
  const providers = [...new Set(modelStore.models.map((m) => m.provider).filter(Boolean))] as string[]
  return [
    { label: t('pages.hermesModels.allProviders'), value: '__all__' },
    ...providers.map((p) => ({ label: p, value: p })),
  ]
})

// ---- 过滤后的模型列表 ----

const filteredModels = computed(() => {
  let list = modelStore.models
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (m) =>
        (m.label || m.id).toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.provider || '').toLowerCase().includes(q),
    )
  }
  if (providerFilter.value && providerFilter.value !== '__all__') {
    list = list.filter((m) => m.provider === providerFilter.value)
  }
  return list
})

// ---- 能力标签颜色映射 ----

const capabilityColors: Record<string, 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
  chat: 'success',
  completion: 'info',
  vision: 'warning',
  function_calling: 'error',
  tool_use: 'error',
  embedding: 'default',
  image_generation: 'warning',
  code: 'info',
  reasoning: 'success',
}

function getCapabilityType(cap: string): 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error' {
  const lower = cap.toLowerCase()
  for (const [key, type] of Object.entries(capabilityColors)) {
    if (lower.includes(key)) return type
  }
  return 'default'
}

// ---- 生命周期 ----

onMounted(async () => {
  try {
    await Promise.all([modelStore.fetchModels(), configStore.fetchConfig()])
    if (currentModelFromConfig.value) {
      modelStore.syncCurrentModelFromConfig(currentModelFromConfig.value)
    }
  } catch {
    // ignore
  }
})

// ---- 操作 ----

async function handleRefresh() {
  try {
    await modelStore.fetchModels()
  } catch {
    message.error(t('pages.hermesModels.loadFailed'))
  }
}

async function handleSetModel(modelId: string) {
  try {
    await modelStore.setCurrentModel(modelId)
    message.success(t('pages.hermesModels.setModelSuccess', { model: modelId }))
  } catch {
    message.error(t('pages.hermesModels.setModelFailed'))
  }
}
</script>

<template>
  <div class="hermes-models-page">
    <!-- 页面标题 -->
    <div class="hermes-models-header">
      <h2 class="hermes-models-title">{{ t('pages.hermesModels.title') }}</h2>
      <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" :loading="modelStore.loading" @click="handleRefresh">
        <template #icon><NIcon :component="RefreshOutline" /></template>
        {{ t('common.refresh') }}
      </NButton>
    </div>

    <!-- 错误提示 -->
    <NAlert v-if="modelStore.lastError" type="error" :bordered="false" closable class="app-card">
      {{ modelStore.lastError }}
    </NAlert>

    <!-- 概览统计面板 -->
    <NCard :bordered="false" class="app-card hermes-stats-panel">
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--blue">
              <NIcon :component="CubeOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesModels.stats.totalModels') }}</NText>
              <div class="stat-value">{{ totalModels }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--green">
              <NIcon :component="CheckmarkCircleOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesModels.stats.activeModel') }}</NText>
              <div class="stat-value stat-value--text">{{ activeModelLabel }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--purple">
              <NIcon :component="ServerOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesModels.stats.providers') }}</NText>
              <div class="stat-value">{{ uniqueProviders }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--orange">
              <NIcon :component="CloudOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesModels.stats.avgContextWindow') }}</NText>
              <div class="stat-value">{{ formatContextWindow(avgContextWindow) }}</div>
            </div>
          </div>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 搜索与筛选栏 -->
    <NCard :bordered="false" class="app-card hermes-filter-bar">
      <NSpace :size="12" align="center">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.hermesModels.searchPlaceholder')"
          style="width: 280px;"
        >
          <template #prefix><NIcon :component="SearchOutline" /></template>
        </NInput>
        <NSelect
          v-model:value="providerFilter"
          :options="providerOptions"
          :placeholder="t('pages.hermesModels.providerFilter')"
          style="width: 180px;"
          clearable
        />
        <NText v-if="filteredModels.length !== modelStore.models.length" depth="3" style="font-size: 12px; margin-left: auto;">
          {{ filteredModels.length }} / {{ modelStore.models.length }}
        </NText>
      </NSpace>
    </NCard>

    <!-- 模型卡片网格 -->
    <NSpin :show="modelStore.loading">
      <NGrid v-if="filteredModels.length > 0" cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem v-for="model in filteredModels" :key="model.id">
          <div class="model-card-wrapper">
            <NCard class="app-card model-card" :bordered="false">
              <NSpace vertical :size="10">
                <!-- 模型名称 + 当前标记 -->
                <NSpace justify="space-between" align="center">
                  <NText strong class="model-name">{{ model.label || model.id }}</NText>
                  <NTag
                    v-if="model.id === currentModelFromConfig"
                    type="success"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon><NIcon :component="CheckmarkCircleOutline" /></template>
                    {{ t('pages.hermesModels.active') }}
                  </NTag>
                </NSpace>

                <!-- Provider 标签 -->
                <NTag v-if="model.provider" size="small" :bordered="false" round type="info">
                  {{ model.provider }}
                </NTag>

                <!-- 描述 -->
                <NText v-if="model.description" depth="3" class="model-description">
                  {{ model.description }}
                </NText>

                <!-- 上下文窗口 -->
                <NSpace v-if="model.contextWindow" :size="6" align="center">
                  <NText depth="3" style="font-size: 12px;">
                    {{ t('pages.hermesModels.contextWindow') }}:
                  </NText>
                  <NText style="font-size: 12px; font-weight: 600;">
                    {{ model.contextWindow.toLocaleString() }}
                  </NText>
                </NSpace>

                <!-- 能力标签 -->
                <NSpace v-if="model.capabilities?.length" :size="4" wrap>
                  <NTag
                    v-for="cap in model.capabilities"
                    :key="cap"
                    size="tiny"
                    :bordered="false"
                    round
                    :type="getCapabilityType(cap)"
                  >
                    {{ cap }}
                  </NTag>
                </NSpace>

                <!-- 操作按钮 -->
                <div class="model-card-actions">
                  <NButton
                    v-if="model.id !== currentModelFromConfig"
                    size="small"
                    type="primary"
                    secondary
                    class="app-toolbar-btn"
                    @click="handleSetModel(model.id)"
                  >
                    {{ t('pages.hermesModels.setAsCurrent') }}
                  </NButton>
                </div>
              </NSpace>
            </NCard>
          </div>
        </NGridItem>
      </NGrid>

      <!-- 空状态 -->
      <NText v-else-if="!modelStore.loading" depth="3" class="empty-state">
        {{ t('common.empty') }}
      </NText>
    </NSpin>
  </div>
</template>

<style scoped>
.hermes-models-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- 页面标题 ---- */

.hermes-models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hermes-models-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

/* ---- 概览统计面板 ---- */

.hermes-stats-panel {
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.08), rgba(59, 130, 246, 0.08));
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius, 8px);
  flex-shrink: 0;
}

.stat-icon--blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.stat-icon--green {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}

.stat-icon--purple {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}

.stat-icon--orange {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}

.stat-content {
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  display: block;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  margin-top: 4px;
  line-height: 1.2;
}

.stat-value--text {
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

/* ---- 搜索与筛选栏 ---- */

.hermes-filter-bar :deep(.n-card__content) {
  padding: 12px 16px !important;
}

/* ---- 模型卡片 ---- */

.model-card-wrapper {
  height: 100%;
}

.model-card {
  height: 100%;
  border-radius: var(--radius, 8px);
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.model-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.model-name {
  font-size: 15px;
}

.model-description {
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.model-card-actions {
  margin-top: 4px;
}

/* ---- 空状态 ---- */

.empty-state {
  display: block;
  text-align: center;
  padding: 40px 0;
}
</style>
