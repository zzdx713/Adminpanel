# 批量操作 API 文档

> **文档版本**: v1.0  
> **最后更新**: 2026-04-11  
> **维护者**: 后端开发工程师  
> **状态**: ✅ 已完成

---

## 概述

批量操作 API 提供高效的数据批量处理能力，支持批量删除、批量状态变更、批量查询、批量导出和批量分配等功能。

**基础路径**: `/api/batch`  
**认证要求**: 所有接口都需要 JWT Token 认证  
**权限要求**: 根据操作类型需要相应的资源权限

---

## 接口列表

### 1. 批量删除

**接口**: `DELETE /api/batch/:resource`

**描述**: 批量删除指定资源的多条记录

**路径参数**:
| 参数 | 类型 | 必填 | 说明 | 可选值 |
|------|------|------|------|--------|
| resource | string | 是 | 资源类型 | users, tasks, scenarios, audit-logs |

**请求体**:
```json
{
  "ids": ["id1", "id2", "id3"]
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | 是 | 要删除的记录 ID 数组，至少包含 1 个 ID |

**权限要求**: `{resource}:delete`

**成功响应**:
```json
{
  "success": true,
  "deleted_count": 3,
  "failed_ids": []
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "无效的请求参数"
}
```

**示例**:
```bash
# 批量删除用户
DELETE /api/batch/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["user_001", "user_002", "user_003"]
}
```

---

### 2. 批量状态变更

**接口**: `PATCH /api/batch/:resource/status`

**描述**: 批量更新指定资源的状态

**路径参数**:
| 参数 | 类型 | 必填 | 说明 | 可选值 |
|------|------|------|------|--------|
| resource | string | 是 | 资源类型 | users, tasks, scenarios, audit-logs |

**请求体**:
```json
{
  "ids": ["id1", "id2", "id3"],
  "status": "active"
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | 是 | 要更新的记录 ID 数组 |
| status | string | 是 | 新的状态值 |

**权限要求**: `{resource}:update`

**成功响应**:
```json
{
  "success": true,
  "updated_count": 3,
  "failed_ids": []
}
```

**示例**:
```bash
# 批量启用任务
PATCH /api/batch/tasks/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["task_001", "task_002", "task_003"],
  "status": "enabled"
}
```

---

### 3. 批量查询

**接口**: `POST /api/batch/:resource/batch-get`

**描述**: 批量查询指定资源的详细信息

**路径参数**:
| 参数 | 类型 | 必填 | 说明 | 可选值 |
|------|------|------|------|--------|
| resource | string | 是 | 资源类型 | users, tasks, scenarios, audit-logs |

**请求体**:
```json
{
  "ids": ["id1", "id2", "id3"],
  "fields": ["id", "name", "status"]
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | 是 | 要查询的记录 ID 数组 |
| fields | string[] | 否 | 要返回的字段列表，不传则返回所有字段 |

**权限要求**: `{resource}:read`

**成功响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "user_001",
      "name": "张三",
      "email": "zhangsan@example.com",
      "status": "active"
    },
    {
      "id": "user_002",
      "name": "李四",
      "email": "lisi@example.com",
      "status": "inactive"
    }
  ],
  "count": 2
}
```

**示例**:
```bash
# 批量查询用户信息（只返回指定字段）
POST /api/batch/users/batch-get
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["user_001", "user_002"],
  "fields": ["id", "name", "email"]
}
```

---

### 4. 批量导出

**接口**: `POST /api/batch/:resource/export`

**描述**: 批量导出指定资源的数据为 CSV 或 JSON 格式

**路径参数**:
| 参数 | 类型 | 必填 | 说明 | 可选值 |
|------|------|------|------|--------|
| resource | string | 是 | 资源类型 | users, tasks, scenarios, audit-logs |

**请求体**:
```json
{
  "ids": ["id1", "id2", "id3"],
  "format": "csv",
  "fields": ["id", "name", "status"]
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| ids | string[] | 是 | 要导出的记录 ID 数组 | - |
| format | string | 否 | 导出格式 | csv |
| fields | string[] | 否 | 要导出的字段列表 | 所有字段 |

**权限要求**: `{resource}:read`

**成功响应**:
- CSV 格式：直接返回文件内容，Content-Type: `text/csv`
- JSON 格式：返回 JSON 数据

**示例**:
```bash
# 导出用户数据为 CSV
POST /api/batch/users/export
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["user_001", "user_002", "user_003"],
  "format": "csv"
}

# 响应头
Content-Type: text/csv
Content-Disposition: attachment; filename=users_export.csv
```

---

### 5. 批量分配（仅任务）

**接口**: `PATCH /api/batch/tasks/assign`

**描述**: 批量分配任务给指定用户

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resource | string | 是 | 固定为 tasks |

**请求体**:
```json
{
  "ids": ["task_001", "task_002", "task_003"],
  "assigneeId": "user_001"
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | 是 | 要分配的任务 ID 数组 |
| assigneeId | string | 是 | 要分配给的用户 ID |

**权限要求**: `tasks:update`

**成功响应**:
```json
{
  "success": true,
  "assigned_count": 3,
  "failed_ids": []
}
```

**示例**:
```bash
# 批量分配任务
PATCH /api/batch/tasks/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["task_001", "task_002", "task_003"],
  "assigneeId": "user_001"
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| invalid_params | 400 | 请求参数无效（如 ids 为空数组） |
| invalid_resource | 400 | 无效的资源类型 |
| unauthorized | 401 | 未提供有效的认证 Token |
| forbidden | 403 | 没有相应的操作权限 |
| internal_error | 500 | 服务器内部错误 |

**错误响应格式**:
```json
{
  "success": false,
  "error": "错误描述信息"
}
```

---

## 安全说明

1. **SQL 注入防护**: 所有接口使用参数化查询，防止 SQL 注入
2. **权限验证**: 每个接口都经过权限中间件验证
3. **字段白名单**: 批量查询时只允许安全的字段名
4. **请求验证**: 使用 express-validator 进行请求参数验证

---

## 性能优化建议

1. **批量大小限制**: 建议单次操作不超过 100 条记录
2. **字段选择**: 批量查询时只请求需要的字段
3. **并发控制**: 避免同时发起大量批量操作请求

---

## 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-04-11 | 初始版本，完成所有批量操作接口 | 后端开发工程师 |

---

**文档结束**

*👨‍💻 后端开发工程师 出品*
