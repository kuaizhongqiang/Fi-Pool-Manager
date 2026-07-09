# API 详细设计

> 阶段：详细设计 — 定义每个工具的入参、返回值与行为。

## 通用约定

### 输出模式

所有返回报告的工具支持 `mode` 参数：

| 模式 | 值 | 说明 |
|------|----|------|
| 概述 | `overview` | 默认。精简摘要，仅含结论和核心指标 |
| 全量 | `full` | 完整报告，包含所有分析过程和细节 |

### 返回值结构

```typescript
// 成功
{ success: true, data: T }

// 失败
{ success: false, error: { code: string, message: string } }
```

### 错误码

| 码 | 含义 |
|----|-------|
| `NOT_FOUND` | 资源不存在 |
| `INVALID_PARAM` | 参数错误 |
| `RATE_LIMIT` | 外部接口频率限制 |
| `LLM_ERROR` | LLM 调用失败 |
| `DB_ERROR` | 数据库错误 |
| `INTERNAL` | 内部错误 |

---

## 管理类（Manager）

> 返回值特征：`{ success: boolean }`

### createPool

创建新的股票池。

```
入参：
  name: string          // 池子名称
  desc?: string         // 可选描述
  stockCodes?: string[] // 可选的初始股票列表

返回：{ success: true, data: { id: number } }
```

### deletePool

删除指定股池（不删除池中的股票数据）。

```
入参：
  id: number

返回：{ success: true }
```

### updatePool

修改股池名称或描述。

```
入参：
  id: number
  name?: string
  desc?: string

返回：{ success: true }
```

### addStocks

向指定股池添加股票。

```
入参：
  poolId: number
  stockCodes: string[]     // 股票代码数组

返回：{ success: true, data: { added: number, skipped: number } }
```

### removeStocks

从指定股池移除股票。

```
入参：
  poolId: number
  stockCodes: string[]

返回：{ success: true, data: { removed: number } }
```

### setPoolSignal

手动设置股池综合信号值。

```
入参：
  poolId: number
  signal: number           // -1 看空 / 0 中性 / 1 看多

返回：{ success: true }
```

---

## 查询类（Query）

> 返回值特征：直接返回数据结构，不包装在 data 中。

### listPools

列出所有股池。

```
入参：（无）

返回：Pool[]
```

### getPoolStocks

查指定股池中的股票列表。

```
入参：
  poolId: number

返回：Stock[]
```

### getStockInfo

查股票基本信息。

```
入参：
  code: string

返回：Stock | null
```

### getDailyInfo

查日行情数据。

```
入参：
  code: string
  startDate?: string    // "yyyy-MM-dd"
  endDate?: string      // 默认为最新交易日

返回：DailyInfo[]
```

### getAnalysisReport

查指定股票指定日期的客观分析报告。

```
入参：
  code: string
  date: string          // "yyyy-MM-dd"
  mode?: 'overview' | 'full'

返回：DailyAnalysisReport | null
```

### getFinalReport

查指定股票指定日期的最终报告。

```
入参：
  code: string
  date: string
  mode?: 'overview' | 'full'

返回：FinalReport | null
```

### getSystemStatus

查看系统运行状态。

```
入参：（无）

返回：{
  version: string
  dbSize: string        // 数据库文件大小
  stocksTracked: number
  poolsCount: number
  lastDataUpdate: string
  llmConnected: boolean
  uptime: number        // 秒
}
```

---

## 命令类（Command）

> 返回值特征：复合结构，包含完整或摘要的内容。

### outputAnalysisReport

输出客观分析报告。

```
入参：
  code: string
  date: string
  mode?: 'overview' | 'full'

返回：{
  code: string
  date: string
  summary?: string          // overview 模式
  fullReport?: string       // full 模式
  indicators?: { ... }      // 结构化指标
}
```

### outputFinalReport

输出最终综合报告。

```
入参：
  code: string
  date: string
  mode?: 'overview' | 'full'

返回：{
  code: string
  date: string
  summary?: string
  fullReport?: string
  roles: { role: string, keyPoint: string }[]   // 各角色核心观点
}
```

### outputPoolReport

输出整个股池的综合报告。

```
入参：
  poolId: number
  mode?: 'overview' | 'full'

返回：{
  poolId: number
  poolName: string
  summary?: string
  fullReport?: string
  stocks: { code: string, signal: number, summary: string }[]
}
```

### semanticSearch

基于向量检索，语义搜索历史分析报告。

```
入参：
  query: string           // 搜索查询
  limit?: number          // 返回条数，默认 10
  type?: 'analysis' | 'final' | 'all'

返回：{
  results: {
    type: 'analysis' | 'final'
    code: string
    date: string
    relevance: number     // 0-1 相关性得分
    snippet: string       // 匹配片段
  }[]
}
```

### sessionManage

管理 LLM 对话 Session。

```
入参：
  action: 'new' | 'switch' | 'list' | 'current'
  sessionId?: string      // switch 时指定

返回：
  new:    { sessionId: string }
  switch: { sessionId: string, previousId?: string }
  list:   { sessions: { id: string, createdAt: string }[] }
  current: { sessionId: string }
```

---

## 执行类（Execute）

> 返回值特征：异步执行，返回启动确认。执行进度可通过 `getSystemStatus` 查看。

### runLocalAnalysis

对单只股票运行本地分析（数据获取 → 技术指标计算）。

```
入参：
  code: string

返回：{ success: true, data: { date: string } }
```

### runFullPipeline

对单只股票运行完整流水线（数据 → 分析 → 舆情 → 多角色 → 最终报告）。

```
入参：
  code: string

返回：{ success: true, data: { date: string } }
```

### runPoolAnalysis

对指定股池中所有股票运行本地分析。

```
入参：
  poolId: number

返回：{ success: true, data: { total: number } }
```

### runPoolFullPipeline

对指定股池中所有股票运行完整流水线。

```
入参：
  poolIds?: number | number[]  // 股池 ID（--missing 模式可不传）
  force?: boolean               // true 则强制重跑（跳过缓存检查）
  missing?: boolean             // true 则补跑模式：仅执行当日未完成的

返回：{ success: true, data: { total: number, skipped: number, failed: number } }
```

支持断点重开（Checkpoint/Resume）双层策略：
- 第 1 层（预检）：用 getTodayDate() 快速检查 final_report 是否存在
- 第 2 层（精检）：Pipeline.runFull() 内 Stage 1 获取真实交易日后再次检查
- 两层确保非 force 模式下已完成的股票不会触发 LLM 调用

自动记录运行历史到 pipeline_run 表（#142），可通过 pipeline-log 命令查看。
自动触发每日综述 v2（#76），在 finally 块中确保无论成功/崩溃都执行。

### refreshData

触发获取最新日行情数据。

```
入参：
  code?: string       // 不指定则更新所有关注股票

返回：{ success: true, data: { updated: number } }
```

---

## 辅助类（Auxiliary）

> 返回值特征：元信息，不涉及业务数据。

### help

输出命令或工具帮助信息。

```
入参：
  command?: string    // 不指定则输出所有可用命令

返回：string
```

### listResources

列出可用资源。

```
入参：
  type: 'pools' | 'stocks' | 'tools'

返回：{ items: { id: string, name: string }[] }
```

### showState

查看系统简要运行状态。

```
入参：（无）

返回：{ status: 'running' | 'error', version: string, uptime: number }
```

### showVersion

输出版本信息。

```
入参：（无）

返回：string
```

### getConfig

查看指定配置项或所有配置。

```
入参：
  key?: string

返回：{ key: string, value: string } | { config: Record<string, string> }
```

### setConfig

修改配置项（运行时生效，同时写入 .env）。

```
入参：
  key: string
  value: string

返回：{ success: true }
```

### generateDailySummary

生成每日综合股池综述。

```
入参：
  date?: string — 目标日期 yyyy-MM-dd（默认今天）

返回：
  {
    date: string,
    pools: [{
      poolId, poolName,
      stocks: [{ code, name, currentPrice, signal, summary, finalSummary }],
      bullish, bearish, neutral
    }],
    overall: { totalStocks, totalBullish, totalBearish, totalNeutral },
    llmSummary: string  // LLM 生成的综述文本
  }
```

> **自动触发**：在 `runPoolFullPipeline` 执行完成后自动调用。
