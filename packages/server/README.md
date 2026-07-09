# @fi-pool/server

Core service layer of Fi-Pool-Manager.

## Responsibilities

- **Data Fetching**: A-share daily OHLCV data from Tencent Finance API
- **Technical Analysis**: MA, MACD, RSI, KDJ, Bollinger Bands + signal detection
- **LLM Analysis**: Multi-role debate pipeline via local LM Studio
- **Vector Search**: Semantic search via sqlite-vec
- **Sentiment Search**: Web search integration via DashScope API
- **Data Access**: SQLite via Drizzle ORM
- **Checkpoint/Resume**: Auto-skip completed stocks on pipeline restart

## Directory Structure

```
src/
├── tools/           # Public tool modules (5)
│   ├── query.ts     #   Data query + diagnostics
│   ├── manager.ts   #   Pool management
│   ├── command.ts   #   Report output
│   ├── execute.ts   #   Pipeline execution (checkpoint/resume)
│   └── auxiliary.ts #   Help, config, version
├── services/        # Core services
│   ├── pool.ts      #   Pool CRUD
│   ├── stock.ts     #   Stock info
│   ├── daily-info.ts #   Daily market data
│   ├── analysis.ts  #   Technical indicators
│   ├── pipeline.ts  #   Pipeline orchestrator (5 stages)
│   ├── llm.ts       #   LLM call wrapper
│   ├── session.ts   #   Session management
│   ├── embedding.ts #   Vector retrieval
│   ├── sentiment.ts #   Sentiment search
│   ├── sector.ts    #   Sector data
│   ├── daily-summary.ts    # Daily summary v1 (deprecated)
│   ├── daily-summary-v2.ts # Daily summary v2 (recommended)
│   └── word-count.ts #   Token counter
├── db/              # Database
│   ├── index.ts     #   Connection management
│   ├── schema.ts    #   13 Drizzle table definitions
│   └── migrate.ts   #   Auto-migration
├── utils/           # Shared utilities
│   └── date.ts      #   Timezone-aware date helper
└── index.ts         # Entry point
```

## Key Features

### Checkpoint / Resume

`runPoolFullPipeline()` in `execute.ts`:
- Without `--force`, each stock is checked for an existing `final_report` before LLM calls
- Completed stocks are skipped automatically
- Returns `{ total, skipped, failed }` counters

### Diagnostics (since v0.4.0)

| Function | Description |
|----------|-------------|
| `checkDataCompleteness(date)` | Coverage of final_reports per pool |
| `getPoolAnalysisStatus(poolId, date?)` | Per-stock analysis progress |
| `getDailySummaryStatus(date?)` | Daily summary execution status |
| `listPipelineRuns(date?)` | Pipeline run history (#142) |

### Pipeline Run Tracking (since v0.4.9)

Each pool pipeline execution is recorded in the `pipeline_run` table with:
- Mode: `full` / `force` / `missing`
- Progress: completed / skipped / failed counts
- Duration & average stock duration
- Status: running / completed / crashed

---

Published on npm: [`fi-pool-server`](https://www.npmjs.com/package/fi-pool-server)
