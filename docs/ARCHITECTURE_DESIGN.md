# OpenClaw-Admin 系统架构设计文档 (v2.0)

> 文档版本：v2.0  
> 作者：系统架构师  
> 日期：2026-04-11  
> 状态：**已评审更新**

---

## 一、架构评审总结

### 1.1 已完成模块评审结果

| 模块 | 评审状态 | 关键发现 | 优化建议 |
|-----|---------|---------|---------|
| **多用户+RBAC** | ✅ 通过 | auth.js 实现完整，含速率限制和账户锁定 | 建议增加密码策略配置 |
| **通知中心** | ✅ 通过 | notifications.js 5KB，功能完整 | 建议增加批量标记已读 API |
| **Office 智能体工坊** | ⚠️ 需修复 | 迁移脚本使用 MySQL 语法 | **已修复**：转换为 SQLite 兼容 |
| **MyWorld 虚拟公司** | ⚠️ 需修复 | 同上 | **已修复**：转换为 SQLite 兼容 |

### 1.2 技术债务清单

| 问题 | 严重性 | 修复状态 | 影响范围 |
|-----|-------|---------|---------|
| 002_office_myworld.sql 使用 MySQL 语法 | 🔴 高 | ✅ 已修复 | 数据库迁移 |
| RBAC 权限未完全联通后端 | 🟡 中 | ⏳ 待处理 | 权限控制 |
| 审计日志未完整实现 | 🟡 中 | ⏳ 待处理 | 安全合规 |
| 告警规则引擎未实现 | 🟡 中 | ⏳ 待处理 | 监控告警 |

---

## 二、架构优化建议

### 2.1 数据库层优化

**当前问题**：
- `002_office_myworld.sql` 使用 MySQL 特有语法（`BIGINT UNSIGNED AUTO_INCREMENT`、`ENGINE=InnoDB`、`DATETIME`）
- 与项目既定的 `better-sqlite3` 技术栈冲突

**修复方案**（已实施）：
```sql
-- MySQL → SQLite 转换规则：
-- BIGINT UNSIGNED AUTO_INCREMENT → TEXT PRIMARY KEY (使用 UUID)
-- DATETIME → INTEGER (毫秒时间戳)
-- TINYINT → INTEGER
-- ENGINE/CHARSET/COLLATE → 删除
-- JSON DEFAULT → TEXT DEFAULT '{}'
```

**已更新表结构**：
- `agents`：主键改为 TEXT，使用 `randomUUID()` 生成
- `agent_templates`：同上
- `companies`：同上，增加 `status` 字段
- `company_members`：主键改为 TEXT，移除外键约束（SQLite 需手动管理）
- `office_scenes` / `office_agents` / `office_tasks` / `office_messages`：新增表
- `myworld_areas`：新增表
- `notifications` / `alert_channels` / `alert_rules`：新增表

### 2.2 后端 API 优化

**当前实现审查**：

#### Office 模块 (`server/office.js`)
```javascript
// ✅ 优点：
// - 分页逻辑正确（limit/offset）
// - RBAC 权限检查完整
// - SQL 使用参数化查询

// ⚠️ 待优化：
// - 缺少场景执行编排逻辑
// - office_agents 表未创建（只有 agents 表）
// - 缺少消息历史 API
```

#### MyWorld 模块 (`server/myworld.js`)
```javascript
// ✅ 优点：
// - 企业列表过滤逻辑正确
// - 成员管理 API 完整

// ⚠️ 待优化：
// - 使用了未定义的 hasDirectPermission 函数
// - 缺少位置更新 WebSocket 广播
// - 缺少区域交互 API
```

**建议修复**：

1. **修复权限函数引用**：
```javascript
// server/myworld.js 第 45 行
// 原代码：
const isAdmin = userId && hasDirectPermission(userId, 'myworld:companies:write')

// 应改为：
const isAdmin = userId && db.prepare(
  'SELECT 1 FROM user_permissions WHERE user_id = ? AND resource = ? AND action = ?'
).get(userId, 'myworld:companies', 'write') !== undefined
```

2. **补充缺失的 API 端点**：
```javascript
// 新增：POST /api/office/scenes/:id/execute
// 新增：GET /api/office/scenes/:id/messages
// 新增：PATCH /api/myworld/members/:id/position
// 新增：GET /api/myworld/companies/:id/areas
```

### 2.3 前端组件优化

**当前实现审查**：

#### OfficePage.vue (25861 行)
- ✅ 场景列表展示完整
- ✅ Agent 配置对话框实现
- ⚠️ 缺少场景执行进度展示
- ⚠️ 缺少 Agent 间消息历史查看

#### MyWorldPage.vue (31197 行)
- ✅ 公司创建/编辑功能完整
- ✅ 成员列表展示
- ⚠️ 缺少位置地图可视化
- ⚠️ 缺少实时位置更新

**建议增强**：
1. 引入 WebSocket 监听 `office.task_update` 和 `myworld.member_position` 事件
2. 增加 Draggable 组件实现成员拖拽移动
3. 增加进度条组件展示场景执行进度

---

## 三、P1 高优先级任务架构指导

### 3.1 任务：Dashboard 数据下钻优化（开发中）

**当前状态**：
- 前端：Usage 结构下钻弹窗已完成（DrilldownModal）
- 后端：需补充按 segment 分组的 API

**架构指导**：

#### API 设计
```javascript
// GET /api/dashboard/usage/drilldown
// 查询参数：
// - segment: 'sessions' | 'agents' | 'channels' | 'models'
// - start_time: ISO 8601
// - end_time: ISO 8601
// - page: number
// - limit: number

// 响应：
{
  segment: 'agents',
  total: 150,
  items: [
    {
      agent_id: 'agnt_xxx',
      agent_name: '文档助手',
      session_count: 45,
      token_usage: 125000,
      avg_duration: 3200,  // ms
      success_rate: 0.94
    }
  ]
}
```

#### 数据库查询优化
```sql
-- 使用索引加速查询
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- 聚合查询示例
SELECT 
  s.agent_id,
  a.name as agent_name,
  COUNT(*) as session_count,
  SUM(s.token_usage) as total_tokens,
  AVG(s.duration) as avg_duration,
  SUM(CASE WHEN s.status = 'success' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
FROM sessions s
JOIN agents a ON s.agent_id = a.id
WHERE s.created_at BETWEEN ? AND ?
GROUP BY s.agent_id
ORDER BY session_count DESC
LIMIT ? OFFSET ?
```

### 3.2 任务：Cron 可视化编辑器（待开始）

**架构指导**：

#### 技术选型
- **前端组件**：使用现成 cron 表达式编辑器库（如 `vue3-cron-picker`）
- **后端验证**：使用 `cron-parser` 库解析和验证表达式
- **数据库**：新增 `cron_jobs` 表存储定时任务配置

#### 数据库设计
```sql
CREATE TABLE IF NOT EXISTS cron_jobs (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    description   TEXT,
    expression    TEXT    NOT NULL,  -- cron 表达式
    command       TEXT    NOT NULL,  -- 执行的命令/脚本
    args          TEXT    DEFAULT '[]',  -- JSON 参数
    schedule      TEXT    DEFAULT '{}',  -- JSON: 时区、时延配置
    status        TEXT    DEFAULT 'paused',  -- paused | running | failed
    last_run_at   INTEGER,
    next_run_at   INTEGER,
    run_count     INTEGER DEFAULT 0,
    created_by    TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS cron_history (
    id            TEXT    PRIMARY KEY,
    job_id        TEXT    NOT NULL,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    status        TEXT    NOT NULL,  -- success | failed
    output        TEXT,
    error         TEXT,
    FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);
```

#### API 设计
```javascript
// POST /api/cron/jobs - 创建任务
// PUT /api/cron/jobs/:id - 更新任务
// DELETE /api/cron/jobs/:id - 删除任务
// POST /api/cron/jobs/:id/trigger - 手动触发
// POST /api/cron/jobs/:id/pause - 暂停
// POST /api/cron/jobs/:id/resume - 恢复
// GET /api/cron/jobs/:id/history - 执行历史
// POST /api/cron/validate - 验证 cron 表达式
```

#### 后端实现要点
```javascript
// server/automation-cron.js 扩展
import parser from 'cron-parser'

function validateCronExpression(expression) {
  try {
    const interval = parser.parseExpression(expression)
    const nextRuns = []
    for (let i = 0; i < 5; i++) {
      nextRuns.push(interval.next().toDate().toISOString())
    }
    return { valid: true, nextRuns }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

// 调度器集成
function scheduleJob(job) {
  const interval = parser.parseExpression(job.expression, { 
    tz: job.schedule?.timezone || 'Asia/Shanghai' 
  })
  const nextRun = interval.next().getTime()
  
  // 使用 node-cron 或 setTimeout 实现
  setTimeout(async () => {
    await executeJob(job)
    updateNextRun(job.id)
  }, nextRun - Date.now())
}
```

---

## 四、安全加固建议

### 4.1 认证安全

**当前实现**：
- bcrypt 哈希（cost=12）✅
- 登录失败锁定（5 次/15 分钟）✅
- 速率限制（100 请求/分钟）✅

**建议增强**：
```javascript
// 增加密码策略检查
const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false
}

function validatePassword(password) {
  const errors = []
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`密码长度至少 ${PASSWORD_POLICY.minLength} 位`)
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('必须包含大写字母')
  }
  // ...
  return errors
}
```

### 4.2 API 安全

**建议增加**：
1. **CORS 配置**：限制允许的域名
2. **请求签名**：对敏感 API 增加签名验证
3. **审计日志**：所有写操作记录到 audit_logs

```javascript
// middleware/auditLog.js
export async function auditLog(req, action, resource, details) {
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, username, action, resource, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    req.auth?.userId,
    req.auth?.username,
    action,
    resource,
    JSON.stringify(details),
    getClientIp(req),
    req.headers['user-agent']
  )
}
```

---

## 五、文件结构更新

### 5.1 后端新增文件

```
server/
├── routes/
│   ├── office.routes.js      # ✅ 已存在
│   ├── myworld.routes.js     # ✅ 已存在
│   ├── notification.routes.js # ⏳ 待创建
│   ├── alert.routes.js       # ⏳ 待创建
│   └── cron.routes.js        # ⏳ 待扩展
├── services/
│   ├── OfficeService.js      # ⏳ 待创建（场景编排）
│   ├── MyWorldService.js     # ⏳ 待创建（位置同步）
│   ├── AlertService.js       # ⏳ 待创建（告警引擎）
│   └── CronService.js        # ⏳ 待创建（任务调度）
└── middleware/
    └── auditLog.js           # ⏳ 待创建
```

### 5.2 前端新增文件

```
src/views/
├── users/
│   ├── UsersPage.vue         # ⏳ 待创建
│   └── UserDialog.vue        # ⏳ 待创建
├── rbac/
│   ├── RolesPage.vue         # ⏳ 待创建
│   └── PermissionsPage.vue   # ⏳ 待创建
├── audit/
│   └── AuditPage.vue         # ⏳ 待创建
├── alerts/
│   ├── AlertChannelsPage.vue # ⏳ 待创建
│   └── AlertRulesPage.vue    # ⏳ 待创建
└── cron/
    └── CronEditor.vue        # ⏳ 待创建
```

---

## 六、测试计划

### 6.1 单元测试

| 模块 | 测试文件 | 覆盖内容 |
|-----|---------|---------|
| Auth | test/auth.test.js | 密码哈希、登录锁定、Token 验证 |
| RBAC | test/rbac.test.js | 权限判断、角色继承 |
| Office | test/office.test.js | 场景创建、Agent 分配、消息传递 |
| MyWorld | test/myworld.test.js | 公司创建、成员管理、位置更新 |
| Cron | test/cron.test.js | 表达式验证、调度计算 |

### 6.2 集成测试

```bash
# 使用 Jest + Supertest
npm run test:integration

# 测试场景：
1. 用户登录 → 获取 Token → 访问受保护 API
2. 创建 Office 场景 → 添加 Agent → 执行任务 → 验证消息记录
3. 创建 Cron 任务 → 验证表达式 → 手动触发 → 检查执行历史
4. 触发告警规则 → 验证 Webhook 发送 → 检查通知记录
```

---

## 七、部署清单

### 7.1 数据库迁移

```bash
# 执行迁移脚本
cd /www/wwwroot/ai-work
node scripts/migrate.js 002_office_myworld.sql

# 验证表结构
sqlite3 wizard.db ".schema agents"
sqlite3 wizard.db ".schema companies"
```

### 7.2 环境变量

```bash
# .env 新增配置
OFFICE_ENABLED=true
MYWORLD_ENABLED=true
CRON_SCHEDULER_ENABLED=true
ALERT_ENGINE_ENABLED=true
```

### 7.3 服务重启

```bash
pm2 restart openclaw-admin
pm2 logs openclaw-admin --lines 50
```

---

## 八、版本变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|-----|------|---------|------|
| v1.0 | 2026-04-10 | 初始架构设计 | 系统架构师 |
| v2.0 | 2026-04-11 | 架构评审、MySQL→SQLite 修复、P1 任务指导 | 系统架构师 |

---

*文档版本：v2.0 | 状态：已评审*
