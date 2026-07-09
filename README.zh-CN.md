# Fi-Pool-Manager

[![CI](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![npm downloads](https://img.shields.io/npm/dm/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![License](https://img.shields.io/github/license/kuaizhongqiang/Fi-Pool-Manager)](LICENSE)

> **A 股股池管理服务端** — 管理自定义股票池、获取日行情数据、技术分析、多角色 LLM 分析。
>
> **[English](README.md)**

---

## 功能一览

| 功能 | 说明 | 状态 |
|------|------|------|
| 📦 股池管理 | 创建/删除/更新股池，增删股票 | ✅ |
| 📊 行情数据 | 腾讯财经接口获取日线 OHLCV 数据 | ✅ |
| 📈 技术分析 | MA/MACD/RSI/KDJ/布林带 + 信号检测 | ✅ |
| 🤖 LLM 分析 | LM Studio 本地推理，四角色辩论流水线 | ✅ |
| 🌐 舆情搜索 | DashScope 联网搜索（可选） | ✅ |
| 🔍 向量检索 | 语义搜索历史分析报告 | ✅ |
| 📋 每日综述 | 流水线完成后自动触发 LLM 生成每日投资回顾 | ✅ |
| 🏭 板块数据 | 东方财富行业/概念板块数据源 | ✅ |
| 🛑 流水线控制 | 多池串行编排 + 停止 + **断点重开** | ✅ |
| 🔄 断点重开 | 中断后自动跳过已完成股票，`--missing` 补跑模式 | ✅ |
| 📊 诊断命令 | check-data / pool-status / summary-status / pipeline-log | ✅ |
| 🖥️ CLI | 30+ 子命令，Commander.js | ✅ |
| 🔌 OpenClaw 插件 | 36 个 MCP 工具（Claude / Cursor 等可用） | ✅ |

## 快速开始

### 前置要求

- **Node.js** ≥ 20
- **LM Studio**（可选）— 加载模型如 `qwen3.5-9b`

### 安装

**npm 全局安装（推荐）**

```bash
npm install -g fi-pool-cli
fi-pool help
```

**从源码运行**

```bash
git clone https://github.com/kuaizhongqiang/Fi-Pool-Manager.git
cd Fi-Pool-Manager
npm install
npm run build
```

**Docker**

```bash
docker pull ghcr.io/kuaizhongqiang/fi-pool-manager:latest
docker run -p 3000:3000 -v /data:/data ghcr.io/kuaizhongqiang/fi-pool-manager
# 健康检查: http://localhost:3000/health
# 系统状态: http://localhost:3000/status
```

### 配置

```bash
cp .env.example .env
# 编辑 .env，至少配置：
#   LLM_BASE_URL — LM Studio 地址（默认 http://127.0.0.1:1234）
#   DASHSCOPE_API_KEY — 舆情搜索（可选）
```

### 使用

```bash
# 查看所有命令
fi-pool help

# 系统状态
fi-pool status

# 创建股池
fi-pool pool create "我的自选"
fi-pool pool add-stocks 1 600519 000858

# 查看行情
fi-pool get-stock 600519
fi-pool get-daily 600519 2026-01-01 2026-06-29

# 完整流水线
fi-pool run-pipeline 600519
fi-pool run-pool-pipeline 1 2 3        # 多池串行
fi-pool run-pool-pipeline --all        # 全池执行
fi-pool run-pool-pipeline --missing    # 仅补跑未完成

# 每日综述
fi-pool daily-summary-v2
fi-pool daily-summary-v2 --verbose

# 诊断
fi-pool check-data
fi-pool pool-status 1
fi-pool pipeline-log

# 报告
fi-pool get-analysis 600519 2026-06-29
fi-pool get-final 600519 2026-06-29 --mode full
```

## 流水线架构

```
数据获取 → 客观报告(LLM) → 舆情获取 → 多角色分析 → 综合报告
  Stage 1      Stage 2       Stage 3      Stage 4       Stage 5
```

四个分析角色按顺序发言，支持第二轮交叉辩论：

| 角色 | 侧重 | 第一轮 | 第二轮 |
|------|------|--------|--------|
| 技术分析师 | 技术指标解读 | 400 字 | 300 字 |
| 基本面分析师 | 基本面评估 | 400 字 | 300 字 |
| 舆情分析师 | 市场情绪解读 | 300 字 | 200 字 |
| 风控官 | 风险评估 | 300 字 | 300 字 |

### 断点重开

非 `--force` 模式下自动跳过已完成的股票：

```
[runPoolFullPipeline] [1/26] 000XXX 完成
[runPoolFullPipeline] [2/26] 000XXX 已有 final_report, 跳过
...
[runPoolFullPipeline] 股池 1 完成 (完成 20 / 跳过 6 / 共 26)
```

## 文档

| 文档 | 说明 |
|------|------|
| [项目综述](docs/overview.md) | 架构总览、数据流、技术栈 |
| [CLI 使用指南](docs/cli-guide.md) | 完整操作手册 |
| [API 设计](docs/api-design.md) | 工具入参/返回值/错误码 |
| [数据库 Schema](docs/database-schema.md) | 13 张表定义 |
| [流水线实现](docs/pipeline-implementation.md) | Prompt 框架、字数控制 |
| [配置与部署](docs/deployment.md) | .env、Docker、Ubuntu 部署 |
| [测试策略](docs/test-strategy.md) | 测试范围与命令 |

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript (Node.js 22) |
| 数据库 | SQLite + Drizzle ORM |
| CLI | Commander.js |
| LLM | LM Studio（本地推理，OpenAI 兼容） |
| 插件 | OpenClaw Plugin SDK |
| 测试 | Vitest |
| CI/CD | GitHub Actions |

## 开发

```bash
npm run build                      # 构建全部包
npm run test --workspace=packages/server  # 运行测试
npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts  # E2E 测试
npm run db:generate --workspace=packages/server  # 生成迁移
```

## 项目结构

```
fi-pool-manager/
├── packages/
│   ├── server/     # 核心服务：数据获取、分析引擎、LLM、向量检索
│   ├── cli/        # CLI 命令行入口（Commander.js）
│   └── plugin/     # OpenClaw 插件（36 MCP 工具）
├── docs/           # 设计文档
├── packages/server/drizzle/  # 数据库迁移
└── .github/        # CI/CD 工作流
```

## npm 包

- [`fi-pool-cli`](https://www.npmjs.com/package/fi-pool-cli) — 命令行工具
- [`fi-pool-server`](https://www.npmjs.com/package/fi-pool-server) — 核心库

## 许可

[Apache-2.0](LICENSE)
