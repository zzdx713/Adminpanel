# 性能监控面板部署文档

## 概述

本文档描述 OpenClaw 项目的性能监控面板部署方案，使用 Prometheus + Grafana 技术栈实现系统监控和告警。

## 架构组成

### 监控组件

| 组件 | 端口 | 说明 |
|------|------|------|
| Prometheus | 9090 | 监控数据采集和存储 |
| Grafana | 3001 | 可视化监控面板 |
| Alertmanager | 9093 | 告警管理 |
| Node Exporter | 9100 | 主机指标采集 |
| cAdvisor | 8080 | 容器指标采集 |

## 部署步骤

### 1. 进入监控目录

```bash
cd /www/wwwroot/ai-work/monitoring
```

### 2. 启动监控服务

```bash
docker compose up -d
```

### 3. 验证服务状态

```bash
docker compose ps
```

预期输出：
```
NAME            STATUS
prometheus      Up
grafana         Up
alertmanager    Up
node-exporter   Up
cadvisor        Up
```

### 4. 访问监控界面

- **Prometheus**: http://your-server-ip:9090
- **Grafana**: http://your-server-ip:3001
  - 用户名：admin
  - 密码：admin123
- **Alertmanager**: http://your-server-ip:9093
- **Node Exporter**: http://your-server-ip:9100
- **cAdvisor**: http://your-server-ip:8080

## 监控指标说明

### 主机指标 (Node Exporter)

- CPU 使用率
- 内存使用率
- 磁盘使用率
- 网络流量
- 系统负载

### 容器指标 (cAdvisor)

- 容器 CPU 使用
- 容器内存使用
- 容器网络 I/O
- 容器磁盘 I/O

## 告警规则

### 已配置的告警

| 告警名称 | 触发条件 | 严重级别 |
|---------|---------|---------|
| HighCPUUsage | CPU > 80% 持续 5 分钟 | Warning |
| HighMemoryUsage | 内存 > 80% 持续 5 分钟 | Warning |
| DiskSpaceLow | 磁盘可用 < 20% | Critical |
| ServiceDown | 服务不可用 1 分钟 | Critical |

### 告警通知

告警通过 Alertmanager 发送，支持以下通知方式：
- Webhook
- Email
- Slack
- 飞书机器人

## 自定义监控

### 添加新的监控目标

编辑 `prometheus/prometheus.yml`，添加新的 scrape_config：

```yaml
- job_name: 'your-service'
  static_configs:
    - targets: ['your-service:port']
```

### 创建自定义仪表板

1. 登录 Grafana
2. 点击 "Create" → "Dashboard"
3. 添加查询语句
4. 保存仪表板到 `grafana/provisioning/dashboards/`

## 运维管理

### 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f prometheus
docker compose logs -f grafana
```

### 重启服务

```bash
docker compose restart
```

### 停止服务

```bash
docker compose down
```

### 数据备份

```bash
# 备份 Prometheus 数据
docker run --rm -v prometheus-data:/data -v $(pwd):/backup alpine tar czf /backup/prometheus-backup.tar.gz /data

# 备份 Grafana 数据
docker run --rm -v grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-backup.tar.gz /data
```

## 性能优化建议

1. **Prometheus 存储优化**
   - 调整 `--storage.tsdb.retention.time` 设置保留时间
   - 使用远程存储（如 Thanos、Cortex）

2. **Grafana 优化**
   - 启用查询缓存
   - 减少仪表板刷新频率

3. **网络优化**
   - 使用专用监控网络
   - 配置网络带宽限制

## 故障排查

### Prometheus 无法启动

```bash
# 检查配置文件
promtool check config /www/wwwroot/ai-work/monitoring/prometheus/prometheus.yml

# 查看日志
docker compose logs prometheus
```

### Grafana 无法连接 Prometheus

1. 检查 Prometheus 是否正常运行
2. 检查网络连接：`docker exec grafana ping prometheus`
3. 检查数据源配置

### 告警未触发

1. 检查告警规则语法
2. 查看 Alertmanager 日志
3. 验证 Prometheus 数据采集是否正常

## 集成到现有系统

### 与 OpenClaw 集成

1. 在 OpenClaw 后端添加 `/metrics` 端点
2. 配置 Prometheus 采集 OpenClaw 指标
3. 在 Grafana 创建 OpenClaw 专用仪表板

### 与飞书集成

1. 配置 Alertmanager 发送告警到飞书机器人
2. 在飞书多维表格记录告警事件
3. 设置飞书日程提醒重要告警

## 附录

### 配置文件清单

- `docker-compose.yml` - Docker 编排文件
- `prometheus/prometheus.yml` - Prometheus 配置
- `prometheus/alerts-rules.yml` - 告警规则
- `grafana/provisioning/datasources/datasources.yml` - 数据源配置
- `grafana/provisioning/dashboards/dashboard-providers.yml` - 仪表板提供者配置

### 参考链接

- [Prometheus 官方文档](https://prometheus.io/docs/)
- [Grafana 官方文档](https://grafana.com/docs/)
- [Node Exporter 文档](https://github.com/prometheus/node_exporter)
- [cAdvisor 文档](https://github.com/google/cadvisor)

---
*文档版本：1.0*
*最后更新：2026-04-10*
