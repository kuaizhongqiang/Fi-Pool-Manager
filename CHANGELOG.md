# [0.2.0](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.1.0...v0.2.0) (2026-06-29)


### Features

* npm publish 配置 ([e706e4a](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/e706e4a3ca24e76699d274ae5c1c98d38ac41cf5))

# Changelog

## [0.1.0] — 2026-06-29

### 🎉 首个稳定版发布

代码审查修复完成，CI/CD 流水线就绪，全量测试通过。

### Features（同 Alpha）

所有核心功能与 v0.2.0-alpha.1 相同。

### Fixes（代码审查）

- 迁移失败终止进程而非静默吞错
- DATA_FETCH_INTERVAL_MS 从 .env 读取
- 唯一约束 SELECT 预检替代字符串匹配
- VERSION 从 package.json 动态读取
- Pipeline 重构为类结构（1124 → 6 个独立方法）
- Config 表与 process.env 双源同步
- openclaw.json 插件清单
- mkdirSync 错误处理 / 错误类型安全断言

### CI/CD

- 构建顺序修复（server → cli + plugin）
- YAML 语法修复
- 三工作流同步（ci / publish / release）

## [0.2.0-alpha.1] — 2026-06-29

### 🎉 首个 Alpha 发布

Fi-Pool-Manager 首个内部测试版本，核心功能完整可用。

### Features

- **股池管理**: 创建/删除/更新股池，增删股票，设置信号
- **行情数据**: 腾讯财经 API 对接（日K线 + 实时报价），频率限制 ≥1200ms
- **技术分析**: MA/EMA/MACD/RSI/KDJ/布林带本地计算，金叉/死叉/超买超卖/放量异动信号检测
- **LLM 分析**: LM Studio OpenAI 兼容 API 对接，Session 管理，字数控制
- **多角色流水线**: 技术分析师 → 基本面分析师 → 舆情分析师 → 风控官，支持 2 轮辩论
- **舆情搜索**: DashScope 联网搜索集成（可选）
- **向量检索**: Embedding 生成 + 余弦相似度语义搜索
- **CLI 工具**: 22+ 个子命令（Commander.js）
- **OpenClaw 插件**: 29 个 MCP 工具注册

### DevOps

- Drizzle ORM + SQLite 数据库（10 张表，自动迁移）
- Vitest 测试框架（102 单元/集成测试）
- GitHub Actions CI（matrix Node 18/20/22 + coverage）
- Docker 多阶段构建（node:22-alpine）
- E2E 真实 API 测试（腾讯财经/LM Studio/DashScope）

### Fixes

- 修复 Drizzle 迁移 SQL 中 `DEFAULT 'datetime(\'now\')'` 引号嵌套问题
- HTTP 客户端超时从 15s 提升至 120s（适配 LLM 首次推理慢）
- 数据库迁移路径改为绝对路径，消除 CWD 依赖
