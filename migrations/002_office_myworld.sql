-- Migration: Office and MyWorld Features (SQLite Compatible)
-- Created: 2026-04-09
-- Updated: 2026-04-11 (Fixed MySQL → SQLite syntax)

-- agents: Office 智能体工坊 - Agent 配置表
CREATE TABLE IF NOT EXISTS agents (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    type          TEXT    NOT NULL,
    description   TEXT,
    avatar        TEXT,
    category      TEXT    DEFAULT 'general',
    config        TEXT    DEFAULT '{}',  -- JSON
    status        TEXT    DEFAULT 'active',  -- active | inactive | archived
    stats         TEXT    DEFAULT '{}',  -- JSON: usage stats
    created_by    TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_by ON agents(created_by);

-- agent_templates: Agent 模板
CREATE TABLE IF NOT EXISTS agent_templates (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    description   TEXT,
    config_schema TEXT    DEFAULT '{}',  -- JSON schema
    icon          TEXT,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_agent_templates_name ON agent_templates(name);

-- office_scenes: 协作场景
CREATE TABLE IF NOT EXISTS office_scenes (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    description   TEXT,
    config        TEXT    DEFAULT '{}',  -- JSON: scene configuration
    status        TEXT    DEFAULT 'draft',  -- draft | active | paused | completed
    created_by    TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- office_agents: 场景内的 Agent 配置
CREATE TABLE IF NOT EXISTS office_agents (
    id            TEXT    PRIMARY KEY,
    scene_id      TEXT    NOT NULL,
    agent_id      TEXT    NOT NULL,       -- 关联 agents 表
    agent_name    TEXT    NOT NULL,
    agent_role    TEXT    DEFAULT 'worker',  -- coordinator | worker | reviewer
    config        TEXT    DEFAULT '{}',  -- JSON: 系统提示词补充、工具权限
    status        TEXT    DEFAULT 'idle',  -- idle | busy | offline
    sort_order    INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (scene_id) REFERENCES office_scenes(id) ON DELETE CASCADE
);

-- office_tasks: 委派任务
CREATE TABLE IF NOT EXISTS office_tasks (
    id            TEXT    PRIMARY KEY,
    scene_id      TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    description   TEXT,
    status        TEXT    DEFAULT 'pending',  -- pending | assigned | in_progress | completed | failed
    priority      TEXT    DEFAULT 'normal',  -- low | normal | high | urgent
    assigned_to   TEXT,                       -- office_agents.id
    created_by    TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    completed_at  INTEGER,
    result        TEXT    DEFAULT '{}',
    FOREIGN KEY (scene_id) REFERENCES office_scenes(id) ON DELETE CASCADE
);

-- office_messages: Agent 间消息传递
CREATE TABLE IF NOT EXISTS office_messages (
    id            TEXT    PRIMARY KEY,
    scene_id      TEXT    NOT NULL,
    task_id       TEXT,
    from_agent    TEXT    NOT NULL,
    to_agent      TEXT,
    content       TEXT    NOT NULL,
    type          TEXT    DEFAULT 'text',  -- text | command | result | error
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (scene_id) REFERENCES office_scenes(id) ON DELETE CASCADE
);

-- companies: MyWorld 虚拟公司
CREATE TABLE IF NOT EXISTS companies (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    description   TEXT,
    logo          TEXT,
    industry      TEXT,
    scale         TEXT,
    website       TEXT,
    settings      TEXT    DEFAULT '{}',  -- JSON: 背景、区域配置
    owner_id      TEXT    NOT NULL,
    status        TEXT    DEFAULT 'active',
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);

-- company_members: 公司成员
CREATE TABLE IF NOT EXISTS company_members (
    id            TEXT    PRIMARY KEY,
    company_id    TEXT    NOT NULL,
    user_id       TEXT    NOT NULL,
    role          TEXT    DEFAULT 'member',  -- owner | manager | member
    permissions   TEXT    DEFAULT '[]',  -- JSON array
    display_name  TEXT    NOT NULL,
    avatar_url    TEXT,
    position      TEXT    DEFAULT '{}',  -- JSON: {area, desk}
    status        TEXT    DEFAULT 'online',  -- online | away | offline
    last_active   INTEGER,
    joined_at     INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_company_members ON company_members(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);

-- myworld_areas: 公司区域
CREATE TABLE IF NOT EXISTS myworld_areas (
    id            TEXT    PRIMARY KEY,
    company_id    TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    type          TEXT    NOT NULL,  -- meeting_room | office | lounge | reception
    position      TEXT    DEFAULT '{}',  -- JSON: {x, y, width, height}
    config        TEXT    DEFAULT '{}',
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- notifications: 通知持久化
CREATE TABLE IF NOT EXISTS notifications (
    id            TEXT    PRIMARY KEY,
    user_id       TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    message       TEXT,
    level         TEXT    DEFAULT 'info',  -- info | warning | error | success
    source        TEXT,  -- system | cron | agent | billing
    link          TEXT,
    is_read       INTEGER DEFAULT 0,
    is_persistent INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- alert_channels: 告警渠道配置
CREATE TABLE IF NOT EXISTS alert_channels (
    id            TEXT    PRIMARY KEY,
    user_id       TEXT    NOT NULL,
    channel_type  TEXT    NOT NULL,  -- feishu | dingtalk | email | webhook
    name          TEXT    NOT NULL,
    config        TEXT    NOT NULL,  -- JSON: webhook_url / email / token
    enabled       INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- alert_rules: 告警规则
CREATE TABLE IF NOT EXISTS alert_rules (
    id            TEXT    PRIMARY KEY,
    user_id       TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    event_type    TEXT    NOT NULL,  -- gateway_disconnect | cron_failed | agent_crash | token_threshold
    condition     TEXT    NOT NULL,  -- JSON: {threshold, period}
    channel_ids   TEXT    DEFAULT '[]',  -- JSON array
    enabled       INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 插入默认 Agent 模板
INSERT OR IGNORE INTO agent_templates (id, name, description, config_schema, icon) VALUES
('tmpl_001', '文档助手', '用于文档处理、摘要、翻译的通用 Agent', '{"system_prompt": "你是一个文档处理助手...", "tools": ["read_file", "write_file", "search"]}', '📝'),
('tmpl_002', '代码审查', '代码质量检查和优化建议', '{"system_prompt": "你是一个资深代码审查员...", "tools": ["code_analysis", "lint"]}', '🔍'),
('tmpl_003', '数据分析师', '数据查询、统计、可视化', '{"system_prompt": "你是一个数据分析师...", "tools": ["query_db", "chart_gen"]}', '📊');
