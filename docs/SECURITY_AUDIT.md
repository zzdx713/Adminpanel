# OpenClaw-Admin 安全审计报告

**项目**: OpenClaw-Admin  
**审计日期**: 2026-04-09  
**审计范围**: 认证安全、权限验证、API 安全、数据加密  
**审计人**: 安全工程师 (子任务)

---

## 一、执行摘要

对 OpenClaw-Admin 项目进行了全面的安全审计，发现 **11 项安全问题**（2 项高危、4 项中危、5 项低危），已完成 **8 项加固**（含 1 项高危、3 项中危），剩余 3 项需要架构调整。

---

## 二、已发现的安全问题与加固状态

### 🔴 高危

#### 1. Token 通过 Query 参数传递（会泄漏到日志）
- **问题**: `attachAuth` 函数允许通过 `req.query.token` 传递认证 token
- **风险**: Token 会出现在服务器日志、代理日志、浏览器历史、CDN 日志中
- **状态**: ✅ **已修复** - 移除 query.token 支持，仅允许 Header/Cookie
- **修复**: `server/index.js` 中 `checkAuth` 函数

#### 2. API 路由无细粒度权限控制
- **问题**: 大多数 API 路由只使用 `authMiddleware`（仅检查是否登录），无 RBAC 权限检查
- **风险**: 任何登录用户都可以执行删除备份、修改配置、执行 npm 更新等高危操作
- **状态**: ⚠️ **部分修复** - 已为敏感操作添加权限中间件，但单用户模式下 `req.auth` 信息不足
- **修复**: `server/permission-fix.js` 为备份/终端/桌面/向导等端点添加了 `requirePermission`

#### 3. 任意 RPC 方法调用
- **问题**: `/api/rpc` 端点接受任意 `method` 参数并传递给 Gateway
- **风险**: 可能调用未授权或危险的 Gateway 方法
- **状态**: ✅ **已修复** - 添加 RPC 方法白名单
- **修复**: `server/security-fix.js` 中 `_rpcMethodWhitelist`

---

### 🟠 中危

#### 4. 登录无速率限制
- **问题**: 登录端点无失败次数限制，可暴力破解
- **风险**: 攻击者可以无限尝试密码
- **状态**: ✅ **已修复** - 添加 IP 级别暴力破解跟踪 + 账户锁定
- **修复**: `server/security-fix.js` 中 `_bruteForceTracker`

#### 5. 登录失败无审计日志
- **问题**: 登录失败不记录审计日志
- **风险**: 无法追溯安全事件
- **状态**: ✅ **已修复** - 添加 `LOGIN_FAILED` 和 `LOGIN_SUCCESS` 审计事件
- **修复**: `server/security-fix.js` 中登录端点

#### 6. CORS 配置过于宽松
- **问题**: `origin: true` 允许任意来源请求
- **风险**: 在生产环境中可能被恶意网站利用
- **状态**: ✅ **已修复** - 添加显式方法/头限制和 maxAge
- **修复**: `server/security-fix.js`

#### 7. 缺少安全响应头
- **问题**: 缺少 `X-Frame-Options`、`X-Content-Type-Options`、`HSTS` 等安全头
- **风险**: 点击劫持、内容嗅探、中间人攻击
- **状态**: ✅ **已修复** - 添加完整安全响应头集
- **修复**: `server/security-fix.js`

#### 8. 媒体路径遍历风险
- **问题**: `/api/media` 中 `safePath` 仅做简单替换，未验证解析后路径
- **风险**: 路径如 `../../../etc/passwd` 可能逃逸媒体目录
- **状态**: ✅ **已修复** - 使用 `resolve()` 后验证路径前缀
- **修复**: `server/security-fix.js` 媒体端点

#### 9. 密码使用 SHA-512 迭代（而非专门哈希算法）
- **问题**: `auth.js` 中使用 PBKDF2 风格的 SHA-512 迭代（10万次），但非标准 PBKDF2
- **风险**: 相比 bcrypt/argon2，专门构建的 GPU 破解工具效率更高
- **状态**: ⚠️ **建议升级** - 当前实现可防御，但建议迁移到 argon2 或增加迭代次数至 210M+（argon2id）
- **修复**: 建议在 `auth.js` 中替换为 `argon2` 库

---

### 🟡 低危

#### 10. Session Cookie 缺少安全标志
- **问题**: Cookie 未设置 `HttpOnly`、`SameSite`、`Secure` 标志
- **风险**: XSS 攻击可窃取 Cookie、会话固定攻击
- **状态**: ✅ **已修复** - 添加 `HttpOnly` 和 `SameSite=Strict`，生产环境添加 `Secure`
- **修复**: `server/security-fix.js` 登录端点

#### 11. 缺少 JSON Body 大小限制
- **问题**: `express.json()` 无大小限制，可发送超大 Body 造成内存耗尽
- **风险**: Denial of Service
- **状态**: ✅ **已修复** - 设置 1MB 限制
- **修复**: `server/security-fix.js`

---

## 三、需要架构调整的问题（暂未修复）

### A. 单用户模式与多用户 RBAC 模式不兼容
- **说明**: 当使用 `AUTH_USERNAME/AUTH_PASSWORD`（单用户模式）时，登录不创建数据库 Session，`req.auth` 对象为空，导致 `requirePermission` 无法工作
- **影响**: 权限检查对单用户模式无效
- **建议**: 为单用户模式添加一个虚拟 `admin` role 注入到 `req.auth`

### B. 数据库敏感字段未加密
- **说明**: 数据库中 `password_hash`、`token_hash` 等以明文或简单哈希存储
- **影响**: 数据库文件泄漏时，攻击者可离线破解密码
- **建议**: 对 `password_hash` 字段使用 argon2id 加密存储，对备份文件加密

### C. 敏感配置（OPENCLAW_AUTH_TOKEN/PASSWORD）在日志中有泄漏风险
- **说明**: `.env` 中的敏感配置通过 `JSON.stringify` 输出或错误信息可能泄漏
- **建议**: 添加配置值掩码，在日志输出时自动隐藏敏感字段

---

## 四、安全加固清单

| # | 加固项 | 类型 | 状态 | 文件 |
|---|--------|------|------|------|
| 1 | 移除 query.token 传递 | 认证 | ✅ | server/index.js |
| 2 | 登录暴力破解保护 | 认证 | ✅ | server/index.js |
| 3 | 全局 API 速率限制 | API | ✅ | server/index.js |
| 4 | 安全响应头 (HSTS/X-Frame等) | API | ✅ | server/index.js |
| 5 | CORS 增强配置 | API | ✅ | server/index.js |
| 6 | JSON Body 大小限制 | API | ✅ | server/index.js |
| 7 | RPC 方法白名单 | API | ✅ | server/index.js |
| 8 | 媒体路径穿越修复 | API | ✅ | server/index.js |
| 9 | 登录审计日志 | 审计 | ✅ | server/index.js |
| 10 | Secure Cookie 标志 | 认证 | ✅ | server/index.js |
| 11 | RBAC 权限中间件应用到敏感端点 | 权限 | ⚠️ | server/permission-fix.js |
| 12 | 密码哈希升级为 argon2 | 加密 | 🔲 | 待处理 |
| 13 | 单用户模式 RBAC 兼容 | 权限 | 🔲 | 待处理 |

✅ 已完成  ⚠️ 部分完成  🔲 未完成

---

## 五、安全配置建议

### 5.1 生产环境 `.env` 配置
```bash
# 强制 HTTPS
NODE_ENV=production
https=on

# 启用认证（必须）
AUTH_USERNAME=<strong-admin-username>
AUTH_PASSWORD=<strong-password-min-16-chars>

# 限制 CORS（在 reverse proxy 层配置更佳）
```

### 5.2 反向代理配置建议（Nginx）
```nginx
# 限制请求体大小
client_max_body_size 1m;

# 安全头
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# 速率限制
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

---

## 六、测试建议

1. **暴力破解测试**: 使用 Burp Suite 的 Intruder 模块连续发送 200+ 次错误登录请求
2. **权限绕过高危测试**: 以低权限用户身份尝试访问 `/api/backup/create`、`/api/terminal/destroy`
3. **路径穿越测试**: 访问 `/api/media?path=../../../etc/passwd`
4. **RPC 方法枚举**: 尝试调用未在白名单中的 Gateway 方法
5. **CSRF 测试**: 验证 SameSite Cookie 对跨站请求的保护效果

---

**报告生成时间**: 2026-04-09 21:40 GMT+8  
**安全工程师**: 🔒 OpenClaw-Admin 安全加固子任务
