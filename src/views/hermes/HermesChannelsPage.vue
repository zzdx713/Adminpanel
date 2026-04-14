<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NCard,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import {
  CloudOutline,
  CheckmarkCircleOutline,
  PowerOutline,
  AlertCircleOutline,
  RefreshOutline,
  SearchOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesChannelStore } from '@/stores/hermes/channel'

const { t } = useI18n()
const channelStore = useHermesChannelStore()
const message = useMessage()

// ---- 搜索与筛选 ----

const searchQuery = ref('')
const statusFilter = ref<string>('all')

type StatusFilterValue = 'all' | 'configured' | 'notConfigured' | 'enabled' | 'disabled'

const statusOptions = computed(() => [
  { label: t('pages.hermesChannels.filter.all'), value: 'all' },
  { label: t('pages.hermesChannels.filter.configured'), value: 'configured' },
  { label: t('pages.hermesChannels.filter.notConfigured'), value: 'notConfigured' },
  { label: t('pages.hermesChannels.filter.enabled'), value: 'enabled' },
  { label: t('pages.hermesChannels.filter.disabled'), value: 'disabled' },
])

const filteredPlatforms = computed(() => {
  let list = channelStore.platforms

  // 按搜索关键词过滤
  if (searchQuery.value.trim()) {
    const keyword = searchQuery.value.trim().toLowerCase()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        p.type.toLowerCase().includes(keyword),
    )
  }

  // 按状态筛选
  const filter = statusFilter.value as StatusFilterValue
  if (filter === 'configured') {
    list = list.filter((p) => p.configured)
  } else if (filter === 'notConfigured') {
    list = list.filter((p) => !p.configured)
  } else if (filter === 'enabled') {
    list = list.filter((p) => p.enabled)
  } else if (filter === 'disabled') {
    list = list.filter((p) => !p.enabled)
  }

  return list
})

// ---- 统计面板 ----

const stats = computed(() => {
  const all = channelStore.platforms
  return {
    total: all.length,
    configured: all.filter((p) => p.configured).length,
    enabled: all.filter((p) => p.enabled).length,
    notConfigured: all.filter((p) => !p.configured).length,
  }
})

// ---- 生命周期 ----

onMounted(() => {
  channelStore.fetchPlatforms().catch(() => {
    message.error(t('pages.hermesChannels.loadFailed'))
  })
})

// ---- 操作 ----

async function handleRefresh() {
  try {
    await channelStore.fetchPlatforms()
  } catch {
    message.error(t('pages.hermesChannels.loadFailed'))
  }
}

async function handleToggle(platformId: string, enabled: boolean) {
  try {
    await channelStore.updatePlatform(platformId, { enabled })
    message.success(
      enabled
        ? t('pages.hermesChannels.enableSuccess')
        : t('pages.hermesChannels.disableSuccess'),
    )
  } catch {
    message.error(t('pages.hermesChannels.toggleFailed'))
  }
}
</script>

<template>
  <div class="hermes-channels-page">
    <!-- 顶部 Hero 面板：标题 + 统计 -->
    <NCard :bordered="false" class="hermes-hero">
      <div class="hermes-hero-header">
        <NSpace align="center" :size="10">
          <NIcon :component="CloudOutline" :size="22" style="color: var(--primary-color);" />
          <span class="hermes-hero-title">{{ t('pages.hermesChannels.title') }}</span>
        </NSpace>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.hermesChannels.subtitle') }}
        </NText>
      </div>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10" style="margin-top: 16px;">
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.total') }}</NText>
              <NIcon :component="CloudOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.total }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.configured') }}</NText>
              <NIcon :component="CheckmarkCircleOutline" style="color: var(--success-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--success-color);">
              {{ stats.configured }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.enabled') }}</NText>
              <NIcon :component="PowerOutline" style="color: var(--primary-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--primary-color);">
              {{ stats.enabled }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.notConfigured') }}</NText>
              <NIcon :component="AlertCircleOutline" style="color: var(--warning-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--warning-color);">
              {{ stats.notConfigured }}
            </div>
          </NCard>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 搜索与筛选栏 -->
    <NCard :bordered="false" class="app-card hermes-filter-card">
      <div class="hermes-filter-bar">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.hermesChannels.searchPlaceholder')"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          style="min-width: 160px;"
        />
        <NIcon
          :component="RefreshOutline"
          :size="20"
          class="hermes-refresh-icon"
          :class="{ 'is-loading': channelStore.loading }"
          @click="handleRefresh"
        />
      </div>
    </NCard>

    <!-- 错误提示 -->
    <NAlert v-if="channelStore.lastError" type="error" :bordered="false" closable>
      {{ channelStore.lastError }}
    </NAlert>

    <!-- 平台卡片列表 -->
    <NSpin :show="channelStore.loading">
      <NGrid
        v-if="filteredPlatforms.length > 0"
        cols="1 s:2 m:3"
        responsive="screen"
        :x-gap="12"
        :y-gap="12"
      >
        <NGridItem v-for="platform in filteredPlatforms" :key="platform.id">
          <NCard class="app-card hermes-platform-card" hoverable>
            <NSpace vertical :size="12">
              <!-- 头部：名称 + 状态标签 -->
              <NSpace justify="space-between" align="center">
                <NText strong style="font-size: 15px;">{{ platform.name }}</NText>
                <NSpace :size="6">
                  <NTag
                    :type="platform.configured ? 'success' : 'warning'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    {{
                      platform.configured
                        ? t('pages.hermesChannels.configured')
                        : t('pages.hermesChannels.notConfigured')
                    }}
                  </NTag>
                </NSpace>
              </NSpace>

              <!-- 类型标签 -->
              <NTag size="small" :bordered="false" type="info">
                {{ t('pages.hermesChannels.type') }}: {{ platform.type }}
              </NTag>

              <!-- 启用开关 -->
              <NSpace justify="space-between" align="center">
                <NText depth="3" style="font-size: 13px;">
                  {{
                    platform.enabled
                      ? t('common.enabled')
                      : t('common.disabled')
                  }}
                </NText>
                <NSwitch
                  :value="platform.enabled"
                  size="small"
                  @update:value="(val: boolean) => handleToggle(platform.id, val)"
                />
              </NSpace>
            </NSpace>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- 空状态 -->
      <NText
        v-else-if="!channelStore.loading"
        depth="3"
        style="display: block; text-align: center; padding: 48px 0;"
      >
        {{ t('common.empty') }}
      </NText>
    </NSpin>
  </div>
</template>

<style scoped>
.hermes-channels-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Hero 面板 ---- */

.hermes-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 16%, rgba(22, 163, 74, 0.22), transparent 36%),
    linear-gradient(135deg, rgba(22, 163, 74, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border: 1px solid rgba(22, 163, 74, 0.18);
}

.hermes-hero-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.hermes-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 统计卡片 ---- */

.hermes-metric-card {
  border-radius: 10px;
}

.hermes-metric-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 筛选栏 ---- */

.hermes-filter-card {
  padding: 0;
}

.hermes-filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 180px) auto;
  gap: 10px;
  align-items: center;
}

@media (max-width: 640px) {
  .hermes-filter-bar {
    grid-template-columns: 1fr;
  }
}

.hermes-refresh-icon {
  cursor: pointer;
  color: var(--text-color-3);
  transition: color 0.2s ease, transform 0.3s ease;
}

.hermes-refresh-icon:hover {
  color: var(--primary-color);
}

.hermes-refresh-icon.is-loading {
  animation: hermes-spin 0.8s linear infinite;
}

@keyframes hermes-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ---- 平台卡片 ---- */

.hermes-platform-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hermes-platform-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
}
</style>
