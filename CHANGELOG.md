# [0.3.6](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.5...v0.3.6) (2026-07-02)

### Features

* **pipeline**: 流水线串行执行 — run-pool-pipeline 支持多池 ID + --all 参数 (#124)
* **pipeline**: 增加流水线停止命令 — stop-pipeline / list-pipelines (#123)
* **sector**: 板块数据源接入（东方财富免费 API）— 多维分析注入真实板块数据 (#102)

### Bug Fixes

* **embedding**: getApiUrl() 回退 LLM_BASE_URL，远程部署自动适配 (#120)
* **daily-summary**: v1 标记废弃并提示使用 daily-summary-v2 (#121)

### Documentation

* **env**: .env.example 已包含 EMBEDDING_API_URL 注释说明 (#122)

# [0.3.5](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.4...v0.3.5) (2026-06-30)

### Bug Fixes

* **daily-info**: fetchRealTimeQuote() 改为 GBK 解码避免股票名称乱码 (#118)
* **api**: POST /api/v1/stocks/repair-names 修复端点恢复已损坏的股票名称 (#118)

# [0.3.4](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.3...v0.3.4) (2026-06-30)

### Features

* **api**: 新增 /api/v1/pools、/api/v1/pools/:id/stocks、/api/v1/analysis/batch 端点 (#116)

# [0.3.3](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.2...v0.3.3) (2026-06-30)

### Bug Fixes

* **embedding**: 模块级常量改为惰性读取，修复 dotenv 加载前初始化问题 (#114)

# [0.3.2](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.1...v0.3.2) (2026-06-30)

### Bug Fixes

* **db**: daily_summary_detail 添加 (stock_code, date, dimension) 唯一索引 (#109)
* **daily-summary-v2**: selectAnomalyStocks 的 anomalyScore null 防御 (#110)
* **daily-summary-v2**: selectPromptEntries availableTokens 下限保护 (#111)
* **daily-summary-v2**: analyzeAnomalyStock LLM 失败时跳过写入和向量化 (#112)

# [0.3.1](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.3.0...v0.3.1) (2026-06-30)

### Bug Fixes

* **migration**: created_at DEFAULT 改为函数调用，anomaly_score 显式 REAL ([f7ec7ab]()), closes [#105](/issues/105)
* **cli**: 版本号 0.2.4 → 0.3.0 ([f7ec7ab]()), closes [#106](/issues/106)
* **schema**: vec_embedding.content_type 注释补充新增类型 ([f7ec7ab]()), closes [#107](/issues/107)

# [0.3.0](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v0.2.4...v0.3.0) (2026-06-30)

### Features

* **daily-summary**: Token 预算动态截断，修复 #85 400 错误 (3454993), closes #91
* **pipeline**: 规则引擎 anomaly_base 异常打分 + LLM 微调 (7537e29), closes #92 #93
* **db**: 新增 daily_summary/daily_summary_detail 表 + final_report.anomaly_score (868c522), closes #94
* **daily-summary-v2**: 异常筛选 + 多维分析 + prompt 筛选 + 综合报告 + CLI 命令 (4fd1bd6), closes #95 #96 #97 #98 #99 #100
* **RAG**: 跨日期历史 daily_summary 检索（searchSimilar 增加 dateBefore）(59ba454), closes #101
* **api**: REST API 端点 + serve CLI 命令 (b7ed7c8), closes #86 #87 #88 #89 #90

## [1.1.2](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v1.1.1...v1.1.2) (2026-06-29)


### Bug Fixes

* add-stocks 自动补全 stock 记录 ([de61394](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/de6139497ee657e62f1617d7733945253f803066))
* add-stocks 自动补全 stock 记录避免 FK 约束失败 ([85ce12a](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/85ce12aee0224c772ff928cc9fb84d1dba915f1e)), closes [#69](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/69)
* Docker 镜像名转小写（ghcr.io 要求） ([a55b37e](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/a55b37eaa72a249d0997b9925fa2d2c8d2c8eb75))

## [1.1.1](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v1.1.0...v1.1.1) (2026-06-29)


### Bug Fixes

* 8 个 OpenClaw 测试 Issue 修复 ([db102f8](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/db102f883541e856640177734e95a9c99f584764)), closes [#60](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/60) [#65](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/65) [#61](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/61) [#62](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/62) [#63](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/63) [#64](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/64) [#66](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/66) [#67](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/67)
* 8 个 OpenClaw 测试反馈 Issue 修复 ([a574297](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/a5742978507d388f358183daa43338470dec622d))

# [1.1.0](https://github.com/kuaizhongqiang/Fi-Pool-Manager/compare/v1.0.0...v1.1.0) (2026-06-29)


### Features

* Docker 容器化 — HTTP 服务入口 + ghcr.io 自动推送 ([b8510fd](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/b8510fd0aec68182d2af8e5392849d6932a67a52))

# 1.0.0 (2026-06-29)


### Bug Fixes

* E2E 测试 & 迁移 SQL 修复 ([46dc0aa](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/46dc0aa872fb89ccc90e54380dc3be1eab9bb289))
* **M4:** Config 表与 .env 双源同步 ([51f3242](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/51f3242c7fd112177d2b7e367f1e5264c076635c)), closes [#55](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/55)
* 代码审查 7 个 Issue 修复 ([055f2d9](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/055f2d95f7152c31db5e301c197345db41a7f031))
* 代码审查 7 个 Issue 修复 ([6e7e70e](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/6e7e70e8b098df0f3e703902ba0ccde044e63731)), closes [#49](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/49) [#50](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/50) [#51](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/51) [#52](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/52) [#53](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/53) [#54](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/54) [#55](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/55)
* 按 PM 审核报告修复文档问题 ([55c72f0](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/55c72f061b74f0cc331402ddd2c4c799dce3ab04))


### Features

* npm publish — fi-pool-server + fi-pool-cli ([bb9d889](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/bb9d8890f81d220859b0024f9ef040e98a047f0c))
* npm publish — fi-pool-server + fi-pool-cli v0.1.0 ([ec0f753](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/ec0f7538ab9a2359af1e38076543029762098c86))
* npm publish 配置 ([e706e4a](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/e706e4a3ca24e76699d274ae5c1c98d38ac41cf5))
* **phase-1:** 项目基础设施 ([e1f29e4](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/e1f29e43754f3a11164d2bfc32499df677d2833a))
* **phase-2:** 数据层 — 腾讯财经接口对接与 CRUD 服务 ([2b1f0f2](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/2b1f0f22daa9d04a09e37aae82d6d424c3930d7e))
* **phase-3:** CLI 命令 — Commander.js 全量交互命令 ([5fb2824](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/5fb2824a339d78eee314c908f44150105eff0419))
* **phase-4:** 技术分析引擎 — 指标算法与信号检测 ([86ca17f](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/86ca17f6288bfad2e60c1962d57afe8b6d18eeef))
* **phase-5:** LLM 集成 — LM Studio API, Session 管理, 字数控制, 向量检索 ([ca220cd](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/ca220cd9a206ddcdc97dfd1b28fa3f763eec6f9f))
* **phase-6:** 分析流水线 — Stage 1~5 全流程编排 ([002cde3](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/002cde3b1da7cd9173ef907e7390a8af516dc6fc))
* **phase-7:** OpenClaw 插件 — 29 个 MCP 工具注册 ([9636504](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/9636504783badc64c18d336c789f1bb53c07d9fa))
* **phase-8-extension:** CI/CD 增强 + 全量测试 + 项目管理 Skill ([1baa650](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/1baa6505fe07bd7b1589c7a503c6a59f8cc0209b)), closes [#43](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/43) [#44](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/44) [#45](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/45) [#46](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/46)
* **phase-8:** 测试框架、CI 配置与部署脚本 ([7e38e74](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/7e38e74a66c60933fda364e39abb99c816c12cd6))
* 接入 DashScope 舆情搜索 API，阻塞项 P1 解决 ([ddabbba](https://github.com/kuaizhongqiang/Fi-Pool-Manager/commit/ddabbbac14f84ae2e8169a03a7c0ec7fbf6c1fee)), closes [#13](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/13)

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
