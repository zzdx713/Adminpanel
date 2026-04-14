<script setup lang="ts">
import { onMounted, ref, computed, h } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NForm,
  NFormItem,
  NIcon,
  NGrid,
  NGridItem,
  NSpace,
  NSpin,
  NSwitch,
  NInputNumber,
  NSelect,
  NText,
  NTag,
  useMessage,
} from 'naive-ui'
import type { FormRules } from 'naive-ui'
import {
  RefreshOutline,
  SaveOutline,
  FlashOutline,
  PersonOutline,
  TextOutline,
  ServerOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const { t } = useI18n()
const message = useMessage()
const connStore = useHermesConnectionStore()

const loading = ref(false)
const saving = ref(false)
const lastError = ref<string | null>(null)

// 记忆配置字段
const memoryEnabled = ref(true)
const userProfileEnabled = ref(true)
const memoryCharLimit = ref(2200)
const userCharLimit = ref(1375)
const provider = ref('')

// Provider 选项
const providerOptions = computed(() => [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Local', value: 'local' },
  { label: 'Google', value: 'google' },
  { label: 'Mistral', value: 'mistral' },
  { label: `— ${t('pages.hermesMemory.customProvider')} —`, value: '__custom__' },
])

const isCustomProvider = computed(() => {
  return provider.value && !providerOptions.value.some(o => o.value !== '__custom__' && o.value === provider.value)
})

const customProviderValue = ref('')

const selectedProviderValue = computed({
  get: () => {
    if (isCustomProvider.value) return '__custom__'
    return provider.value || null
  },
  set: (val: string | null) => {
    if (val === '__custom__') {
      customProviderValue.value = provider.value || ''
    } else {
      provider.value = val || ''
    }
  },
})

const hasChanges = computed(() => {
  return (
    memoryEnabled.value !== originalConfig.value.memory_enabled ||
    userProfileEnabled.value !== originalConfig.value.user_profile_enabled ||
    memoryCharLimit.value !== originalConfig.value.memory_char_limit ||
    userCharLimit.value !== originalConfig.value.user_char_limit ||
    provider.value !== (originalConfig.value.provider || '')
  )
})

const originalConfig = ref<Record<string, any>>({})

// 表单验证规则
const formRules: FormRules = {
  memoryCharLimit: [
    {
      type: 'number' as const,
      required: true,
      min: 100,
      max: 100000,
      message: t('pages.hermesMemory.validation.charLimitRange'),
      trigger: ['blur', 'change'],
    },
  ],
  userCharLimit: [
    {
      type: 'number',
      required: true,
      min: 100,
      max: 100000,
      message: t('pages.hermesMemory.validation.charLimitRange'),
      trigger: ['blur', 'change'],
    },
  ],
}

async function fetchConfig() {
  loading.value = true
  lastError.value = null
  try {
    const client = await connStore.getClientAsync()
    if (!client) throw new Error('Hermes 未连接')
    const config = await client.getConfig()
    const mem = (config.memory as Record<string, any>) || {}
    memoryEnabled.value = mem.memory_enabled !== false
    userProfileEnabled.value = mem.user_profile_enabled !== false
    memoryCharLimit.value = mem.memory_char_limit || 2200
    userCharLimit.value = mem.user_char_limit || 1375
    provider.value = mem.provider || ''
    originalConfig.value = { ...mem }
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    message.error(t('pages.hermesMemory.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  lastError.value = null
  try {
    const client = await connStore.getClientAsync()
    if (!client) throw new Error('Hermes 未连接')
    await client.updateConfig({
      memory: {
        memory_enabled: memoryEnabled.value,
        user_profile_enabled: userProfileEnabled.value,
        memory_char_limit: memoryCharLimit.value,
        user_char_limit: userCharLimit.value,
        provider: provider.value || undefined,
      },
    })
    originalConfig.value = {
      memory_enabled: memoryEnabled.value,
      user_profile_enabled: userProfileEnabled.value,
      memory_char_limit: memoryCharLimit.value,
      user_char_limit: userCharLimit.value,
      provider: provider.value,
    }
    message.success(t('pages.hermesMemory.saveSuccess'))
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    message.error(t('pages.hermesMemory.saveFailed'))
  } finally {
    saving.value = false
  }
}

function handleReset() {
  memoryEnabled.value = originalConfig.value.memory_enabled !== false
  userProfileEnabled.value = originalConfig.value.user_profile_enabled !== false
  memoryCharLimit.value = originalConfig.value.memory_char_limit || 2200
  userCharLimit.value = originalConfig.value.user_char_limit || 1375
  provider.value = originalConfig.value.provider || ''
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <div class="hermes-memory-page">
    <!-- 页面标题 -->
    <div class="hermes-memory-header">
      <h2 class="hermes-memory-title">{{ t('pages.hermesMemory.title') }}</h2>
      <NSpace :size="8" align="center">
        <NTag v-if="hasChanges" type="warning" size="small" :bordered="false" round>
          {{ t('pages.hermesMemory.unsavedChanges') }}
        </NTag>
        <NButton
          size="small"
          class="app-toolbar-btn app-toolbar-btn--refresh"
          :loading="loading"
          @click="fetchConfig"
        >
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </NSpace>
    </div>

    <!-- 错误提示 -->
    <NAlert v-if="lastError" type="error" :bordered="false" closable class="app-card">
      {{ lastError }}
    </NAlert>

    <!-- 概览统计面板 -->
    <NCard :bordered="false" class="app-card hermes-stats-panel">
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--green">
              <NIcon :component="FlashOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.memoryStatus') }}</NText>
              <div class="stat-value">
                <NTag :type="memoryEnabled ? 'success' : 'default'" size="small" :bordered="false" round>
                  {{ memoryEnabled ? t('pages.hermesMemory.stats.enabled') : t('pages.hermesMemory.stats.disabled') }}
                </NTag>
              </div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--blue">
              <NIcon :component="PersonOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.userProfileStatus') }}</NText>
              <div class="stat-value">
                <NTag :type="userProfileEnabled ? 'success' : 'default'" size="small" :bordered="false" round>
                  {{ userProfileEnabled ? t('pages.hermesMemory.stats.enabled') : t('pages.hermesMemory.stats.disabled') }}
                </NTag>
              </div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--purple">
              <NIcon :component="TextOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.memoryCharLimit') }}</NText>
              <div class="stat-value">{{ memoryCharLimit?.toLocaleString() }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--orange">
              <NIcon :component="ServerOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.userCharLimit') }}</NText>
              <div class="stat-value">{{ userCharLimit?.toLocaleString() }}</div>
            </div>
          </div>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 配置表单 -->
    <NCard :bordered="false" class="app-card">
      <NSpin :show="loading">
        <NForm label-placement="left" label-width="180" :rules="formRules" :show-feedback="true">

          <!-- 功能开关区 -->
          <div class="form-section-header">
            <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.featureToggles') }}</NText>
            <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.featureTogglesDesc') }}</NText>
          </div>

          <NFormItem :label="t('pages.hermesMemory.memoryEnabled')">
            <NSwitch v-model:value="memoryEnabled" />
            <NText depth="3" style="margin-left: 12px; font-size: 12px;">
              {{ t('pages.hermesMemory.memoryEnabledHint') }}
            </NText>
          </NFormItem>

          <NFormItem :label="t('pages.hermesMemory.userProfileEnabled')">
            <NSwitch v-model:value="userProfileEnabled" />
            <NText depth="3" style="margin-left: 12px; font-size: 12px;">
              {{ t('pages.hermesMemory.userProfileEnabledHint') }}
            </NText>
          </NFormItem>

          <NDivider style="margin: 4px 0;" />

          <!-- 容量限制区 -->
          <div class="form-section-header">
            <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.capacityLimits') }}</NText>
            <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.capacityLimitsDesc') }}</NText>
          </div>

          <NFormItem :label="t('pages.hermesMemory.memoryCharLimit')" path="memoryCharLimit">
            <NInputNumber
              v-model:value="memoryCharLimit"
              :min="100"
              :max="100000"
              :step="100"
              style="width: 200px;"
            />
            <NText depth="3" style="margin-left: 12px; font-size: 12px;">
              {{ t('pages.hermesMemory.charLimitHint') }}
            </NText>
          </NFormItem>

          <NFormItem :label="t('pages.hermesMemory.userCharLimit')" path="userCharLimit">
            <NInputNumber
              v-model:value="userCharLimit"
              :min="100"
              :max="100000"
              :step="100"
              style="width: 200px;"
            />
            <NText depth="3" style="margin-left: 12px; font-size: 12px;">
              {{ t('pages.hermesMemory.charLimitHint') }}
            </NText>
          </NFormItem>

          <NDivider style="margin: 4px 0;" />

          <!-- Provider 配置区 -->
          <div class="form-section-header">
            <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.providerConfig') }}</NText>
            <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.providerConfigDesc') }}</NText>
          </div>

          <NFormItem :label="t('pages.hermesMemory.provider')">
            <NSpace vertical :size="8" style="flex: 1;">
              <NSelect
                v-model:value="selectedProviderValue"
                :options="providerOptions"
                :placeholder="t('pages.hermesMemory.providerPlaceholder')"
                clearable
                style="width: 300px;"
              />
              <NInput
                v-if="selectedProviderValue === '__custom__'"
                v-model:value="customProviderValue"
                :placeholder="t('pages.hermesMemory.customProviderPlaceholder')"
                size="small"
                style="width: 300px;"
                @update:value="(val: string) => provider = val"
              />
              <NText depth="3" style="font-size: 12px;">
                {{ t('pages.hermesMemory.providerHint') }}
              </NText>
            </NSpace>
          </NFormItem>
        </NForm>
      </NSpin>

      <!-- 操作按钮 -->
      <template #action>
        <NSpace justify="end" :size="12">
          <NButton
            size="small"
            class="app-toolbar-btn"
            :disabled="!hasChanges"
            @click="handleReset"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            size="small"
            class="app-toolbar-btn"
            type="primary"
            :disabled="!hasChanges"
            :loading="saving"
            @click="handleSave"
          >
            <template #icon><NIcon :component="SaveOutline" /></template>
            {{ t('common.save') }}
          </NButton>
        </NSpace>
      </template>
    </NCard>
  </div>
</template>

<style scoped>
.hermes-memory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hermes-memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.hermes-memory-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-1);
}

/* 概览统计面板 */
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
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-icon--green {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}

.stat-icon--blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-1);
  line-height: 1.3;
}

.stat-value--text {
  font-size: 14px;
}

/* 表单分区标题 */
.form-section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
  padding-top: 4px;
}

/* 操作按钮动画 */
.app-toolbar-btn {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-toolbar-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.app-toolbar-btn:not(:disabled):active {
  transform: translateY(0);
}
</style>
