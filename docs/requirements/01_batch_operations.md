# 批量操作功能需求文档

**文档版本**: 1.0  
**创建日期**: 2026-04-11  
**优先级**: P1-高  
**状态**: 需求分析完成

---

## 1. 需求背景

当前系统在数据管理操作中缺乏批量处理能力，用户需要逐个操作大量数据（如批量删除会话、批量启用/禁用 Agent、批量分配权限等），效率低下且容易出错。

## 2. 功能需求

### 2.1 批量选择

**FR-2.1.1 多选功能**
- 支持复选框多选
- 支持 Shift+ 点击范围选择
- 支持 Ctrl/Cmd+ 点击单独添加
- 支持"全选当前页"和"全选所有数据"

**FR-2.1.2 选择状态保持**
- 翻页后保持已选项目
- 跨页选择提示"已选择 X 条，共 Y 条"
- 支持清除全部选择

### 2.2 批量操作类型

**FR-2.2.1 批量删除**
- 删除会话记录
- 删除 Agent 配置
- 删除用户账户
- 删除日志记录
- 二次确认 + 操作审计

**FR-2.2.2 批量状态变更**
- 批量启用/禁用 Agent
- 批量启用/禁用用户
- 批量标记已读/未读
- 批量归档/恢复

**FR-2.2.3 批量分配**
- 批量分配角色
- 批量分配权限
- 批量分配资源归属
- 批量修改标签

**FR-2.2.4 批量导出**
- 批量导出选中数据为 CSV/Excel
- 支持自定义导出字段
- 异步导出大数量数据

### 2.3 批量操作执行

**FR-2.3.1 异步处理**
- 大数据量操作异步执行
- 提供操作进度条
- 支持后台执行，用户可继续其他操作

**FR-2.3.2 操作结果反馈**
- 成功/失败统计
- 失败项详细列表
- 支持重试失败项

**FR-2.3.3 操作撤销**
- 提供操作撤销窗口（如 5 分钟内）
- 删除操作支持软删除可恢复
- 状态变更可快速回滚

## 3. 非功能需求

### 3.1 性能

**NFR-3.1.1 响应时间**
- 批量选择操作 < 100ms
- 批量操作提交 < 2s
- 批量删除 1000 条 < 10s

**NFR-3.1.2 并发处理**
- 支持批量操作队列
- 限制同时执行的批量任务数（默认 3 个）
- 防止重复提交

### 3.2 安全性

**NFR-3.2.1 权限控制**
- 每个批量操作需对应权限
- 批量删除需高级权限
- 操作前验证每条记录的权限

**NFR-3.2.2 操作审计**
- 记录批量操作者、时间、对象
- 记录操作前后状态快照
- 审计日志不可删除

### 3.3 用户体验

**NFR-3.3.1 操作引导**
- 首次使用显示操作指引
- 危险操作明确警告
- 提供操作示例

**NFR-3.3.2 错误处理**
- 友好的错误提示
- 部分失败不影响成功项
- 提供详细的错误原因

## 4. API 设计

### 4.1 批量删除

```javascript
// POST /api/batch/delete
// 请求体：
{
  "resource": "sessions" | "agents" | "users" | "logs",
  "ids": ["id1", "id2", "id3"],
  "options": {
    "softDelete": true,  // 软删除
    "notify": true       // 通知相关人员
  }
}

// 响应：
{
  "success": true,
  "processed": 100,
  "succeeded": 98,
  "failed": 2,
  "failedItems": [
    {"id": "id99", "error": "权限不足"},
    {"id": "id100", "error": "记录不存在"}
  ]
}
```

### 4.2 批量状态变更

```javascript
// POST /api/batch/update-status
// 请求体：
{
  "resource": "agents",
  "ids": ["id1", "id2"],
  "field": "status",
  "value": "disabled"
}
```

### 4.3 批量导出

```javascript
// POST /api/batch/export
// 请求体：
{
  "resource": "sessions",
  "ids": ["id1", "id2", "id3"],
  "format": "csv" | "xlsx",
  "fields": ["id", "user_id", "created_at", "status"]
}

// 响应：
{
  "taskId": "task_xxx",
  "estimatedTime": 30,  // 秒
  "downloadUrl": "/api/tasks/task_xxx/download"
}
```

## 5. 前端组件设计

### 5.1 批量操作工具栏

```vue
<template>
  <div class="batch-toolbar" v-if="selectedCount > 0">
    <span class="selection-info">
      已选择 {{ selectedCount }} 项
      <button @click="clearSelection">清除选择</button>
    </span>
    <div class="batch-actions">
      <button @click="batchDelete" v-if="canDelete">批量删除</button>
      <button @click="batchEnable" v-if="canEnable">批量启用</button>
      <button @click="batchDisable" v-if="canDisable">批量禁用</button>
      <button @click="batchExport">批量导出</button>
      <button @click="batchAssignRole" v-if="canAssign">分配角色</button>
    </div>
  </div>
</template>
```

### 5.2 批量操作进度对话框

```vue
<template>
  <el-dialog title="批量操作进度">
    <el-progress :percentage="progress" :status="status"></el-progress>
    <div class="stats">
      <span>成功：{{ succeeded }}</span>
      <span>失败：{{ failed }}</span>
      <span>剩余：{{ remaining }}</span>
    </div>
    <div class="failed-list" v-if="failedItems.length">
      <h4>失败项：</h4>
      <el-collapse>
        <el-collapse-item v-for="item in failedItems" :key="item.id">
          <template #title>{{ item.id }}</template>
          {{ item.error }}
          <button @click="retryItem(item.id)">重试</button>
        </el-collapse-item>
      </el-collapse>
    </div>
  </el-dialog>
</template>
```

## 6. 数据库设计

### 6.1 批量操作日志表

```sql
CREATE TABLE IF NOT EXISTS batch_operation_logs (
    id              TEXT    PRIMARY KEY,
    operator_id     TEXT    NOT NULL,
    operator_name   TEXT,
    resource        TEXT    NOT NULL,
    operation_type  TEXT    NOT NULL,  -- delete|update|export
    total_count     INTEGER NOT NULL,
    succeeded_count INTEGER DEFAULT 0,
    failed_count    INTEGER DEFAULT 0,
    status          TEXT    DEFAULT 'running',  -- running|completed|failed
    started_at      INTEGER NOT NULL,
    completed_at    INTEGER,
    result_summary  TEXT,  -- JSON 格式
    created_at      INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS batch_operation_details (
    id              TEXT    PRIMARY KEY,
    batch_log_id    TEXT    NOT NULL,
    item_id         TEXT    NOT NULL,
    status          TEXT    NOT NULL,  -- success|failed
    error_message   TEXT,
    before_state    TEXT,  -- JSON 快照
    after_state     TEXT,  -- JSON 快照
    created_at      INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (batch_log_id) REFERENCES batch_operation_logs(id) ON DELETE CASCADE
);

CREATE INDEX idx_batch_logs_operator ON batch_operation_logs(operator_id);
CREATE INDEX idx_batch_logs_resource ON batch_operation_logs(resource);
CREATE INDEX idx_batch_details_batch ON batch_operation_details(batch_log_id);
```

## 7. 验收标准

| 编号 | 验收标准 | 验证方法 |
|------|----------|----------|
| AC-7.1 | 支持复选框多选和范围选择 | 前端交互测试 |
| AC-7.2 | 翻页后保持选择状态 | 跨页选择测试 |
| AC-7.3 | 批量删除 100 条记录 < 5s | 性能测试 |
| AC-7.4 | 批量操作失败项可单独重试 | 功能测试 |
| AC-7.5 | 操作日志完整记录 | 数据库验证 |
| AC-7.6 | 权限不足的项目被跳过并提示 | 权限测试 |
| AC-7.7 | 支持软删除并可恢复 | 功能测试 |
| AC-7.8 | 大数据量导出异步处理 | 功能测试 |

## 8. 实施计划

| 阶段 | 内容 | 预计工时 |
|-----|------|---------|
| 1 | 后端批量操作 API 开发 | 1 天 |
| 2 | 批量操作日志系统设计 | 0.5 天 |
| 3 | 前端批量选择组件 | 1 天 |
| 4 | 前端批量操作工具栏 | 0.5 天 |
| 5 | 批量导出功能 | 0.5 天 |
| 6 | 集成测试与优化 | 0.5 天 |

**总计**: 4 天

---

**下一步**: 技术评审 → 任务分解 → 开发实施
