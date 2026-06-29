# CODEBUDDY.md

This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

Fi-Pool-Manager 是一个 A 股股池管理服务端，用于管理自定义股票池、获取日行情数据、进行技术分析，并通过多角色 LLM 分析产出投资建议报告。

部署在 Ubuntu 服务器上，通过 CLI（Commander.js）和 OpenClaw 插件两种方式交互。

## 当前阶段

项目已完成**概念定义与详细设计**，处于编码前准备阶段。

所有设计文档位于 `docs/`：

| 文档 | 说明 |
|------|------|
| [项目综述](docs/overview.md) | 架构总览 |
| [概念定义](docs/concepts/concepts.md) | 15 个核心概念 |
| [API 详细设计](docs/api-design.md) | 29 个工具的入参/返回值 |
| [数据库 Schema](docs/database-schema.md) | 11 张表的字段与索引 |
| [流水线实现设计](docs/pipeline-implementation.md) | 6 阶段分析流程与 Prompt |
| [配置与部署](docs/deployment.md) | .env 配置与运维 |

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
| 行情数据 | 腾讯财经接口 |

## 项目结构

```
fi-pool-manager/
├── packages/
│   ├── server/       # 核心服务：数据获取、分析引擎、LLM调用、向量检索
│   ├── cli/          # CLI 命令行入口（Commander.js）
│   └── plugin/       # OpenClaw 插件（对外暴露工具）
├── docs/             # 设计文档
│   ├── concepts/     # 概念阶段归档
│   ├── overview.md
│   ├── api-design.md
│   ├── database-schema.md
│   ├── pipeline-implementation.md
│   └── deployment.md
├── cli/              # Memory hook 脚本（Claude Code 基础设施）
├── package.json      # workspace root
└── .env.example
```

## 关键设计决策

- **数据库分离**：数据库路径通过 `.env` 配置，代码与数据分离，版本更新不覆盖已有数据
- **字数控制**：LLM 调用有严格字数上限，适配本地 LM Studio 上下文窗口
- **输出规范**：所有报告接口支持 full（全量）和 overview（概述）两种模式
- **Session 管理**：运行时内存管理，不持久化

## 核心流程

```
数据获取 → 客观报告(LLM) → 舆情获取 → 多角色分析(LLM) → 综合报告(LLM)
```

多角色按顺序发言：技术分析师 → 基本面分析师 → 舆情分析师 → 风控官。支持多轮辩论。

## Memory Hooks

| 脚本 | 路径 | 触发时机 |
|------|------|---------|
| recall.sh | `cli/memory-hooks/recall.sh` | 用户提交消息后，生成回答前 |
| capture.sh | `cli/memory-hooks/capture.sh` | 生成结束后 |

两个脚本从 `.mcp.json` 读取连接配置（BRIDGE_URL、API_KEY、SENDER），静默失败不阻塞主流程。

## 外部参考

- [OpenClaw 插件开发文档](https://docs.openclaw.ai/zh-CN/plugins/manifest)
- [Drizzle ORM 文档](https://orm.drizzle.team)
- [Commander.js 文档](https://github.com/tj/commander.js)
