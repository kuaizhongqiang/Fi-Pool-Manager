# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A股股池管理服务端 — 管理自定义股票池、获取日行情数据、进行技术分析，并通过多角色 LLM 分析产出投资建议报告。

部署在 Ubuntu 服务器上，通过 CLI（Commander.js）和 OpenClaw 插件两种方式交互。

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript (Node.js) |
| 数据库 | SQLite + sqlite-vec |
| ORM | Drizzle ORM |
| CLI | Commander.js |
| 插件 | OpenClaw Plugin SDK |
| LLM | LM Studio（本地推理） |
| 向量嵌入 | OpenAI 兼容远端 API |

## 项目结构

```
fi-pool-manager/
├── packages/
│   ├── server/       # 核心服务：数据获取、分析引擎、LLM调用、向量检索
│   ├── cli/          # CLI 命令行入口（Commander.js）
│   └── plugin/       # OpenClaw 插件（对外暴露工具）
├── docs/             # 文档
│   ├── concepts/     # 概念阶段文档（已归档）
│   ├── overview.md   # 项目综述
│   ├── api-design.md # API 详细设计
│   ├── database-schema.md
│   ├── pipeline-implementation.md
│   └── deployment.md
├── package.json      # workspace root
├── tsconfig.json
└── .env.example
```

## 关键设计决策

- **数据库分离**：数据库文件不打包在项目中，路径通过 `.env` 配置。启动时查找，不存在则初始化，存在则直接连接。版本更新绝不覆盖已有数据，通过 Drizzle 迁移脚本变更表结构。
- **字数控制**：因使用本地 LM Studio（上下文窗口有限），所有 LLM 调用设定了严格的字数上限。
- **输出规范**：所有报告类接口支持 `full`（全量）和 `overview`（概述）两种模式。
- **Session 管理**：运行时内存管理，不持久化。每次流水线创建一个新 session。

## 核心流程

```
数据获取 → 本地分析(LLM) → 向量检索 → 舆情获取 → 多角色分析(LLM) → 综合报告(LLM)
```

多角色按顺序发言：技术分析师 → 基本面分析师 → 舆情分析师 → 风控官。支持多轮辩论。

## 文档索引

详见 [docs/index.md](docs/index.md)。

## Auto Memory Store（.claude/settings.local.json）

通过 Claude Code hooks + MCP agent-memory 实现自动记忆管理：

| 事件 | 触发时机 | 脚本 |
|------|---------|------|
| `UserPromptSubmit` | 用户提交消息后、生成回答前 | `cli/memory-hooks/recall.sh` |
| `Stop` | 生成结束后 | `cli/memory-hooks/capture.sh` |

## 外部文档参考

### OpenClaw 插件开发

| 文档 | 链接 |
|------|------|
| 插件清单（Manifest）规范 | https://docs.openclaw.ai/zh-CN/plugins/manifest |
| 构建插件 | https://docs.openclaw.ai/zh-CN/plugins/building-plugins |
| 工具插件 | https://docs.openclaw.ai/plugins/tool-plugins |
| 插件设置与配置 | https://docs.openclaw.ai/zh-CN/plugins/sdk-setup |
| 插件入口点 | https://docs.openclaw.ai/plugins/sdk-entrypoints |
| 插件套件包（Bundles） | https://docs.openclaw.ai/zh-CN/plugins/bundles |
