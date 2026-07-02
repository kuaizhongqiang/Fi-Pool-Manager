# @fi-pool/cli

Fi-Pool-Manager CLI 命令行入口。

基于 Commander.js 实现，提供完整的股池管理、查询分析、报告输出等命令。

## 用法

```bash
# 查看帮助
npx fi-pool --help

# 列出股池
npx fi-pool list-pools

# 查看某股票分析报告
npx fi-pool report --code 600519 --mode overview
```

## 命令分类

- **管理类**：create-pool, delete-pool, add-stocks, remove-stocks, set-signal
- **查询类**：list-pools, get-stock, get-daily, get-report, status
- **命令类**：output-report, output-final, semantic-search, session
- **执行类**：run-analysis, run-pipeline, run-pool-pipeline (支持多池), refresh-data
- **流水线控制类**：stop-pipeline, list-pipelines
- **辅助类**：help, list, version, config, daily-summary (已废弃，建议用 daily-summary-v2)

## 流水线控制

### 多池串行执行

```bash
# 单池执行
fi-pool run-pool-pipeline 1

# 多池串行（池1→池2→池3）
fi-pool run-pool-pipeline 1 2 3

# 所有股池串行
fi-pool run-pool-pipeline --all

# 带 --force 强制重新执行
fi-pool run-pool-pipeline --all --force
```

### 停止流水线

```bash
# 停止指定流水线
fi-pool stop-pipeline pipe-xxx-xxxxxx

# 查看运行中的流水线
fi-pool list-pipelines
```

### 每日综述

```bash
# v2（推荐）
fi-pool daily-summary-v2 [date]

# v1（已废弃，因 prompt 过长始终 400）
fi-pool daily-summary [date]
```

在运行 `run-pool-pipeline` 命令后，每日综述 v2 会自动触发输出。
