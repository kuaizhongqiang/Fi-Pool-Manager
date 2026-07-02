# 每日综述改进方案 — 独立审查报告

> 审查对象：`docs/daily-summary-improvement-plan.md`  
> 审查日期：2026-06-30  
> 约束条件：数据源仅限免费渠道 → 本地 LLM（LM Studio）上下文窗口受限

---

## 一、总体评价

计划文档的核心架构思路**方向正确**：

- 流水线产出异常值 → daily-summary 只用异常股 → RAG 精选 prompt → LLM 综合生成。这条链的每一步都合理。
- 串行执行、临时结果持久化、异步化等设计都考虑了 LM Studio 的实际约束。

但**执行层面的缺口较多**，以下按模块逐一审查，并给出约束条件下的具体建议。

---

## 二、流水线侧：anomaly_score 产出

### 2.1 现有计划的问题

| 问题 | 说明 |
|------|------|
| LLM 打分无锚点 | 只说了 1–5 标尺，不同股票之间的评分不可比 |
| 未定义异常标准 | LLM 不知道什么算"异常"，输出随机性大 |
| Prompt 变更未描述 | 当前 `buildFinalReportPrompt()` 完全不涉及异常打分 |
| 评分一致性不可控 | 同一天 30 只股，LLM 可能给完全不一致的分数 |

### 2.2 建议：规则计算 + LLM 微调（混合策略）

**不要完全依赖 LLM 打分，用指标数据先算出一个基础分数，LLM 只做 ±1 的微调。** 这样既节省 token，又保证跨股票可比性。

#### 基础分计算公式（基于已有技术指标）

```
anomaly_base = 1.0
  + price_anomaly  (0~1.0)
  + volume_anomaly (0~1.0)
  + signal_anomaly (0~1.0)
  + sentiment_anomaly (0~1.0)
  ─────────────────────────
  max: 5.0, min: 1.0
```

| 维度 | 计算方式 | 权重 |
|------|---------|------|
| price_anomaly | `abs(priceChangePct) > 3 ? min(abs(priceChangePct)/10, 1.0) : 0` | 0–1.0 |
| volume_anomaly | `volumeRatio > 2.0 ? min((volumeRatio-1)/3, 1.0) : 0` | 0–1.0 |
| signal_anomaly | `(goldenCross or deadCross) ? 0.5 : 0` + `(overbought or oversold) ? 0.5 : 0` | 0–1.0 |
| sentiment_anomaly | 舆情报告非空且包含"利空/利好/异动"等关键词 ? 0.3 : 0 | 0–0.3 |

LLM 微调：在 Stage 5 prompt 末尾加一行：

```
请额外输出一个 anomaly_score 字段（float, 1.0–5.0），
基于以上分析判断该股票今日是否显著偏离常态。
当前技术指标推算的基础分为 {anomaly_base}，你可在此基础上 ±1.0 调整。
```

**优点**：
- LLM 只做小范围调整，输出更稳定
- 减少了 LLM 需要"凭空判断"的负担
- 基础分完全由免费数据计算得出

### 2.3 流水线新增的 RAG 检索

计划文档第 14 行提到"流水线 → RAG 检索历史数据（价格/舆情/交易量/板块）"。这个改动**成本很高**：

- 每只股票流水线要额外调一次 `searchSimilar`，这意味着多一次 embedding API 调用。
- 当前 embedding API 也是外部服务，会增加延迟。

**建议**：流水线侧暂不引入 RAG。通过 SQL 直接查历史 `daily_info` + `daily_analysis_report` 获取结构化历史数据即可（这已经在做了——`prevReports` 参数）。历史对比需要的不是语义检索，而是同一只股票的历史走势数据，SQL 查询就能满足。

---

## 三、daily-summary 侧：异常股筛选

### 3.1 中位数阈值的问题

计划用 `anomaly_score > 中位数` 筛选异常股。数学上这会导致：

- **总是选中约 50% 的股票**，不管它们是否真的异常
- 某天如果所有股评分都在 2.0–3.0（轻度异常），中位数可能是 2.5——会筛出一大堆"正常"股
- 某天如果所有股评分在 1.0–1.5（都很正常），中位数 1.2 同样筛出一半

### 3.2 建议：固定阈值 + 上限保护

```typescript
const ANOMALY_THRESHOLD = 2.5;  // 基础分 1.0 + 至少一个维度有明显异常
const MAX_ANOMALY_STOCKS = 15;  // 每期最多分析 15 只

// 1. 按 anomaly_score DESC 排序
// 2. 取 score >= 2.5 的股票（确保是真的异常）
// 3. 如果超过 15 只，取 top-15
// 4. 如果一只都没有，取 top-3（保证至少有输出）
```

**为什么是 2.5**：对照 2.2 的公式，基础分 1.0 + 至少一个维度贡献 0.5 以上 + LLM 可能上调 → 2.5 对应"明显异常"。

---

## 四、维度分析：80 次 LLM 调用的优化

### 4.1 问题

计划 20 异常股 × 4 维度 = 每次 daily-summary 运行最多 **80 次 LLM 调用**。以 LM Studio 本地推理，每次调用 30–60 秒 → 总耗时 40–80 分钟。这在实际使用中几乎不可接受。

### 4.2 建议：合并为一个多维 prompt（每只股票 1 次调用）

既然这些维度分析最终都要塞给 LLM，不如**一次性让 LLM 从四个维度综合分析**：

```text
[系统] 你是一位A股多维分析师。请从以下四个维度分析 {股票代码} {股票名称} 今日的异常表现，
每个维度给出：异常原因（若有）、异常程度（1-5）、关键发现。

输入数据：
- 行情：{OHLCV 最近5天}
- 技术指标：{indicators JSON}
- 舆情：{sentiment report}
- 所属板块：{sector info}（如可用）

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

**效果**：
- 调用次数从 80 降为 20（减少 75%）
- 单个 prompt 约 800–1200 tokens（输入）+ 500 tokens（输出），LM Studio 可轻松处理
- LLM 能同时看到四个维度的数据，分析更连贯

---

## 五、RAG 检索策略：同日期检索的有效性问题

### 5.1 核心矛盾

计划用语义检索从 80+ 条**同一天、同一类型**的记录中选 top-N：

```text
query: "2026-06-30 A股市场异常分析综述"
候选集: 80 条 daily_detail 记录（日期相同、类型相同）
```

这些记录的 embedding 向量天然接近（都是 A 股维度分析文本），用通用 query 检索，similarity 分差会极小，top-N 近似随机选取。

### 5.2 建议：anomaly_score 排序 + 语义检索降级为辅助

| 策略 | 步骤 |
|------|------|
| **主排序** | 按 `anomaly_score` 降序排列，取 top-N（N 由上下文预算动态决定） |
| **语义辅助** | 仅在**跨日期**场景使用：检索历史 `daily_summary` 作为背景参考 |
| **去重/多样性** | 按 stock_code 分组，每只股票最多取 2 个维度（最高的两个）← 这是可选项 |

```typescript
function selectPromptEntries(
  details: DailySummaryDetail[],
  maxTokens: number,
  tokensPerEntry: number = 200
): DailySummaryDetail[] {
  const N = Math.floor(maxTokens / tokensPerEntry);
  
  // 1. 按 anomaly_score 降序
  const sorted = [...details].sort((a, b) => b.anomaly_score - a.anomaly_score);
  
  // 2. 取 top-N，但每只股票最多 2 个维度
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

### 5.3 上下文预算动态计算

给定 LM Studio 模型的上下文窗口，**用剩余 token 数反推 N**：

```typescript
function calcContextBudget(modelMaxTokens: number): number {
  const systemPromptTokens = 300;   // 系统 prompt（固定）
  const outputReserveTokens = 1500;  // LLM 输出预留（800-1200 字 ≈ 1500 tokens）
  return modelMaxTokens - systemPromptTokens - outputReserveTokens;
}
// 例：4096 模型 → 可用 2296 tokens → N ≈ 2296/200 ≈ 11 条
// 例：8192 模型 → 可用 6392 tokens → N ≈ 31 条
```

---

## 六、板块/行业数据：免费方案

### 6.1 东方财富行业板块 API（免费，无需认证）

```
# 获取所有行业板块列表
http://push2.eastmoney.com/api/qt/clist/get?
  pn=1&pz=500&po=1&np=1&
  fields=f12,f14&                    # f12=板块代码, f14=板块名称
  fid=f3&
  fs=m:90+t2                         # 概念板块 (t2=概念, t3=地域)
  &_={timestamp}

# 获取某板块的成分股
http://push2.eastmoney.com/api/qt/clist/get?
  pn=1&pz=500&
  fields=f12,f14&
  fid=f3&
  fs=b:BK0001                        # BK0001 是板块代码
  &_={timestamp}

# 获取板块行情
http://push2.eastmoney.com/api/qt/stock/trends2/get?
  secid=90.BK0001&
  fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&
  fields2=f51,f52,f53,f54,f55,f56,f57,f58
```

东方财富的接口**完全免费、无需 API Key**，返回 JSON 格式（注意部分接口返回 JSONP）。

### 6.2 实现路径

```
1. 新增 sector_service.ts
   - fetchSectorList()       → 获取行业/概念板块列表
   - fetchStockSector(code)  → 查询股票所属板块
   - fetchSectorTrend(code)  → 获取板块整体走势

2. 在 pipeline Stage 3 之后或集成到 Stage 5
   - 获取股票所属板块 → 查板块当日走势 → 注入 final_report prompt

3. daily_info 表可扩展
   - 或新建 sector_info 表存板块与股票的映射关系（缓存）
```

### 6.3 约束下的取舍

- 板块数据对单股分析是辅助信息，**不是强依赖**
- 首次建议：不新建表，直接在维度分析时实时查询。等稳定后再缓存
- 如果东方财富接口发生变化，有腾讯财经作为备选（腾讯也有板块行情接口）

---

## 七、数据库变更：完整 Schema 建议

### 7.1 `final_report` 新增字段

```sql
ALTER TABLE final_report ADD COLUMN anomaly_score REAL NOT NULL DEFAULT 1.0;
```

对应 Drizzle schema：

```typescript
export const finalReport = sqliteTable('final_report', {
  // ... 现有字段
  anomalyScore: real('anomaly_score').notNull().default(1.0),
});
```

### 7.2 新建 `daily_summary_detail` 表

```sql
CREATE TABLE daily_summary_detail (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code      TEXT    NOT NULL,          -- 股票代码
    date            TEXT    NOT NULL,          -- 'yyyy-MM-dd'
    dimension       TEXT    NOT NULL,          -- 'price' | 'sentiment' | 'volume' | 'sector'
    anomaly_desc    TEXT    NOT NULL DEFAULT '',-- 该维度异常描述
    anomaly_score   REAL    NOT NULL DEFAULT 1.0, -- 该维度异常分
    key_findings    TEXT    NOT NULL DEFAULT '',-- 关键发现
    pipeline_id     TEXT    NOT NULL DEFAULT '', -- 关联的流水线 ID
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dsd_date ON daily_summary_detail(date);
CREATE INDEX idx_dsd_stock_date ON daily_summary_detail(stock_code, date);
CREATE INDEX idx_dsd_dimension ON daily_summary_detail(dimension);
```

### 7.3 新建 `daily_summary` 表

```sql
CREATE TABLE daily_summary (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT    NOT NULL UNIQUE,   -- 'yyyy-MM-dd'，每天一期
    anomaly_count   INTEGER NOT NULL DEFAULT 0,-- 异常股票数量
    total_stocks    INTEGER NOT NULL DEFAULT 0,-- 股池总股票数
    full_report     TEXT    NOT NULL DEFAULT '',-- 完整报告
    overview        TEXT    NOT NULL DEFAULT '',-- 概述（200字内）
    pipeline_ids    TEXT    NOT NULL DEFAULT '[]', -- 关联的流水线 ID 列表 JSON
    model_used      TEXT    NOT NULL DEFAULT '',-- 使用的 LLM 模型名
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ds_date ON daily_summary(date);
```

### 7.4 `vec_embedding` 扩展

`content_type` 需要新增两种类型：

```diff
- content_type: 'analysis' | 'final'
+ content_type: 'analysis' | 'final' | 'daily_detail' | 'daily_summary'
```

同时 `searchSimilar()` 需要支持 `date` 过滤参数（详见下文 8.3）。

---

## 八、代码改动范围预估

### 8.1 流水线侧（pipeline.ts）

| 改动 | 规模 | 优先级 |
|------|------|--------|
| Stage 2 中计算 anomaly_base（规则引擎） | ~40 行新函数 | P0 |
| Stage 5 prompt 增加 anomaly_score 输出指令 | ~5 行 | P0 |
| `finalReport` schema 新增 `anomalyScore` 字段 | ~3 行 | P0 |
| 迁移脚本 | Drizzle generate + migrate | P0 |

### 8.2 daily-summary 侧（新文件 daily-summary-v2.ts）

| 改动 | 规模 | 优先级 |
|------|------|--------|
| 异常股筛选逻辑（固定阈值 + 上限保护） | ~30 行 | P0 |
| 多维分析 prompt 构建 | ~50 行 | P0 |
| 上下文预算计算 | ~20 行 | P0 |
| prompt entries 选择器（anomaly_score 排序） | ~30 行 | P0 |
| 最终报告生成 prompt | ~40 行 | P0 |
| `daily_summary_detail` 写入 + 向量化 | ~50 行 | P0 |
| `daily_summary` 写入 + 向量化 | ~40 行 | P0 |

### 8.3 embedding.ts 改动

```typescript
// searchSimilar 新增 date 参数
export async function searchSimilar(params: {
  query: string;
  type?: string;
  code?: string;
  date?: string;       // 新增：按日期过滤
  dateBefore?: string; // 新增：按日期上限过滤（历史检索用）
  limit?: number;
  minScore?: number;
}): Promise<SearchResult[]> {
  // ...
  if (params.date) {
    conditions.push(eq(vecEmbedding.contentDate, params.date));
  }
  if (params.dateBefore) {
    conditions.push(sql`${vecEmbedding.contentDate} < ${params.dateBefore}`);
  }
  // ...
}
```

### 8.4 板块服务（新文件 sector.ts）

| 功能 | 规模 |
|------|------|
| 从东方财富 API 获取板块分类 | ~40 行 |
| 查询股票所属板块 | ~30 行 |
| 获取板块行情走势 | ~40 行 |

### 8.5 总体工时估算

| 阶段 | 内容 | 预估 |
|------|------|------|
| P0-1 | 规则 anomaly_base + LLM 微调 + 迁移 | 1–2 天 |
| P0-2 | daily-summary-v2 核心逻辑（筛选 + 维度分析 + 报告生成） | 3–4 天 |
| P1 | 板块数据源 + embedding.ts 扩展 | 1–2 天 |
| P2 | 向量化 + RAG 跨日期检索 | 1 天 |

**合计约 6–9 天**。

---

## 九、第一步快速修复的具体方案（#85）

在完整方案落地前，先用**最小改动**让 daily-summary 不再 400：

### 方案 A：增量截断（推荐）

```typescript
function buildDailySummaryPrompt(pools: PoolSummaryData[], date: string, maxTokens = 3000): string {
  // 1. 先估算 header 和统计信息消耗的 token 数 ≈ 200
  // 2. 剩余 budget 分配给各股票
  // 3. 每只股票的 summary 按 budget 动态截断
  
  const budgetPerStock = Math.floor((maxTokens - 200) / pools.reduce((a, p) => a + p.stocks.length, 0));
  
  for (const s of stocks) {
    s.summary = s.summary.slice(0, budgetPerStock);
    s.finalSummary = s.finalSummary?.slice(0, budgetPerStock);
  }
  // ... construct prompt as before
}
```

**关键**：截断前先保留开头（通常是核心结论），不要从末尾截。

### 方案 B：只取信号最显著的股票（简化版）

当总股数 > 15 时，只保留看多/看空信号最明确的各 6–8 只 + 随机 3 只中性。这样 prompt 大小稳定在可控范围内。

---

## 十、总结与建议的优先级路径

```
第1步（立即）  ──→  方案 A：token 预算截断，修复 400 错误
                          │
第2步（本周）  ──→  规则引擎 anomaly_base + 流水线 prompt 改动 + 迁移
                          │
第3步（下周）  ──→  daily-summary-v2 核心：筛选 + 合并维度分析 + 报告
                          │
第4步（后续）  ──→  板块数据源 + 跨日期 RAG 检索
```

### 核心设计原则（约束条件下的）

| 原则 | 说明 |
|------|------|
| **规则优先于 LLM** | 凡是能用指标数据算出来的（异常分、信号检测），不要让 LLM 做 |
| **LLM 做微调不做决策** | LLM 的职责是解释"为什么"、发现规则引擎漏掉的信息，±1 调整 |
| **合并优于拆分** | 一个 prompt 能做的事不要拆成多个 LLM 调用 |
| **精确取优于模糊取** | 同一天的数据用 score 排序比语义检索更可靠 |
| **先本地再远程** | 能用 SQL 解决的不要走 embedding API |

---

## 附录

### A. 免费数据源汇总

| 数据 | 来源 | 认证 | 备注 |
|------|------|------|------|
| 日 K 线 (OHLCV) | 腾讯财经 `web.ifzq.gtimg.cn` | 无需 | 已实现，60 天历史 |
| 实时行情 | 腾讯财经 `web.sqt.gtimg.cn` | 无需 | 已实现 |
| 舆情搜索 | DashScope (阿里云百炼) `qwen` | API Key | 已实现，免费额度有限 |
| 行业/概念板块 | 东方财富 `push2.eastmoney.com` | 无需 | 待实现 |
| Embedding | LM Studio 本地 / 远端 API | 取决于配置 | 已实现 |

### B. 约束条件对方案的影响

| 约束 | 影响 | 应对 |
|------|------|------|
| 免费数据源 | 无 Wind/Choice 等专业终端数据 | 东方财富板块 API 补足 |
| 免费数据源 | 无实时 Level-2 数据 | 现有腾讯接口已满足日频需求 |
| LM Studio 上下文限制 | prompt 不能超过 4K-8K tokens | 上下文预算动态计算（第六章） |
| LM Studio 显存限制 | 不能并行推理 | 串行执行设计已考虑 |
| LM Studio 推理速度 | 每次调用 30-60 秒 | 合并多维度为单次调用（第三章） |
| DashScope 免费额度 | 日搜索次数有限 | 舆情结果缓存一天内复用 |
