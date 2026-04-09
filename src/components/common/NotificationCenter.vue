<script setup lang="ts">
/**
 * NotificationCenter - Unified notification bell and dropdown panel
 *
 * Displays a bell icon with unread badge, and a dropdown panel listing
 * recent notifications with filtering, marking read, and clearing.
 */
import { ref, computed } from 'vue'
import {
  NPopover,
  NBadge,
  NButton,
  NEmpty,
  NSpin,
  NText,
  NTabs,
  NTabPane,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useNotificationStore, type Notification, type NotificationLevel } from '@/stores/notification'

const { t } = useI18n()
const notifStore = useNotificationStore()
const activeTab = ref<'recent' | 'unread'>('recent')
const panelKey = ref(0) // force re-render for transitions

const displayList = computed<Notification[]>(() => {
  return activeTab.value === 'unread'
    ? notifStore.unreadList
    : notifStore.recentList
})

const levelIcon = (level: NotificationLevel) => {
  const icons: Record<NotificationLevel, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }
  return icons[level]
}

const levelColor = (level: NotificationLevel) => {
  const colors: Record<NotificationLevel, string> = {
    info: '#2a7fff',
    success: '#18a058',
    warning: '#f0a020',
    error: '#d03050',
  }
  return colors[level]
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function handleNotifClick(notif: Notification) {
  notifStore.markRead(notif.id)
  if (notif.link) {
    window.location.href = notif.link
  }
}

function handleClearAll() {
  notifStore.clear()
  panelKey.value++
}
</script>

<template>
  <NPopover
    :key="panelKey"
    trigger="click"
    placement="bottom-end"
    scrollable
    raw
    :show-arrow="false"
    style="padding: 0;"
  >
    <template #trigger>
      <div class="notif-bell-wrapper">
        <NBadge :value="notifStore.unreadCount" :max="99" :show="notifStore.unreadCount > 0">
          <button class="notif-bell-btn" aria-label="通知中心">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
        </NBadge>
      </div>
    </template>

    <div class="notif-panel">
      <div class="notif-panel-header">
        <div class="notif-panel-title">
          <span>{{ t('pages.notifications.title') }}</span>
          <NButton
            v-if="notifStore.unreadCount > 0"
            size="tiny"
            quaternary
            @click="notifStore.markAllRead()"
          >
            {{ t('pages.notifications.markAllRead') }}
          </NButton>
        </div>
        <NButton
          v-if="notifStore.notifications.length > 0"
          size="tiny"
          quaternary
          @click="handleClearAll"
        >
          {{ t('pages.notifications.clearAll') }}
        </NButton>
      </div>

      <NTabs v-model:value="activeTab" size="small" class="notif-tabs">
        <NTabPane name="recent" :tab="t('pages.notifications.tabs.recent')" />
        <NTabPane name="unread" :tab="`${t('pages.notifications.tabs.unread')} (${notifStore.unreadCount})`" />
      </NTabs>

      <div class="notif-list">
        <template v-if="displayList.length === 0">
          <NEmpty
            :description="t('pages.notifications.empty')"
            size="small"
            style="padding: 24px 0;"
          />
        </template>
        <template v-else>
          <div
            v-for="notif in displayList"
            :key="notif.id"
            class="notif-item"
            :class="{ 'notif-item-unread': !notif.read, [`notif-item-${notif.level}`]: true }"
            @click="handleNotifClick(notif)"
          >
            <div class="notif-icon" :style="{ color: levelColor(notif.level) }">
              {{ levelIcon(notif.level) }}
            </div>
            <div class="notif-content">
              <div class="notif-title">{{ notif.title }}</div>
              <div class="notif-message">{{ notif.message }}</div>
              <div class="notif-meta">
                <span v-if="notif.source" class="notif-source">{{ notif.source }}</span>
                <span class="notif-time">{{ formatTime(notif.timestamp) }}</span>
              </div>
            </div>
            <button
              v-if="!notif.read"
              class="notif-mark-read"
              :title="t('pages.notifications.markRead')"
              @click.stop="notifStore.markRead(notif.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.notif-bell-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.notif-bell-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.notif-bell-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.notif-panel {
  width: 380px;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.notif-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
  border-bottom: 1px solid var(--border-color);
}

.notif-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.notif-tabs {
  padding: 0 12px;
}

.notif-tabs :deep(.n-tabs-nav) {
  padding: 0;
}

.notif-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.notif-item:hover {
  background: var(--bg-secondary);
}

.notif-item-unread {
  background: rgba(42, 127, 255, 0.06);
}

.notif-item-unread:hover {
  background: rgba(42, 127, 255, 0.1);
}

.notif-item-error.notif-item-unread {
  background: rgba(208, 48, 80, 0.06);
}

.notif-item-error.notif-item-unread:hover {
  background: rgba(208, 48, 80, 0.1);
}

.notif-item-warning.notif-item-unread {
  background: rgba(240, 160, 32, 0.06);
}

.notif-item-warning.notif-item-unread:hover {
  background: rgba(240, 160, 32, 0.1);
}

.notif-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.notif-content {
  flex: 1;
  min-width: 0;
}

.notif-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.notif-message {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notif-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.notif-source {
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.notif-mark-read {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  margin-top: 2px;
}

.notif-mark-read:hover {
  background: var(--color-primary);
  color: white;
}
</style>
