# @fi-pool/cli

Fi-Pool-Manager CLI 命令行入口。

基于 Commander.js 实现，提供完整的股池管理、查询分析、报告输出、诊断检查等命令。

## 用法

```bash
# 查看帮助
npx fi-pool --help

# 查看系统状态
npx fi-pool status

# 列出股池
npx fi-pool list-pools

# 每日综述（v2，推荐）
npx fi-pool daily-summary-v2

# 带诊断信息的每日综述
npx fi-pool daily-summary-v2 --verbose
```

## 命令分类

| 类别 | 命令 | 说明 |
|------|------|------|
| **股池管理** | `pool create/delete/update` | 股池 CRUD |
| | `pool add-stocks / remove-stocks` | 股池股票管理 |
| | `pool set-signal` | 设置看多/看空信号 |
| **数据查询** | `list-pools` | 列出所有股池及股票数 |
| | `get-stock` | 查询股票基本信息 |
| | `get-daily` | 查询日行情数据 |
| | `get-analysis` | 查询客观分析报告 |
| | `get-final` | 查询最终综合报告 |
| | `status` | 查看系统运行状态 |
| **报告输出** | `output-analysis` | 输出客观分析报告 |
| | `output-final` | 输出最终报告 |
| | `output-pool` | 输出股池综合报告 |
| **语义搜索** | `search` | 语义搜索历史分析报告 |
| **流水线执行** | `run-analysis` | 运行本地分析（Stage 1→2） |
| | `run-pipeline` | 运行完整流水线（Stage 1→5） |
| | `run-pool-pipeline` | 池级别全流水线（支持多池串行 + 断点重开） |
| | `refresh` | 刷新最新行情数据 |
| **流水线控制** | `stop-pipeline` | 停止指定运行中的流水线 |
| | `list-pipelines` | 列出所有运行中的流水线 |
| **每日综述** | `daily-summary-v2` | **推荐** 异常值驱动 + 多维分析 + RAG |
| | `daily-summary` | 已废弃（v1 prompt 过长始终 400） |
| **诊断检查** | `check-data` | 检查某日期的数据完成度（各池覆盖率） |
| | `pool-status` | 查看指定股池各股票的分析进度 |
| | `summary-status` | 查看某日 daily-summary 的执行状态 |
| **辅助** | `help` | 查看帮助信息 |
| | `list` | 列出可用资源（pools/stocks/tools） |
| | `version` | 输出版本信息 |
| | `config get/set` | 配置管理 |
| **API 服务** | `serve` | 启动 REST API 服务器 |
| **Session** | `session` | 管理 LLM 对话 Session |

## 流水线执行

### 断点重开（Checkpoint/Resume）

v0.4.0 新增：`run-pool-pipeline` 支持断点重开。

非 `--force` 模式下，每只股票执行前自动检查该日期是否已有 `final_report`。
已有则跳过，无则执行。中断后重跑自动跳过已完成股票。

```bash
# 首次执行（全量）
fi-pool run-pool-pipeline 1 2

# 中断后再次执行（断点重开）
# 已完成的股票自动跳过
fi-pool run-pool-pipeline 1 2

# 强制重新执行（覆盖跳过）
fi-pool run-pool-pipeline 1 2 --force
```

### 多池串行执行

```bash
# 单池
fi-pool run-pool-pipeline 1

# 多池串行（池1→池2→池3）
fi-pool run-pool-pipeline 1 2 3

# 所有股池串行
fi-pool run-pool-pipeline --all
```

### 停止流水线

```bash
# 停止指定流水线
fi-pool stop-pipeline pipe-xxx-xxxxxx

# 查看运行中的流水线
fi-pool list-pipelines
```

### 进度显示

```
[runPoolFullPipeline] [1/26] 000XXX 股票名 完成
[runPoolFullPipeline] [2/26] 000XXX 已有 final_report (date=2026-07-07), 跳过
...
[runPoolFullPipeline] 股池 1 完成 (完成 20 / 跳过 6 / 共 26)
```

## 诊断命令

### 数据完成度检查

```bash
# 检查今日数据完成度
fi-pool check-data

# 检查指定日期的数据完成度
fi-pool check-data 2026-07-07
```

输出示例：
```
  📊 数据完成度检查 — 2026-07-07
  ────────────────────────────────────────
  总池股票: 49
  Final Report: 49
  异常分数分布: min=1.0, max=4.5, avg=1.8, >2.5阈值=3

  ✓ 池 #1 AI算力·电力基础设施: 26/26
  ✓ 池 #2 国防领域·卫星主题: 23/23
```

### 股池分析状态

```bash
# 查看池 1 的分析进度
fi-pool pool-status 1

# 指定日期
fi-pool pool-status 1 --date 2026-07-07
```

### 每日综述状态

```bash
fi-pool summary-status
fi-pool summary-status 2026-07-07
```

## 每日综述

### v2（推荐）

```bash
# 基础用法
fi-pool daily-summary-v2

# 指定日期
fi-pool daily-summary-v2 2026-07-07

# 带诊断信息（显示各池覆盖率、分数分布等）
fi-pool daily-summary-v2 --verbose
```

在运行 `run-pool-pipeline` 命令后，每日综述 v2 会自动触发输出。
