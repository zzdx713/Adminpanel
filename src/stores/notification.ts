import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success'

export interface Notification {
  id: string
  title: string
  message: string
  level: NotificationLevel
  timestamp: number
  read: boolean
  source?: string
  link?: string
  persistent?: boolean
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([])
  const maxStored = 100

  const unreadCount = computed(() =>
    notifications.value.filter(n => !n.read).length
  )

  const unreadList = computed(() =>
    notifications.value.filter(n => !n.read).slice(0, 20)
  )

  const recentList = computed(() =>
    [...notifications.value]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50)
  )

  function generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function add(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): string {
    const id = generateId()
    const full: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    }
    notifications.value.unshift(full)
    if (notifications.value.length > maxStored) {
      notifications.value = notifications.value.slice(0, maxStored)
    }
    return id
  }

  function info(title: string, message: string, extra?: Partial<Notification>) {
    return add({ title, message, level: 'info', ...extra })
  }

  function warn(title: string, message: string, extra?: Partial<Notification>) {
    return add({ title, message, level: 'warning', ...extra })
  }

  function error(title: string, message: string, extra?: Partial<Notification>) {
    return add({ title, message, level: 'error', persistent: true, ...extra })
  }

  function success(title: string, message: string, extra?: Partial<Notification>) {
    return add({ title, message, level: 'success', ...extra })
  }

  function markRead(id: string) {
    const notif = notifications.value.find(n => n.id === id)
    if (notif) notif.read = true
  }

  function markAllRead() {
    notifications.value.forEach(n => { n.read = true })
  }

  function remove(id: string) {
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx !== -1) notifications.value.splice(idx, 1)
  }

  function clear() {
    notifications.value = []
  }

  function clearRead() {
    notifications.value = notifications.value.filter(n => !n.read)
  }

  // Auto-add system notifications from WebSocket events
  function handleGatewayDisconnect() {
    error(
      'Gateway 断开',
      '与后端的 WebSocket 连接已断开，正在尝试重连...',
      { source: 'system', persistent: false }
    )
  }

  function handleGatewayReconnect() {
    success(
      'Gateway 已重连',
      'WebSocket 连接已恢复',
      { source: 'system' }
    )
  }

  function handleCronFailed(jobName: string, errorMsg: string) {
    error(
      '定时任务执行失败',
      `任务「${jobName}」执行失败：${errorMsg}`,
      { source: 'cron' }
    )
  }

  function handleTokenThreshold(percentage: number) {
    warn(
      'Token 用量预警',
      `本月 Token 用量已达到 ${percentage}% 的阈值`,
      { source: 'billing' }
    )
  }

  function handleAgentCrash(agentName: string) {
    error(
      'Agent 异常终止',
      `Agent「${agentName}」意外崩溃`,
      { source: 'agent' }
    )
  }

  return {
    notifications,
    unreadCount,
    unreadList,
    recentList,
    add,
    info,
    warn,
    error,
    success,
    markRead,
    markAllRead,
    remove,
    clear,
    clearRead,
    handleGatewayDisconnect,
    handleGatewayReconnect,
    handleCronFailed,
    handleTokenThreshold,
    handleAgentCrash,
  }
})
