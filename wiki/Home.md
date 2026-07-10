# Fi-Pool-Manager Wiki

欢迎来到 **Fi-Pool-Manager** Wiki！这是一份完整的项目知识库。

## 🎯 项目简介

**Fi-Pool-Manager** 是一个 A 股股池管理服务端，用于：
- 🔐 管理自定义股票池
- 📊 获取日行情数据
- 🔍 进行本地技术分析
- 🤖 通过多角色 LLM 分析产出投资建议报告

部署在 **Ubuntu 服务器**上，通过 **CLI（Commander.js）** 和 **OpenClaw 插件**两种方式交互。

---

## 📚 文档导航

### 核心文档

| 文档 | 内容 | 用途 |
|------|------|------|
| **[项目概述](../docs/overview.md)** | 架构、技术栈、数据流 | 快速了解项目 |
| **[API 详细设计](../docs/api-design.md)** | 40+ 个工具接口定义 | 开发参考 |
| **[数据库 Schema](../docs/database-schema.md)** | 13 张表、向量存储 | 数据模型设计 |
| **[流水线实现](../docs/pipeline-implementation.md)** | 5 阶段处理流程 | 运行机制 |
| **[CLI 使用指南](../docs/cli-guide.md)** | 命令行入门 | 日常操作 |
| **[部署与配置](../docs/deployment.md)** | 环境配置、运维指南 | 生产部署 |

### 进阶文档

| 文档 | 内容 |
|------|------|
| **[项目计划](../docs/project-plan.md)** | 功能里程碑、开发进度 |
| **[测试策略](../docs/test-strategy.md)** | 测试方案、覆盖范围 |
| **[每日综述改进方案](../docs/daily-summary-improvement-plan.md)** | v2 优化、异常驱动 + 多维分析 |
| **[每日综述评审报告](../docs/daily-summary-review-report.md)** | 实现细节、问题分析 |

---

## 🏗️ 项目结构

```
fi-pool-manager/
├── packages/
│   ├── server/           # 核心服务：数据获取、分析、LLM、向量检索
│   ├── cli/              # CLI 命令行入口（Commander.js）
│   └── plugin/           # OpenClaw 插件（对外暴露工具）
├── docs/                 # 详细文档
├── scripts/              # 运行脚本
├── skills/               # Claude Code 技能集
├── package.json          # workspace root
└── tsconfig.json
```

---

## 🔧 技术栈

| 层 | 技术 |
|----|------|
| **语言** | TypeScript (Node.js) |
| **插件** | OpenClaw Plugin SDK |
| **CLI** | Commander.js |
| **数据库** | SQLite + sqlite-vec |
| **ORM** | Drizzle ORM |
| **LLM** | LM Studio（本地推理） |
| **向量嵌入** | OpenAI 兼容远端 API |
| **行情数据** | 腾讯财经接口 |

---

## 📊 核心数据流

```
数据获取 → 本地分析(LLM) → 向量检索 → 舆情获取 → 多角色分析(LLM) → 综合报告(LLM)
   ↓            ↓             ↓            ↓           ↓              ↓
 Stage 1      Stage 2       (内部)       Stage 3      Stage 4        Stage 5
```

**多角色发言顺序**：
1. 👨‍💼 技术分析师 — 技术面分析
2. 👨‍📊 基本面分析师 — 业绩、估值面
3. 🔊 舆情分析师 — 市场情绪、新闻
4. ⚠️ 风控官 — 风险提示

支持**多轮辩论**机制。

---

## 🚀 快速开始

### 1. 环境配置

参考 **[部署与配置](../docs/deployment.md)**，主要步骤：

```bash
# 安装依赖
npm install

# 复制并编辑 .env 文件
cp .env.example .env

# 配置必要项：
# - DB_PATH: SQLite 数据库文件路径
# - LM_STUDIO_API: LM Studio 推理 API
# - EMBEDDING_API: 向量嵌入 API
# - TENCENT_FINANCE_KEY: 腾讯财经 API Key
```

### 2. 初始化数据库

```bash
npm run db:migrate
```

### 3. 创建股票池

```bash
npm run cli -- pool create --name "我的池子" --desc "自定义描述"
```

### 4. 添加股票

```bash
npm run cli -- pool add --id 1 --codes 600519,000858
```

### 5. 运行分析流水线

```bash
npm run cli -- pipeline run --pool-id 1
```

详见 **[CLI 使用指南](../docs/cli-guide.md)**。

---

## 📋 工具列表

系统提供 **40+ 个工具**，分为 5 类：

### 管理类（Manager）
创建、删除、更新股池和股票

### 查询类（Query）
查询股池、股票、行情、分析报告

### 命令类（Command）
输出报告、语义搜索、Session 管理

### 执行类（Execute）
异步执行本地分析、完整流水线

### 辅助类（Auxiliary）
帮助、配置、系统状态

详见 **[API 详细设计](../docs/api-design.md)**。

---

## 💾 数据模型

系统使用 **13 张表** + **向量存储**：

```
pool → pool_stock → stock → daily_info
                      ↓
                daily_analysis_report ──→ vec_embedding
                      ↓                  (analysis 向量)
                sentiment_report
                      ↓
                analysis_roler
                      ↓
                final_report ──────────→ vec_embedding
                      ↓                  (final 向量)
                daily_summary_detail
                      ↓
                daily_summary ─────────→ vec_embedding
                               (daily_summary 向量)

pipeline_run（独立表，流水线运行历史）
config（独立表，系统配置 KV 存储）
```

详见 **[数据库 Schema](../docs/database-schema.md)**。

---

## 🔐 关键设计决策

### 数据库分离
- 数据库文件**不打包**在项目中
- 路径通过 `.env` 配置
- 启动时自动初始化（不存在）或连接（存在）
- 版本更新**绝不覆盖**已有数据，通过 Drizzle 迁移脚本变更表结构

### 字数控制
- 使用本地 LM Studio（上下文窗口有限）
- 所有 LLM 调用设定**严格字数上限**
- 防止超长输入导致 API 错误

### 输出规范
- 所有报告类接口支持 `full`（全量）和 `overview`（概述）两种模式
- Full：完整分析细节，字数多
- Overview：精简摘要，仅含结论和核心指标

### Session 管理
- 运行时**内存管理**，不持久化
- 每次流水线创建一个新 session
- 支持多轮对话

---

## 🛠️ 开发建议

### 文件理解
需要深入理解某个文件或模块？使用 Claude Code 的 **file-understanding** 能力。

### PR 审查
需要代码审查意见？使用 **pr-reviewer** 能力。

### 自动记忆
通过 Claude Code hooks + MCP agent-memory 实现：
- **UserPromptSubmit**：用户提交消息后触发 `recall.sh`（回忆）
- **Stop**：生成结束后触发 `capture.sh`（记录）

配置位置：`.claude/settings.local.json`

---

## 📖 相关资源

### OpenClaw 插件开发文档
- [插件清单（Manifest）规范](https://docs.openclaw.ai/zh-CN/plugins/manifest)
- [构建插件](https://docs.openclaw.ai/zh-CN/plugins/building-plugins)
- [工具插件](https://docs.openclaw.ai/plugins/tool-plugins)
- [插件设置与配置](https://docs.openclaw.ai/zh-CN/plugins/sdk-setup)
- [插件入口点](https://docs.openclaw.ai/plugins/sdk-entrypoints)
- [插件套件包（Bundles）](https://docs.openclaw.ai/zh-CN/plugins/bundles)

---

## 📞 常见问题

### 如何在 CLI 中创建新的分析命令？
1. 在 `packages/cli/src` 中新建命令文件
2. 在命令中调用 `packages/server/src` 中的相应服务
3. 注册命令到 Commander.js
4. 同时在 OpenClaw 插件中暴露对应工具

### 如何添加新的技术指标？
修改 `packages/server/src/analysis/indicators.ts`，新增指标计算函数，并更新 `daily_analysis_report` 的 `indicators` JSON 结构。

### 如何调试 LLM 调用？
1. 检查 `.env` 中 `LM_STUDIO_API` 配置
2. 查看日志中的请求/响应内容
3. 调整字数限制重新测试

### 如何导出报告？
使用 `outputAnalysisReport` 或 `outputFinalReport` 工具，支持 `overview` 和 `full` 两种模式。

---

## 📝 版本

- **当前版本**：0.4.9
- **最后更新**：2026-07-09
- **许可证**：MIT

---

## 🤝 贡献

欢迎提交 Issues 和 Pull Requests！

---

**祝你使用愉快！** 🚀
