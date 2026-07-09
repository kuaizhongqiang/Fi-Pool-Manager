# Fi-Pool-Manager

[![CI](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/kuaizhongqiang/Fi-Pool-Manager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![npm downloads](https://img.shields.io/npm/dm/fi-pool-cli)](https://www.npmjs.com/package/fi-pool-cli)
[![License](https://img.shields.io/github/license/kuaizhongqiang/Fi-Pool-Manager)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

> **A-Share (Chinese stock) pool manager with LLM-powered technical analysis.**  
> Manage custom stock pools, fetch daily OHLCV data, compute technical indicators, and generate multi-role LLM analysis reports.  
> **[中文文档](README.zh-CN.md)**

---

## Features

| Feature | Description |
|---------|-------------|
| 📦 Pool Management | Create/delete/update stock pools, add/remove stocks |
| 📊 Market Data | Daily OHLCV from Tencent Finance API |
| 📈 Technical Analysis | MA, MACD, RSI, KDJ, Bollinger Bands + signal detection |
| 🤖 LLM Analysis | Local LM Studio inference, multi-role debate pipeline |
| 🌐 Sentiment Search | DashScope web search integration (optional) |
| 🔍 Vector Search | Semantic search across historical reports |
| 📋 Daily Summary | Auto-generated investment review after pipeline completes |
| 🏭 Sector Data | EastMoney industry/concept sector data for multi-dim analysis |
| 🛑 Pipeline Control | Multi-pool serial execution, stop, checkpoint/resume |
| 🔄 Checkpoint/Resume | Auto-skip completed stocks on restart — no forced re-run |
| 📊 Diagnostics | `check-data`, `pool-status`, `summary-status`, `pipeline-log` |
| 🖥️ CLI | 30+ commands via Commander.js |
| 🔌 OpenClaw Plugin | 36 MCP tools for Claude, Cursor, etc. |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **LM Studio** (optional, for LLM analysis) — load a model (e.g. `qwen3.5-9b`)

### Install

**npm global (recommended)**

```bash
npm install -g fi-pool-cli
fi-pool help
```

**From source**

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
# Health: http://localhost:3000/health
# Status: http://localhost:3000/status
```

### Configure

```bash
cp .env.example .env
# Edit .env, at minimum:
#   LLM_BASE_URL — LM Studio endpoint (default http://127.0.0.1:1234)
#   DASHSCOPE_API_KEY — sentiment search (optional)
```

### Usage

```bash
# System status
fi-pool status

# Pool management
fi-pool pool create "My Watchlist"
fi-pool pool add-stocks 1 600519 000858

# View market data
fi-pool get-stock 600519
fi-pool get-daily 600519 2026-01-01 2026-06-29

# Run pipeline (single stock)
fi-pool run-pipeline 600519

# Run pipeline (pool, with checkpoint/resume)
fi-pool run-pool-pipeline 1 2 3
fi-pool run-pool-pipeline --all
fi-pool run-pool-pipeline --missing     # only pending stocks

# Stop / list pipelines
fi-pool stop-pipeline pipe-xxx-xxxxxx
fi-pool list-pipelines

# Daily summary
fi-pool daily-summary-v2
fi-pool daily-summary-v2 --verbose

# Diagnostics
fi-pool check-data
fi-pool pool-status 1
fi-pool pipeline-log

# Reports
fi-pool get-analysis 600519 2026-06-29
fi-pool get-final 600519 2026-06-29 --mode full
```

---

## Pipeline Architecture

```
Data Fetch → Objective Report (LLM) → Sentiment → Multi-Role Debate → Final Report
  Stage 1         Stage 2              Stage 3       Stage 4          Stage 5
```

Four analyst roles debate in order, with an optional second round:

| Role | Focus | Round 1 | Round 2 |
|------|-------|---------|---------|
| Technical Analyst | Chart patterns & indicators | 400 chars | 300 chars |
| Fundamental Analyst | Valuation & trends | 400 chars | 300 chars |
| Sentiment Analyst | Market mood & news | 300 chars | 200 chars |
| Risk Officer | Downside assessment | 300 chars | 300 chars |

### Checkpoint / Resume

Without `--force`, each stock is checked for an existing `final_report` before execution:

```
[runPoolFullPipeline] [1/26] 000XXX Done
[runPoolFullPipeline] [2/26] 000XXX Already has final_report, skipped
...
[runPoolFullPipeline] Pool 1 done (20 executed / 6 skipped / 26 total)
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | Architecture, data flow, tech stack |
| [CLI Guide](docs/cli-guide.md) | Complete operation manual |
| [API Design](docs/api-design.md) | Input/output signatures for all tools |
| [Database Schema](docs/database-schema.md) | 13 tables, fields, indexes |
| [Pipeline Implementation](docs/pipeline-implementation.md) | Stage details, prompt templates |
| [Deployment](docs/deployment.md) | .env config, Docker, Ubuntu setup |
| [Test Strategy](docs/test-strategy.md) | Testing scope and commands |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (Node.js 22) |
| Database | SQLite + Drizzle ORM |
| CLI | Commander.js |
| LLM | LM Studio (local, OpenAI-compatible) |
| Plugin | OpenClaw Plugin SDK |
| Testing | Vitest |
| CI/CD | GitHub Actions |

---

## Development

```bash
# Build all packages
npm run build

# Run tests (102+ tests)
npm run test --workspace=packages/server

# E2E tests (requires real API)
npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts

# Generate database migration
npm run db:generate --workspace=packages/server
```

### Project Structure

```
fi-pool-manager/
├── packages/
│   ├── server/     # Core: data fetching, analysis, LLM, vector search
│   ├── cli/        # CLI entry (Commander.js)
│   └── plugin/     # OpenClaw plugin (36 MCP tools)
├── docs/           # Design documents
├── packages/server/drizzle/  # DB migrations
└── .github/        # CI/CD workflows
```

---

## Packages on npm

- [`fi-pool-cli`](https://www.npmjs.com/package/fi-pool-cli) — CLI tool
- [`fi-pool-server`](https://www.npmjs.com/package/fi-pool-server) — Core library

---

## License

[Apache-2.0](LICENSE)
