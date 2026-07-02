# 每日综述（daily-summary）改进方案

> Issue: [#85](https://github.com/kuaizhongqiang/Fi-Pool-Manager/issues/85)
> 目标：通过"方法论 + 多轮 + RAG"提升每日综述质量，解决 prompt 超限问题。

---

## 整体架构

### 职责划分

```text
流水线（每只股票，独立执行）
  ├── 获取行情 + 技术指标计算
  ├── 规则引擎：计算 anomaly_base（基础异常分）
  ├── 多角色分析辩论
  └── 产出：分析摘要 + anomaly_score（LLM 在基础分上 ±1 微调）→ 存入 final_report

daily-summary（每日一次）
  ├── 1. 筛选异常股票
  │    读当日 final_report，取 anomaly_score >= 2.5 的股票
  │    若超过 15 只则取 top-15，若一只都没有则取 top-3
  │
  ├── 2. 逐只多维分析（串行，LM Studio 显存限制）
  │    每只股票 1 次 LLM 调用，一次性从四个维度分析：
  │      价格、舆情、交易量、板块
  │    输出结构化 JSON，存入 daily_summary_detail
  │
  ├── 3. 筛选 prompt 内容
  │    按 anomaly_score 降序，每只股票最多取 2 个维度
  │    根据上下文预算动态决定 N
  │
  └── 4. LLM 综合生成最终报告
       可选：检索历史 daily_summary 作参考
       输出存入 daily_summary 表，并向量化入库
```

### 关键要点

- **异常判定混合策略**：规则引擎算基础分 + LLM 在 ±1 范围内微调，保证跨股票可比性
- **流水线不引入 RAG**：历史数据通过 SQL 查询获取，已有足够信息
- **串行执行**：一只股票四个维度一次调用跑完再下一只
- **同日期不依赖语义检索**：维度分析结果按 anomaly_score 排序筛选，RAG 仅用于跨日期历史对比
- **临时结果持久化**：`daily_summary_detail` 表存储，累计有价值

---

## 设计细节

### 1. 异常偏移值（流水线侧）

#### 规则引擎计算基础分

```text
anomaly_base = 1.0
  + price_anomaly  (0~1.0)
  + volume_anomaly (0~1.0)
  + signal_anomaly (0~1.0)
  ─────────────────────────
  max: 4.0, min: 1.0
```

| 维度 | 计算方式 |
| --- | --------- |
| price_anomaly | `abs(价格涨跌幅) > 3% ? min(abs(涨跌幅)/10, 1.0) : 0` |
| volume_anomaly | `量比 > 2.0 ? min((量比-1)/3, 1.0) : 0` |
| signal_anomaly | `金叉或死叉 ? 0.5 : 0` + `超买或超卖 ? 0.5 : 0` |

#### LLM 微调

在流水线综合报告 prompt 末尾增加：

```text
请额外输出一个 anomaly_score 字段（float, 1.0–5.0），
基于以上分析判断该股票今日是否显著偏离常态。
当前技术指标推算的基础分为 {anomaly_base}，你可在此基础上 ±1.0 调整。
```

**好处**：跨股票分数可比、省 token、LLM 只需要做小范围调整。

### 2. 异常股票筛选（daily-summary 侧）

```typescript
const ANOMALY_THRESHOLD = 2.5;   // 基础分 1.0 + 至少一个维度有明显异常
const MAX_ANOMALY_STOCKS = 15;   // 每期最多分析 15 只
const MIN_ANOMALY_STOCKS = 3;    // 兜底至少 3 只

// 1. 按 anomaly_score DESC 排序
// 2. 取 score >= 2.5 的股票
// 3. 如果超过 15 只，只取 top-15
// 4. 如果一只都没有，取 top-3 保证有输出
```

不再使用中位数（必然筛出 50%，不合理）。

### 3. 逐只多维分析（串行）

**每只异常股票只调 1 次 LLM**，一次性从四个维度分析：

```text
[系统] 你是一位A股多维分析师。请从以下四个维度分析 {股票代码} 今日的异常表现，
每个维度给出：异常原因（若有）、异常程度（1-5）、关键发现。

输入数据：
- 行情：{最近5日 OHLCV}
- 技术指标：{indicators JSON}
- 舆情：{sentiment report}
- 所属板块：{sector info}

输出格式（JSON）：
{
  "stock_code": "...",
  "dimensions": [
    { "dimension": "price", "anomaly_desc": "...", "anomaly_score": 2.0, "key_findings": "..." },
    { "dimension": "sentiment", "anomaly_desc": "...", "anomaly_score": 1.5, "key_findings": "..." },
    { "dimension": "volume", "anomaly_desc": "...", "anomaly_score": 3.0, "key_findings": "..." },
    { "dimension": "sector", "anomaly_desc": "...", "anomaly_score": 1.0, "key_findings": "..." }
  ]
}
```

- 调用次数：15 次（不是 15 × 4 = 60 次）
- 单次 prompt：~1000 tokens 输入 + ~500 tokens 输出
- 结果存入 `daily_summary_detail` 表，并向量化入库（`content_type = 'daily_detail'`）

### 4. 筛选 prompt 内容

最终汇总轮之前，需要从 `daily_summary_detail` 中挑选进入 prompt 的内容。

**不依赖语义检索**（同日期同类型记录向量相似度过高，≈ 随机选取），改用 score 排序：

```typescript
function selectPromptEntries(
  details: DailySummaryDetail[],
  maxTokens: number,
  tokensPerEntry: number = 200
): DailySummaryDetail[] {
  const N = Math.floor((maxTokens - 300 - 1500) / tokensPerEntry); // 扣去系统 prompt 和输出预留

  // 1. 按 anomaly_score 降序
  const sorted = [...details].sort((a, b) => b.anomaly_score - a.anomaly_score);

  // 2. 取 top-N，每只股票最多 2 个维度
  const result: DailySummaryDetail[] = [];
  const stockCount = new Map<string, number>();

  for (const entry of sorted) {
    const count = stockCount.get(entry.stock_code) ?? 0;
    if (count >= 2) continue;
    result.push(entry);
    stockCount.set(entry.stock_code, count + 1);
    if (result.length >= N) break;
  }

  return result;
}
```

#### 历史对比（可选）

如果上下文窗口有余量，额外检索历史 `daily_summary` 作为参考：

```text
第二次检索（prompt 有余量时做）
  → query：本次分析摘要
  → content_type = 'daily_summary'
  → content_date < 今天
  → limit = 2~3
```

### 5. 最终报告

- **内容**：聚焦异常股票及其异常原因，附带市场整体统计作为背景（各股池多空比）
- **字数**：800–1200 字

### 6. 数据库变更

| 变更 | 说明 |
| --- | --- |
| `final_report` 新增字段 | `anomaly_score REAL DEFAULT 1.0` |
| 新建 `daily_summary_detail` 表 | 存每只异常股 × 四个维度的逐项分析结果 |
| 新建 `daily_summary` 表 | 存每期生成的最终综述 |
| `vec_embedding.content_type` 扩展 | 新增 `daily_detail` 和 `daily_summary` 两种类型 |
| Drizzle 迁移脚本 | 以上变更均通过迁移执行 |

### 7. 兼容性与过渡期

#### 迁移安全

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| `final_report` 新增 `anomaly_score` | 旧数据该字段为空 | `DEFAULT 1.0`，自动填充，不触发全表重写 |
| 新建 `daily_summary_detail` 表 | 旧数据库无此表 | 迁移脚本直接 `CREATE TABLE`，不影响现有数据 |
| 新建 `daily_summary` 表 | 旧数据库无此表 | 同上 |
| `vec_embedding.content_type` 扩展 | 新增枚举值，旧数据 `content_type` 不变 | 不影响现有向量检索，新数据写入新类型 |

#### 过渡期失效场景

##### 场景一：刚部署完，所有 final_report 的 anomaly_score = 1.0（默认值）

```text
此时 daily-summary 读到的数据：
  anomaly_score >= 2.5 ? → 0 只
  ↓
  触发兜底：取 top-3
  ↓
  正常生成报告（但 anomaly_score 还没意义，维度分析仍可基于基本面数据）
```

不会报错或崩溃，只是报告的质量暂时不如"有异常分"时。

##### 场景二：用户先跑 daily-summary，后跑流水线

```text
daily-summary 读取 final_report
  → 发现没有任何数据 → 返回"暂无股池数据"
  → 这是现有行为，兼容
```

##### 场景三：数据库文件通过环境变量指向已有文件，迁移覆盖

```text
Drizzle 迁移：
  ALTER TABLE final_report ADD COLUMN anomaly_score REAL NOT NULL DEFAULT 1.0
  CREATE TABLE IF NOT EXISTS daily_summary_detail (...)
  CREATE TABLE IF NOT EXISTS daily_summary (...)

迁移幂等，不删除、不覆盖已有数据行。
```

### 8. 异步化

- 流水线不阻塞等待 daily-summary
- daily-summary 改为**独立命令**，用户需要时再运行
- 或流水线异步触发，后台跑不阻塞返回

### 8. 实现优先级

```text
第 1 步（立即） ──→ token 预算动态截断，修复 #85 的 400 错误
                      │
第 2 步（本周） ──→ 规则引擎 anomaly_base + 流水线 prompt 改动 + 迁移
                      │
第 3 步（下周） ──→ daily-summary-v2：筛选 + 多维分析 + 报告生成
                      │
第 4 步（后续） ──→ 跨日期 RAG 历史对比
```

---

## 参考

- 当前实现：[packages/server/src/services/daily-summary.ts](../packages/server/src/services/daily-summary.ts)
- final_report schema：[packages/server/src/db/schema.ts](../packages/server/src/db/schema.ts)
- 流水线实现：[packages/server/src/services/pipeline.ts](../packages/server/src/services/pipeline.ts)
- Embedding/RAG 服务：[packages/server/src/services/embedding.ts](../packages/server/src/services/embedding.ts)
- 审查报告：`docs/daily-summary-review-report.md`
