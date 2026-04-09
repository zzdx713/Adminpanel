import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationStore } from '../../src/stores/notification'

describe('Notification Store - Unit Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Notification Creation', () => {
    it('add() creates notification with correct structure', () => {
      const store = useNotificationStore()
      const id = store.add({
        title: 'Test',
        message: 'Test message',
        level: 'info',
      })
      
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.startsWith('notif-')).toBe(true)
      
      const notif = store.notifications[0]
      expect(notif.id).toBe(id)
      expect(notif.title).toBe('Test')
      expect(notif.message).toBe('Test message')
      expect(notif.level).toBe('info')
      expect(notif.read).toBe(false)
      expect(notif.timestamp).toBeTruthy()
    })

    it('info() creates info-level notification', () => {
      const store = useNotificationStore()
      const id = store.info('Info Title', 'Info Message')
      
      const notif = store.notifications.find(n => n.id === id)
      expect(notif?.level).toBe('info')
      expect(notif?.persistent).toBeFalsy()
    })

    it('warn() creates warning-level notification', () => {
      const store = useNotificationStore()
      const id = store.warn('Warning', 'Be careful')
      
      const notif = store.notifications.find(n => n.id === id)
      expect(notif?.level).toBe('warning')
    })

    it('error() creates error-level with persistent=true', () => {
      const store = useNotificationStore()
      const id = store.error('Error', 'Something failed')
      
      const notif = store.notifications.find(n => n.id === id)
      expect(notif?.level).toBe('error')
      expect(notif?.persistent).toBe(true)
    })

    it('success() creates success notification', () => {
      const store = useNotificationStore()
      const id = store.success('Success', 'Done!')
      
      const notif = store.notifications.find(n => n.id === id)
      expect(notif?.level).toBe('success')
    })

    it('supports extra fields: source, link, persistent', () => {
      const store = useNotificationStore()
      store.add({
        title: 'With Extras',
        message: 'Has extras',
        level: 'info',
        source: 'cron',
        link: '/path/to/action',
        persistent: true,
      })
      
      const notif = store.notifications[0]
      expect(notif.source).toBe('cron')
      expect(notif.link).toBe('/path/to/action')
      expect(notif.persistent).toBe(true)
    })
  })

  describe('Read Status Management', () => {
    it('markRead() marks single notification as read', () => {
      const store = useNotificationStore()
      const id = store.info('Test', 'Message')
      
      expect(store.notifications.find(n => n.id === id)?.read).toBe(false)
      
      store.markRead(id)
      expect(store.notifications.find(n => n.id === id)?.read).toBe(true)
    })

    it('markAllRead() marks all as read', () => {
      const store = useNotificationStore()
      store.info('One', 'Msg1')
      store.info('Two', 'Msg2')
      store.info('Three', 'Msg3')
      
      store.markAllRead()
      
      const unread = store.notifications.filter(n => !n.read)
      expect(unread.length).toBe(0)
    })

    it('unreadCount computes correctly', () => {
      const store = useNotificationStore()
      store.info('1', 'M1')
      store.info('2', 'M2')
      store.info('3', 'M3')
      
      expect(store.unreadCount).toBe(3)
      
      store.markRead(store.notifications[0].id)
      expect(store.unreadCount).toBe(2)
    })
  })

  describe('Notification Deletion', () => {
    it('remove() deletes specific notification', () => {
      const store = useNotificationStore()
      const id1 = store.info('One', 'Msg1')
      const id2 = store.info('Two', 'Msg2')
      
      store.remove(id1)
      
      expect(store.notifications.find(n => n.id === id1)).toBeUndefined()
      expect(store.notifications.find(n => n.id === id2)).toBeDefined()
      expect(store.notifications.length).toBe(1)
    })

    it('clear() removes all notifications', () => {
      const store = useNotificationStore()
      store.info('1', 'M1')
      store.info('2', 'M2')
      
      store.clear()
      
      expect(store.notifications.length).toBe(0)
    })

    it('clearRead() removes only read notifications', () => {
      const store = useNotificationStore()
      const id1 = store.info('One', 'Msg1')
      store.info('Two', 'Msg2')
      
      store.markRead(id1)
      store.clearRead()
      
      expect(store.notifications.length).toBe(1)
      expect(store.notifications[0].read).toBe(false)
    })
  })

  describe('Notification Limits', () => {
    it('limits stored notifications to maxStored (100)', () => {
      const store = useNotificationStore()
      
      // Add 150 notifications
      for (let i = 0; i < 150; i++) {
        store.info(`Notif ${i}`, `Message ${i}`)
      }
      
      expect(store.notifications.length).toBe(100)
      expect(store.notifications[0].title).toBe('Notif 149') // newest first
    })
  })

  describe('Computed Properties', () => {
    it('unreadList returns only unread, limited to 20', () => {
      const store = useNotificationStore()
      
      for (let i = 0; i < 25; i++) {
        store.info(`Notif ${i}`, `Msg ${i}`)
      }
      
      const unreadList = store.unreadList
      expect(unreadList.length).toBe(20)
      expect(unreadList.every(n => !n.read)).toBe(true)
    })

    it('recentList returns sorted by timestamp desc', () => {
      const store = useNotificationStore()
      
      store.info('First', 'M1')
      store.info('Second', 'M2')
      
      // Most recent is at index 0
      expect(store.recentList[0].title).toBe('Second')
      expect(store.recentList[1].title).toBe('First')
    })
  })

  describe('System Event Handlers', () => {
    it('handleGatewayDisconnect creates error notification', () => {
      const store = useNotificationStore()
      store.handleGatewayDisconnect()
      
      const notif = store.notifications[0]
      expect(notif.level).toBe('error')
      expect(notif.title).toContain('Gateway')
      expect(notif.source).toBe('system')
    })

    it('handleGatewayReconnect creates success notification', () => {
      const store = useNotificationStore()
      store.handleGatewayReconnect()
      
      const notif = store.notifications[0]
      expect(notif.level).toBe('success')
      expect(notif.title).toContain('重连')
    })

    it('handleCronFailed creates error with job name', () => {
      const store = useNotificationStore()
      store.handleCronFailed('Backup Job', 'Disk full')
      
      const notif = store.notifications[0]
      expect(notif.level).toBe('error')
      expect(notif.title).toBe('定时任务执行失败') // title is in Chinese
      expect(notif.message).toContain('Backup Job') // name is in message
      expect(notif.message).toContain('Disk full')
      expect(notif.source).toBe('cron')
    })

    it('handleAgentCrash creates error notification', () => {
      const store = useNotificationStore()
      store.handleAgentCrash('MyAgent')
      
      const notif = store.notifications[0]
      expect(notif.level).toBe('error')
      expect(notif.title).toBe('Agent 异常终止') // title is in Chinese
      expect(notif.message).toContain('MyAgent') // name is in message
      expect(notif.source).toBe('agent')
    })
  })
})
