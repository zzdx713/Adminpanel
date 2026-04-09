import { randomUUID } from 'crypto'
import db from './database.js'

// Notification types
export const NOTIFICATION_TYPES = {
  SYSTEM: 'system',
  USER: 'user',
  BACKUP: 'backup',
  AGENT: 'agent',
  TASK: 'task',
  SECURITY: 'security',
  HEALTH: 'health',
  UPDATE: 'update',
}

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
}

// Create a notification
export function createNotification({ userId = null, type = NOTIFICATION_TYPES.SYSTEM, title, message = '', data = {}, priority = NOTIFICATION_PRIORITIES.NORMAL, channel = 'in_app', expiresAt = null }) {
  const id = randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, data, priority, channel, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    type,
    title,
    message,
    JSON.stringify(data),
    priority,
    channel,
    now,
    expiresAt || null
  )

  return { id, createdAt: now }
}

// Get notifications for a user (or global if userId is null)
export function getNotifications({ userId = null, page = 1, pageSize = 20, unreadOnly = false, type = null, priority = null }) {
  const conditions = []
  const params = []

  // User can see their own notifications + global (user_id is null) notifications
  if (userId) {
    conditions.push('(user_id = ? OR user_id IS NULL)')
    params.push(userId)
  }

  if (unreadOnly) {
    conditions.push('read = 0')
  }

  if (type) {
    conditions.push('type = ?')
    params.push(type)
  }

  if (priority) {
    conditions.push('priority = ?')
    params.push(priority)
  }

  // Expire old notifications
  conditions.push('(expires_at IS NULL OR expires_at > ?)')
  params.push(Date.now())

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const total = db.prepare(`SELECT COUNT(*) as count FROM notifications ${where}`).get(...params).count
  const offset = (page - 1) * pageSize

  const rows = db.prepare(`
    SELECT * FROM notifications ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)

  return {
    total,
    unreadCount: getUnreadCount(userId),
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    notifications: rows.map(r => ({ ...r, data: JSON.parse(r.data || '{}') }))
  }
}

// Get unread count
export function getUnreadCount(userId = null) {
  const now = Date.now()
  if (userId) {
    return db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND read = 0 AND (expires_at IS NULL OR expires_at > ?)`).get(userId, now).count
  }
  return db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE read = 0 AND (expires_at IS NULL OR expires_at > ?)`).get(now).count
}

// Mark notification as read
export function markNotificationRead(id, userId = null) {
  const now = Date.now()
  if (userId) {
    return db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(now, id, userId).changes > 0
  }
  return db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE id = ?').run(now, id).changes > 0
}

// Mark all notifications as read for a user
export function markAllNotificationsRead(userId = null) {
  const now = Date.now()
  if (userId) {
    return db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE (user_id = ? OR user_id IS NULL) AND read = 0').run(now, userId).changes
  }
  return db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE read = 0').run(now).changes
}

// Delete a notification
export function deleteNotification(id, userId = null) {
  if (userId) {
    return db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  }
  return db.prepare('DELETE FROM notifications WHERE id = ?').run(id).changes > 0
}

// Clean up expired notifications
export function cleanupExpiredNotifications() {
  const now = Date.now()
  const result = db.prepare('DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at < ?').run(now)
  return result.changes
}

// Broadcast notification via SSE
export function formatNotificationForSSE(notification) {
  return {
    type: 'notification',
    notification: {
      id: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      channel: notification.channel,
      read: notification.read === 1,
      createdAt: notification.created_at,
      readAt: notification.read_at,
    }
  }
}

// Send immediate notification (creates + broadcasts via SSE clients)
export function sendImmediateNotification(broadcastFn, { userId = null, type = NOTIFICATION_TYPES.SYSTEM, title, message = '', data = {}, priority = NOTIFICATION_PRIORITIES.NORMAL, channel = 'in_app' }) {
  const notification = createNotification({ userId, type, title, message, data, priority, channel })

  const formatted = formatNotificationForSSE({
    ...notification,
    user_id: userId,
    type,
    title,
    message,
    data,
    priority,
    channel,
    read: 0,
    created_at: notification.createdAt,
    read_at: null,
  })

  // Broadcast to relevant SSE clients
  broadcastFn(formatted)

  return notification
}
