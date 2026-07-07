# @fi-pool/server

Fi-Pool-Manager 核心服务层。

## 职责

- **数据获取**：通过腾讯财经接口获取 A 股日行情数据
- **本地分析**：计算技术指标（MA、MACD、RSI、KDJ、布林带）
- **LLM 分析**：调用本地 LM Studio 进行多角色分析和报告生成
- **向量检索**：通过 sqlite-vec 进行语义搜索
- **舆情搜索**：获取股票相关市场信息
- **数据访问**：通过 Drizzle ORM 操作 SQLite 数据库
- **检查点恢复**：流水线中断后自动跳过已完成的股票

## 目录结构

```
src/
├── tools/          # 对外暴露的工具函数（5 个模块）
│   ├── query.ts    #   数据查询 + 诊断检查（v0.4.0 新增）
│   ├── manager.ts  #   股池管理
│   ├── command.ts  #   报告输出
│   ├── execute.ts  #   流水线执行（v0.4.0 断点重开）
│   └── auxiliary.ts # 辅助功能
├── services/       # 核心服务
│   ├── pool.ts     #   股池 CRUD
│   ├── stock.ts    #   股票信息
│   ├── daily-info.ts # 日行情数据
│   ├── analysis.ts #   技术指标计算
│   ├── pipeline.ts #   流水线编排器（5 Stage）
│   ├── llm.ts      #   LLM 调用封装
│   ├── session.ts  #   会话管理
│   ├── embedding.ts #  向量检索
│   ├── sentiment.ts #  舆情搜索
│   ├── sector.ts   #   板块数据
│   ├── daily-summary.ts   # 每日综述 v1
│   ├── daily-summary-v2.ts # 每日综述 v2（含 --verbose 诊断）
│   └── word-count.ts # 字数统计
├── db/             # 数据库
│   ├── index.ts    #   连接管理
│   ├── schema.ts   #   12 张 Drizzle 表定义
│   └── migrate.ts  #   自动迁移
└── index.ts        # 入口
```

## 新增功能（v0.4.0）

### 断点重开（Checkpoint/Resume）

`execute.ts` 中的 `runPoolFullPipeline()` 函数：
- 非 `--force` 模式下，每只股票执行前检查 `final_report` 是否存在
- 已有则跳过，无则执行
- 返回数据包含 `total` 和 `skipped` 两个计数

### 诊断查询（Diagnostic Queries）

`query.ts` 新增三个函数：

| 函数 | 说明 |
|------|------|
| `checkDataCompleteness(date)` | 各池 final_report 覆盖情况 + anomalyScore 分布 |
| `getPoolAnalysisStatus(poolId, date?)` | 池内各股票的分析进度明细 |
| `getDailySummaryStatus(date?)` | daily_summary 执行状态 |

### 每日综述诊断模式

`daily-summary-v2.ts` 中的 `generateDailySummaryV2(date, verbose)`：
- `verbose=true` 时输出各池覆盖率、分数分布等诊断信息
- 帮助 agent 在执行前了解数据就绪状态
