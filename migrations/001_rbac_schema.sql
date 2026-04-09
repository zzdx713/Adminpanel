-- ============================================================
-- OpenClaw-Admin: Multi-User + RBAC + Audit Log Migration
-- Version: 001
-- Tables: users, roles, permissions, user_roles,
--         role_permissions, audit_logs
-- Author: DBA Agent
-- ============================================================

-- ----------------------------------------------------------
-- 1. USERS 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    display_name  TEXT,
    role          TEXT    DEFAULT 'viewer',
    status        TEXT    DEFAULT 'active',  -- active | inactive | suspended
    email         TEXT,
    avatar        TEXT,
    created_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at    INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    last_login_at INTEGER
);

-- ----------------------------------------------------------
-- 2. ROLES 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT    PRIMARY KEY,
    name        TEXT    UNIQUE NOT NULL,
    description TEXT,
    is_system   INTEGER DEFAULT 0,  -- 1=系统内置，不可删除
    created_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ----------------------------------------------------------
-- 3. PERMISSIONS 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          TEXT    PRIMARY KEY,
    name        TEXT    UNIQUE NOT NULL,  -- e.g. "users:manage"
    resource    TEXT    NOT NULL,          -- e.g. "users"
    action      TEXT    NOT NULL,          -- e.g. "manage", "view", "write"
    description TEXT,
    created_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ----------------------------------------------------------
-- 4. USER_ROLES 关联表（用户-角色）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    user_id    TEXT    NOT NULL,
    role_id    TEXT    NOT NULL,
    granted_by TEXT,
    granted_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 5. ROLE_PERMISSIONS 关联表（角色-权限）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id         TEXT    NOT NULL,
    permission_id   TEXT    NOT NULL,
    granted_by      TEXT,
    granted_at      INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 6. AUDIT_LOGS 表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id             TEXT    PRIMARY KEY,
    user_id        TEXT,
    username       TEXT,
    action         TEXT    NOT NULL,  -- e.g. "user.create", "role.assign"
    resource       TEXT,             -- e.g. "users", "roles", "auth"
    resource_id    TEXT,             -- target resource primary key
    details        TEXT    DEFAULT '{}',  -- JSON: old/new values, extra context
    ip_address     TEXT,
    user_agent     TEXT,
    status         TEXT    DEFAULT 'success',  -- success | failure
    error_message  TEXT,
    created_at     INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status    ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_uid  ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_rid  ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_rid  ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_pid  ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id   ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource  ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_status    ON audit_logs(status);

-- ============================================================
-- SEED: Permissions
-- ============================================================
INSERT OR IGNORE INTO permissions (id, name, resource, action, description) VALUES
    ('perm_dashboard_view',      'dashboard:view',       'dashboard',       'view',       'View dashboard'),
    ('perm_config_read',        'config:read',          'config',          'read',       'Read configuration'),
    ('perm_config_write',       'config:write',         'config',          'write',      'Modify configuration'),
    ('perm_agents_manage',      'agents:manage',         'agents',          'manage',     'Manage agents'),
    ('perm_wizard_manage',      'wizard:manage',         'wizard',          'manage',     'Manage wizard'),
    ('perm_backup_manage',      'backup:manage',         'backup',          'manage',     'Manage backups'),
    ('perm_users_manage',       'users:manage',          'users',           'manage',     'Manage users'),
    ('perm_roles_manage',       'roles:manage',          'roles',           'manage',     'Manage roles'),
    ('perm_audit_view',         'audit:view',            'audit',           'view',       'View audit logs'),
    ('perm_notifications_manage','notifications:manage',  'notifications',   'manage',     'Manage notifications'),
    ('perm_terminal_access',    'terminal:access',        'terminal',        'access',     'Access terminal'),
    ('perm_desktop_access',     'desktop:access',         'desktop',         'access',     'Access remote desktop'),
    ('perm_files_manage',        'files:manage',          'files',           'manage',     'Manage files'),
    ('perm_system_admin',       'system:admin',           'system',          'admin',      'Full system administration');

-- ============================================================
-- SEED: Default Roles
-- ============================================================

-- viewer: read-only
INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES
    ('role_viewer', 'viewer', 'Read-only access', 1);
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
    ('role_viewer', 'perm_dashboard_view'),
    ('role_viewer', 'perm_config_read'),
    ('role_viewer', 'perm_agents_manage'),
    ('role_viewer', 'perm_notifications_manage');

-- operator: standard operator
INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES
    ('role_operator', 'operator', 'Standard operator with file and terminal access', 1);
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
    ('role_operator', 'perm_dashboard_view'),
    ('role_operator', 'perm_config_read'),
    ('role_operator', 'perm_config_write'),
    ('role_operator', 'perm_agents_manage'),
    ('role_operator', 'perm_wizard_manage'),
    ('role_operator', 'perm_backup_manage'),
    ('role_operator', 'perm_terminal_access'),
    ('role_operator', 'perm_desktop_access'),
    ('role_operator', 'perm_files_manage'),
    ('role_operator', 'perm_notifications_manage');

-- admin: full access
INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES
    ('role_admin', 'admin', 'Full administrative access', 1);
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
    ('role_admin', 'perm_dashboard_view'),
    ('role_admin', 'perm_config_read'),
    ('role_admin', 'perm_config_write'),
    ('role_admin', 'perm_agents_manage'),
    ('role_admin', 'perm_wizard_manage'),
    ('role_admin', 'perm_backup_manage'),
    ('role_admin', 'perm_users_manage'),
    ('role_admin', 'perm_roles_manage'),
    ('role_admin', 'perm_audit_view'),
    ('role_admin', 'perm_notifications_manage'),
    ('role_admin', 'perm_terminal_access'),
    ('role_admin', 'perm_desktop_access'),
    ('role_admin', 'perm_files_manage'),
    ('role_admin', 'perm_system_admin');

-- ============================================================
-- SEED: Default Admin User
-- Password: admin123  ⚠️  生产环境请立即修改！
-- ============================================================
INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, status, email) VALUES
    ('user_admin', 'admin', '$2b$10$placeholder_hash_replace_in_production', 'Administrator', 'admin', 'active', 'admin@example.com');
INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('user_admin', 'role_admin');
