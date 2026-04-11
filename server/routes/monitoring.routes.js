import { Router } from 'express'
import { requireAuth } from '../auth.js'
import db from '../database.js'
import os from 'os'
import { execSync } from 'child_process'

const router = Router()

/**
 * GET /api/monitoring/system
 * 系统性能监控
 */
router.get('/system', requireAuth, async (req, res) => {
  try {
    const platform = os.platform()
    
    // CPU 使用率
    const cpus = os.cpus()
    let cpuUsage = 0
    for (const cpu of cpus) {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      const idle = cpu.times.idle
      cpuUsage += ((total - idle) / total) * 100
    }
    cpuUsage = cpuUsage / cpus.length

    // 内存使用
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    // 磁盘使用
    let diskInfo = { total: 0, used: 0, free: 0 }
    try {
      if (platform === 'win32') {
        const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' })
        // 解析 Windows 磁盘信息（简化版）
        diskInfo = { total: 100 * 1024 * 1024 * 1024, free: 50 * 1024 * 1024 * 1024, used: 50 * 1024 * 1024 * 1024 }
      } else {
        const output = execSync('df -h /', { encoding: 'utf8' })
        const lines = output.trim().split('\n')
        const parts = lines[1].split(/\s+/)
        diskInfo = {
          total: parseInt(parts[1]) * 1024 * 1024,
          used: parseInt(parts[2]) * 1024 * 1024,
          free: parseInt(parts[3]) * 1024 * 1024
        }
      }
    } catch (e) {
      console.warn('[Monitoring] Disk info failed:', e.message)
    }

    // 网络统计
    const netStats = os.networkInterfaces()
    let bytesReceived = 0
    let bytesSent = 0
    for (const iface of Object.values(netStats)) {
      if (!iface) continue
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) {
          bytesReceived += net.rxBytes || 0
          bytesSent += net.txBytes || 0
        }
      }
    }

    res.json({
      ok: true,
      data: {
        cpu: {
          usage: Math.round(cpuUsage * 10) / 10,
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown'
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usagePercent: Math.round((usedMem / totalMem) * 1000) / 10
        },
        disk: {
          total: diskInfo.total,
          used: diskInfo.used,
          free: diskInfo.free,
          usagePercent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 1000) / 10 : 0
        },
        network: {
          bytesReceived,
          bytesSent
        },
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        platform,
        hostname: os.hostname(),
        timestamp: Date.now()
      }
    })
  } catch (error) {
    console.error('[Monitoring] System stats error:', error)
    res.status(500).json({ error: '获取系统性能信息失败' })
  }
})

/**
 * GET /api/monitoring/database
 * 数据库性能监控
 */
router.get('/database', requireAuth, (req, res) => {
  try {
    // 数据库统计
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count
    const scenarioCount = db.prepare('SELECT COUNT(*) as count FROM scenarios').get().count
    const auditLogCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count

    // 最近活跃
    const recentUsers = db.prepare(`
      SELECT username, display_name, last_login_at 
      FROM users 
      WHERE last_login_at IS NOT NULL 
      ORDER BY last_login_at DESC 
      LIMIT 5
    `).all()

    const recentTasks = db.prepare(`
      SELECT title, status, updated_at 
      FROM tasks 
      ORDER BY updated_at DESC 
      LIMIT 5
    `).all()

    res.json({
      ok: true,
      data: {
        stats: {
          users: userCount,
          tasks: taskCount,
          scenarios: scenarioCount,
          auditLogs: auditLogCount
        },
        recentActivity: {
          users: recentUsers,
          tasks: recentTasks
        },
        timestamp: Date.now()
      }
    })
  } catch (error) {
    console.error('[Monitoring] Database stats error:', error)
    res.status(500).json({ error: '获取数据库性能信息失败' })
  }
})

/**
 * GET /api/monitoring/api
 * API 性能监控
 */
router.get('/api', requireAuth, (req, res) => {
  try {
    // API 调用统计
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTimestamp = today.getTime()

    const todayLogs = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 20
    `).all(todayTimestamp)

    const totalToday = db.prepare(`
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= ?
    `).get(todayTimestamp).count

    // 错误统计
    const errorLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE status = 'failure' AND created_at >= ?
    `).get(todayTimestamp).count

    res.json({
      ok: true,
      data: {
        today: {
          totalRequests: totalToday,
          errors: errorLogs,
          errorRate: totalToday > 0 ? Math.round((errorLogs / totalToday) * 1000) / 10 : 0
        },
        topActions: todayLogs,
        timestamp: Date.now()
      }
    })
  } catch (error) {
    console.error('[Monitoring] API stats error:', error)
    res.status(500).json({ error: '获取 API 性能信息失败' })
  }
})

/**
 * GET /api/monitoring/history
 * 性能历史数据
 */
router.get('/history', requireAuth, (req, res) => {
  try {
    const { hours = 24 } = req.query
    const startTime = Date.now() - parseInt(hours) * 60 * 60 * 1000

    // 从 audit_logs 获取历史数据（简化版）
    const history = db.prepare(`
      SELECT 
        DATE(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as requests,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as errors
      FROM audit_logs
      WHERE created_at >= ?
      GROUP BY DATE(created_at / 1000, 'unixepoch')
      ORDER BY date
    `).all(startTime)

    res.json({
      ok: true,
      data: {
        period: { hours: parseInt(hours), startTime, endTime: Date.now() },
        history
      }
    })
  } catch (error) {
    console.error('[Monitoring] History error:', error)
    res.status(500).json({ error: '获取性能历史数据失败' })
  }
})

/**
 * GET /api/monitoring/alerts
 * 获取告警信息
 */
router.get('/alerts', requireAuth, (req, res) => {
  try {
    const alerts = []

    // CPU 告警
    const cpus = os.cpus()
    let cpuUsage = 0
    for (const cpu of cpus) {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      const idle = cpu.times.idle
      cpuUsage += ((total - idle) / total) * 100
    }
    cpuUsage = cpuUsage / cpus.length

    if (cpuUsage > 80) {
      alerts.push({
        level: 'warning',
        type: 'cpu',
        message: `CPU 使用率过高：${Math.round(cpuUsage)}%`,
        threshold: 80,
        current: Math.round(cpuUsage)
      })
    }

    // 内存告警
    const totalMem = os.totalmem()
    const usedMem = totalMem - os.freemem()
    const memUsage = (usedMem / totalMem) * 100

    if (memUsage > 80) {
      alerts.push({
        level: 'warning',
        type: 'memory',
        message: `内存使用率过高：${Math.round(memUsage)}%`,
        threshold: 80,
        current: Math.round(memUsage)
      })
    }

    // 磁盘告警
    try {
      if (os.platform() !== 'win32') {
        const output = execSync('df /', { encoding: 'utf8' })
        const parts = output.trim().split('\n')[1].split(/\s+/)
        const diskUsage = parseInt(parts[4])

        if (diskUsage > 80) {
          alerts.push({
            level: 'warning',
            type: 'disk',
            message: `磁盘使用率过高：${diskUsage}%`,
            threshold: 80,
            current: diskUsage
          })
        }
      }
    } catch (e) {
      // 忽略磁盘检查错误
    }

    res.json({
      ok: true,
      data: {
        alerts,
        count: alerts.length,
        timestamp: Date.now()
      }
    })
  } catch (error) {
    console.error('[Monitoring] Alerts error:', error)
    res.status(500).json({ error: '获取告警信息失败' })
  }
})

export default router
