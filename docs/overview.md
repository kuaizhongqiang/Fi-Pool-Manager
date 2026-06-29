# Fi-Pool-Manager 项目综述

> 版本：0.1.0（设计阶段）
> 最后更新：2026-06-29

## 项目定位

A 股股池管理服务端。用于管理自定义股票池、获取日行情数据、进行本地技术分析，并通过多角色 LLM 分析产出投资建议报告。

部署在 Ubuntu 服务器上，通过 CLI 和 OpenClaw 插件两种方式交互。

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                   使用者                            │
│   终端 (CLI)              OpenClaw / AI 代理       │
└────────┬────────────────────────┬───────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐   ┌──────────────────────────────┐
│   cli/          │   │   plugin/                    │
│   Commander.js  │   │   OpenClaw Plugin (MCP)      │
│   命令行入口     │   │   暴露工具给 AI 代理         │
└───────┬─────────┘   └────────────┬─────────────────┘
        │                          │
        └──────────┬───────────────┘
                   ▼
        ┌─────────────────────┐
        │      server/        │
        │  核心服务层          │
        │                     │
        │  ├─ 数据获取模块    │── 腾讯财经接口
        │  ├─ 本地分析引擎    │── 技术指标计算
        │  ├─ LLM 分析引擎    │── LM Studio 本地 LLM
        │  ├─ 向量检索模块    │── Embedding API → sqlite-vec
        │  ├─ 舆情搜索模块    │── 搜索 API
        │  └─ 数据访问层      │── Drizzle ORM → SQLite
        └─────────────────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │     SQLite 数据库   │
        │  (路径可配置)       │
        │  含 sqlite-vec 向量 │
        └─────────────────────┘
```

## 核心数据流

```
数据获取 → 本地分析 → 向量检索 → 舆情获取 → 多角色分析 → 综合报告
  Stage1     Stage2      Stage3     Stage4       Stage5      Stage6
```

详见 [流水线设计](concepts/analysis-pipeline.md)。

## 技术栈一览

| 层 | 技术 |
|----|------|
| 语言 | TypeScript (Node.js) |
| 插件层 | OpenClaw Plugin SDK |
| CLI | Commander.js |
| 数据库 | SQLite + sqlite-vec |
| ORM | Drizzle ORM |
| LLM 推理 | LM Studio (本地) |
| 向量嵌入 | OpenAI 兼容远端 API |
| 行情数据 | 腾讯财经接口 |
| 配置 | .env |

## 输出规范

所有报告类输出支持两种粒度：
- **Full（全量）**：完整报告，包含所有分析细节
- **Overview（概述）**：精简摘要，仅含结论和核心指标

## 目录结构

```
fi-pool-manager/
├── packages/
│   ├── server/         # 核心服务
│   │   ├── src/
│   │   │   ├── data/       # 数据获取
│   │   │   ├── analysis/   # 本地分析
│   │   │   ├── llm/        # LLM 调用
│   │   │   ├── vector/     # 向量检索
│   │   │   ├── search/     # 舆情搜索
│   │   │   ├── db/         # 数据库访问
│   │   │   └── session/    # Session 管理
│   │   └── package.json
│   ├── cli/            # CLI 入口
│   │   ├── src/
│   │   └── package.json
│   └── plugin/         # OpenClaw 插件
│       ├── src/
│       └── package.json
├── docs/               # 文档
├── package.json        # workspace root
├── tsconfig.json
├── .env.example
└── README.md
```

## 相关文档

| 文档 | 说明 |
|------|------|
| [概念定义](concepts/concepts.md) | 核心概念 |
| [工具分类](concepts/tools-overview.md) | 29 个工具，5 个分类 |
| [数据表设计](concepts/data-tables.md) | 11 张表 |
| [技术选型](concepts/tech-stack.md) | 技术栈定案 |
| [API 详细设计](api-design.md) | 接口定义 |
| [数据库 Schema](database-schema.md) | DDL 定义 |
| [流水线实现](pipeline-implementation.md) | 实现细节 |
| [配置与部署](deployment.md) | 运维指南 |
