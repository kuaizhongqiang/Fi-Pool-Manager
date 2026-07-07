# Fi-Pool-Manager

[![CI](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![npm downloads](https://img.shields.io/npm/dm/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![License](https://img.shields.io/github/license/kuaizhongqiang/Fi-Pool-Manager)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

A 股股池管理服务端。管理自定义股票池、获取日行情数据、进行技术分析，并通过多角色 LLM 分析产出投资建议报告。

## 功能一览

| 功能 | 说明 | 状态 |
|------|------|------|
| 📦 股池管理 | 创建/删除/更新股池，增删股票 | ✅ |
| 📊 行情数据 | 腾讯财经接口获取日线 OHLCV 数据 | ✅ |
| 📈 技术分析 | MA/MACD/RSI/KDJ/布林带 + 信号检测 | ✅ |
| 🤖 LLM 分析 | LM Studio 本地推理，多角色辩论 | ✅ |
| 🌐 舆情搜索 | DashScope 联网搜索（可选） | ✅ |
| 🔍 向量检索 | 语义搜索历史分析报告 | ✅ |
| 📋 每日综述 | 流水线完成后自动触发 LLM 生成每日投资回顾 | ✅ |
| 🏭 板块数据 | 东方财富行业/概念板块数据源（多维分析注入） | ✅ |
| 🛑 流水线控制 | 多池串行编排 + 停止命令 + **断点重开** | ✅ |
| 🔄 断点重开 | 中断后自动跳过已完成股票（v0.4.0） | ✅ |
| 📊 诊断命令 | check-data / pool-status / summary-status（v0.4.0） | ✅ |
| 🖥️ CLI | 28+ 子命令，Commander.js | ✅ |
| 🔌 OpenClaw 插件 | 29 个 MCP 工具 | ✅ |

## 快速开始

### 前置要求

- **Node.js** ≥ 20
- **LM Studio**（可选，用于 LLM 分析功能）
- 运行 `lm-studio` 并加载模型（推荐 `qwen3.5-9b`）

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
npm run build --workspaces
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
npx fi-pool help

# 查看系统状态
npx fi-pool status

# 创建股池
npx fi-pool pool create "我的自选" "消费龙头"
npx fi-pool pool add-stocks 1 600519 000858 000568

# 查看行情
npx fi-pool get-stock 600519
npx fi-pool get-daily 600519 2026-01-01 2026-06-29

# 运行分析流水线（单股）
npx fi-pool run-pipeline 600519

# 多池串行执行（支持断点重开）
npx fi-pool run-pool-pipeline 1 2 3 --force
npx fi-pool run-pool-pipeline --all

# 停止流水线
npx fi-pool stop-pipeline pipe-xxx-xxxxxx
npx fi-pool list-pipelines

# 每日综述（v2，耗时分析）
npx fi-pool daily-summary-v2
npx fi-pool daily-summary-v2 --verbose

# 诊断命令（v0.4.0）
npx fi-pool check-data
npx fi-pool pool-status 1
npx fi-pool summary-status

# 查看报告
npx fi-pool get-analysis 600519 2026-06-29
npx fi-pool get-final 600519 2026-06-29 --mode full
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

### 断点重开（v0.4.0）

`run-pool-pipeline` 支持断点重开。非 `--force` 模式下，每只股票执行前自动检查 `final_report` 是否存在：

```
[runPoolFullPipeline] [1/26] 000XXX 股票名 完成
[runPoolFullPipeline] [2/26] 000XXX 已有 final_report, 跳过
...
[runPoolFullPipeline] 股池 1 完成 (完成 20 / 跳过 6 / 共 26)
```

## 文档

| 文档 | 说明 |
|------|------|
| [项目综述](docs/overview.md) | 架构总览、数据流、技术栈 |
| [CLI 使用指南](docs/cli-guide.md) | 面向 agent 的完整操作手册（v0.4.0 新增） |
| [API 设计](docs/api-design.md) | 29 个工具的入参、返回值、错误码 |
| [数据库 Schema](docs/database-schema.md) | 12 张表的精确字段与索引 |
| [流水线实现](docs/pipeline-implementation.md) | 各阶段 Prompt 框架、字数控制 |
| [配置与部署](docs/deployment.md) | .env 配置项、Docker、Ubuntu 部署 |
| [测试策略](docs/test-strategy.md) | 测试框架、范围和命令 |
| [开发计划](docs/project-plan.md) | 8 个迭代阶段及交付物 |

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
# 构建全部包
npm run build --workspaces

# 运行测试（102 个测试）
npm run test --workspace=packages/server

# 运行 E2E 测试（需要真实 API）
npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts

# 生成数据库迁移
npm run db:generate --workspace=packages/server
```

## 项目结构

```
fi-pool-manager/
├── packages/
│   ├── server/     # 核心服务：数据获取、分析引擎、LLM、向量检索
│   ├── cli/        # CLI 命令行入口（Commander.js）
│   └── plugin/     # OpenClaw 插件（29 MCP 工具）
├── docs/           # 设计文档
├── skills/         # Agent Skill（项目管理自动化）
├── scripts/        # 部署脚本
└── .github/        # CI/CD 工作流
```

## 版本

遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。当前版本 `0.4.0`。

已发布到 npm：[`fi-pool-cli`](https://www.npmjs.com/package/fi-pool-cli) · [`fi-pool-server`](https://www.npmjs.com/package/fi-pool-server)

## 许可

[Apache-2.0](LICENSE)
