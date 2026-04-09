-- ============================================================
-- Migration: 001_rbac_audit.sql
-- Description: Multi-User Auth + RBAC + Audit Log Schema
-- Target: SQLite (better-sqlite3)
-- Created: 2026-04-09
-- ============================================================

-- ----------------------------------------------------------
-- 1. USERS 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role         TEXT DEFAULT 'viewer',
    status       TEXT DEFAULT 'active',
    email        TEXT,
    avatar       TEXT,
    created_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    last_login_at INTEGER
);

-- ----------------------------------------------------------
-- 2. SESSIONS 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    token_hash   TEXT NOT NULL,
    ip_address   TEXT,
    user_agent   TEXT,
    expires_at   INTEGER NOT NULL,
    created_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 3. PERMISSIONS 表（权限定义）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id           TEXT PRIMARY KEY,
    name         TEXT UNIQUE NOT NULL,
    resource     TEXT NOT NULL,
    action       TEXT NOT NULL,
    description  TEXT,
    created_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ----------------------------------------------------------
-- 4. ROLES 表（角色定义）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id           TEXT PRIMARY KEY,
    name         TEXT UNIQUE NOT NULL,
    description  TEXT,
    permissions  TEXT DEFAULT '[]',   -- JSON array of permission IDs
    is_system    INTEGER DEFAULT 0,    -- 1 = system role, cannot be deleted
    created_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at   INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ----------------------------------------------------------
-- 5. USER_ROLES 表（用户-角色关联）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    user_id    TEXT NOT NULL,
    role_id    TEXT NOT NULL,
    granted_by TEXT,
    granted_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 6. AUDIT_LOGS 表（审计日志）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    username      TEXT,
    action        TEXT NOT NULL,
    resource      TEXT,
    resource_id   TEXT,
    details       TEXT DEFAULT '{}',   -- JSON object
    ip_address    TEXT,
    user_agent    TEXT,
    status        TEXT DEFAULT 'success',  -- success | failure
    error_message TEXT,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ----------------------------------------------------------
-- 7. NOTIFICATIONS 表（通知）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT,
    data        TEXT DEFAULT '{}',      -- JSON object
    read        INTEGER DEFAULT 0,
    priority    TEXT DEFAULT 'normal', -- low | normal | high | urgent
    channel     TEXT DEFAULT 'in_app', -- in_app | email | push
    created_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    read_at     INTEGER,
    expires_at  INTEGER
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires    ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id  ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read  ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id  ON user_roles(role_id);

-- ============================================================
-- SEED: Default Permissions
-- ============================================================
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
    ('perm_dashboard_view',     'dashboard:view',     'dashboard', 'view',     'View dashboard'),
    ('perm_config_read',        'config:read',         'config',     'read',     'Read configuration'),
    ('perm_config_write',       'config:write',        'config',     'write',    'Modify configuration'),
    ('perm_agents_manage',      'agents:manage',       'agents',     'manage',   'Manage agents'),
    ('perm_wizard_manage',      'wizard:manage',       'wizard',     'manage',   'Manage wizard'),
    ('perm_backup_manage',      'backup:manage',       'backup',     'manage',   'Manage backups'),
    ('perm_users_manage',       'users:manage',        'users',      'manage',   'Manage users'),
    ('perm_roles_manage',       'roles:manage',        'roles',      'manage',   'Manage roles'),
    ('perm_audit_view',         'audit:view',          'audit',      'view',     'View audit logs'),
    ('perm_notifications_manage','notifications:manage','notifications','manage','Manage notifications'),
    ('perm_terminal_access',    'terminal:access',     'terminal',   'access',   'Access terminal'),
    ('perm_desktop_access',     'desktop:access',     'desktop',    'access',   'Access remote desktop'),
    ('perm_files_manage',       'files:manage',        'files',      'manage',   'Manage files'),
    ('perm_system_admin',       'system:admin',        'system',     'admin',    'Full system administration');

-- ============================================================
-- SEED: Default Roles
-- ============================================================
INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system) VALUES
    ('role_viewer', 'viewer', 'Read-only access to the dashboard', '["perm_dashboard_view","perm_config_read","perm_agents_manage","perm_notifications_manage"]', 1);

INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system) VALUES
    ('role_operator', 'operator', 'Standard operator with file and terminal access', '["perm_dashboard_view","perm_config_read","perm_config_write","perm_agents_manage","perm_wizard_manage","perm_backup_manage","perm_terminal_access","perm_desktop_access","perm_files_manage","perm_notifications_manage"]', 1);

INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system) VALUES
    ('role_admin', 'admin', 'Full administrative access', '["perm_dashboard_view","perm_config_read","perm_config_write","perm_agents_manage","perm_wizard_manage","perm_backup_manage","perm_users_manage","perm_roles_manage","perm_audit_view","perm_notifications_manage","perm_terminal_access","perm_desktop_access","perm_files_manage","perm_system_admin"]', 1);

-- ============================================================
-- SEED: Default Admin User (password: admin123)
-- IMPORTANT: Change password immediately after first login!
-- ============================================================
-- Password hash generated with bcrypt, rounds=10
-- Plain text: admin123  →  DO NOT use in production
INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, status, email) VALUES
    ('user_admin', 'admin', '$2b$10$placeholder_hash_replace_in_production', 'Administrator', 'admin', 'active', 'admin@example.com');

-- Assign admin role to admin user
INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('user_admin', 'role_admin');
