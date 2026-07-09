# @fi-pool/cli

CLI entry point for Fi-Pool-Manager. Built with Commander.js, providing 30+ commands for pool management, data query, analysis reports, diagnostics, and pipeline execution.

## Install

```bash
npm install -g fi-pool-cli
fi-pool help
```

## Command Overview

| Category | Commands | Description |
|----------|----------|-------------|
| **Pool Mgmt** | `pool create / delete / update` | Pool CRUD |
| | `pool add-stocks / remove-stocks` | Stock management |
| | `pool set-signal` | Set bearish/neutral/bullish signal |
| **Data Query** | `list-pools` | List all pools with stock counts |
| | `get-stock` | Stock basic info |
| | `get-daily` | OHLCV market data |
| | `get-analysis` | Technical analysis report |
| | `get-final` | Final consolidated report |
| | `status` | System status |
| **Diagnostics** | `check-data` | Data completion check per pool |
| | `pool-status` | Per-stock analysis progress |
| | `summary-status` | Daily summary execution state |
| | `pipeline-log` | Pipeline run history (#142) |
| **Report** | `output-analysis` / `-final` / `-pool` | Structured output |
| | `search` | Semantic search |
| **Pipeline** | `run-analysis` | Stage 1→2 (local only) |
| | `run-pipeline` | Full pipeline (Stage 1→5) |
| | `run-pool-pipeline` | Pool-level full pipeline |
| | `run-pool-pipeline --all` | All pools serial |
| | `run-pool-pipeline --missing` | Pending stocks only |
| | `run-pool-pipeline --force` | Force re-run all |
| **Control** | `stop-pipeline` | Stop a running pipeline |
| | `list-pipelines` | List running pipelines |
| **Daily Summary** | `daily-summary-v2` | **Recommended** anomaly-driven + multi-dim + RAG |
| | `daily-summary` | Deprecated (v1) |
| **Other** | `help`, `list`, `version` | Auxiliary |
| | `config get / set` | Config management |
| | `serve` | Start REST API server |
| | `session` | LLM session management |

## Pipeline Execution

### Checkpoint / Resume

Without `--force`, stocks with an existing `final_report` are auto-skipped:

```bash
# First run (full)
fi-pool run-pool-pipeline 1 2

# After interruption — completed stocks are skipped automatically
fi-pool run-pool-pipeline 1 2

# Force re-run
fi-pool run-pool-pipeline 1 2 --force
```

### Multi-pool & Missing Mode

```bash
# Single pool
fi-pool run-pool-pipeline 1

# Serial execution (pool 1 → 2 → 3)
fi-pool run-pool-pipeline 1 2 3

# All pools
fi-pool run-pool-pipeline --all

# Only pending stocks (--missing)
fi-pool run-pool-pipeline --missing
```

### Progress & ETA

```
[runPoolFullPipeline] [1/26] 000XXX Done ✓
  ⏱ Avg 45s/stock, ~9m remaining (~15:23 ETA)
[runPoolFullPipeline] [2/26] 000XXX Has final_report, skipped
...
[runPoolFullPipeline] Pool 1 done (20 executed / 6 skipped / 26 total)
```

## Diagnostics

```bash
# Data completeness check
fi-pool check-data
fi-pool check-data 2026-07-07

# Pool analysis status
fi-pool pool-status 1
fi-pool pool-status 1 --date 2026-07-07

# Summary status
fi-pool summary-status

# Pipeline history
fi-pool pipeline-log
fi-pool pipeline-log 2026-07-07
fi-pool pipeline-log --id pool-run-xxxx
```

## Daily Summary v2 (Recommended)

```bash
fi-pool daily-summary-v2
fi-pool daily-summary-v2 2026-07-07
fi-pool daily-summary-v2 --verbose
```

Auto-triggered after `run-pool-pipeline` completes (even on crash, see [#148](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/148)).

---

Published on npm: [`fi-pool-cli`](https://www.npmjs.com/package/fi-pool-cli)
