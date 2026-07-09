# 流水线实现设计

> 阶段：详细设计 — 个股分析流水线的实现细节。
> 概念流程详见 [个股分析流水线](concepts/analysis-pipeline.md)。

## 阶段总览

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  Stage 1       Stage 2       Stage 3       Stage 4       Stage 5      │
│  数据获取  →   客观报告   →   舆情获取  →  多角色分析  →  综合报告    │
│               (LLM)         (搜索API)      (本地LLM)     (本地LLM)    │
│                                                                        │
│  session_id + pipeline_id 贯穿整个流水线，用于上下文管理和取消控制          │
│  向量检索在 Stage 2 和 Stage 5 前调用                                   │
│  多池支持：run-pool-pipeline 接受多个 poolId 或 --all 串行执行            │
│  取消控制：stop-pipeline <pipelineId> 通过 AbortController 中断流水线    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1 — 数据获取

### 流程

```
1. 校验 stock_code 是否合法
2. 获取前 60 个交易日数据
   → 从腾讯财经接口获取
   → 检查频率限制，确保请求间隔 > 1s（硬性限制，防止封 IP）
3. 获取昨日数据
   → 若当日为交易日且已收盘，获取当日数据
   → 否则取最近交易日
4. 解析响应，写入 daily_info 表（UPSERT）
5. 更新 stock.current_price
```

### 频率限制

- 腾讯财经接口：**每次请求间隔 ≥ 1 秒**
- 批量获取多个股票时：逐个请求，间隔轮询
- 推荐运行时间：**交易日 15:30 之后**（收盘后数据稳定）

### 输入输出

```
入参：code: string
出参：{ success: boolean, date: string, records: number }
```

---

## Stage 2 — 客观报告（调用 LLM）

### 流程

```
1. 从 daily_info 读取该股最近 60 个交易日数据
2. 读取前 3 个交易日的 daily_analysis_report（如果存在）
3. 调用向量检索，召回相关历史报告作为上下文
4. 构造 prompt，发送给本地 LLM（LM Studio）
5. 解析 LLM 回复，写入 daily_analysis_report 表
6. 将报告向量化，存入 vec_embedding 表
```

### Prompt 框架

```
你是一个客观的 A 股数据分析师。请基于以下数据生成一份客观分析报告。

[股票信息]
代码：{code}   名称：{name}

[最近 60 个交易日行情]
{ohlcv_data}

[历史报告参考]
{previous_reports}

[前 3 日报告摘要]
{recent_summaries}

要求：
1. 仅陈述客观事实和数据，不要给出投资建议
2. 输出结构化数据（指标）+ 简洁的文字总结
3. 对比与前一日的指标变化
4. 字数限制：{word_limit} 字以内
```

### 字数控制

- 客观报告字数上限：**500 字**
- 由 token 估算 + 字符计数双重保障
- 超长时截断并添加 `[已截断]` 标记

### 输入输出

```
入参：code: string, date: string
出参：DailyAnalysisReport（结构化指标 + 文本摘要）
```

---

## Stage 3 — 舆情获取

> 数据源：阿里云百炼 DashScope API（`qwen3.5-flash` + `enable_search=true`）
> 该 API 同时完成搜索和舆情摘要生成，无需额外的 LLM 调用。

### 流程

```
1. 检查 DASHSCOPE_API_KEY 是否配置
2. 如未配置，跳过本阶段，标记舆情报告为"无数据"
3. 如已配置，调用 DashScope API：
   - model: qwen3.5-flash
   - enable_search: true
   - prompt: "搜索 {股票代码} {股票名称} 最近三天的相关新闻和市场信息"
4. 解析返回内容，提取新闻要点
5. 写入 sentiment_report 表
```

### 输入输出

```
入参：code: string, date: string
出参：SentimentReport
```

---

## Stage 4 — 多角色分析

### 角色与顺序

| 顺序 | 角色 | 侧重 |
|------|------|-------|
| 1 | 技术分析师 | 技术指标解读 |
| 2 | 基本面分析师 | 基本面评估 |
| 3 | 舆情分析师 | 市场情绪解读 |
| 4 | 风控官 | 风险评估 |

### 轮次设计

**第一轮（必须）**：1 → 2 → 3 → 4 依次发言
**第二轮（可选）**：4 → 3 → 2 → 1 依次回应分歧

### Prompt 框架（以技术分析师为例）

```
你是一位 A 股技术分析师。请基于以下信息进行技术分析。

[股票信息]
代码：{code}   名称：{name}

[客观数据报告]
{indicators_json}
{summary}

{历史上下文（第一轮第2人开始会有前一个人的发言）}

{前序发言}  // 第二轮时：第一轮所有人的发言

要求：
1. 专注于技术面分析，不要讨论基本面或消息面
2. 指出关键的技术信号和形态
3. 如有不同意见，请明确反驳并说明理由（仅第二轮）
4. 字数限制：{word_limit} 字以内
```

### 字数控制

每个角色每轮发言字数上限：

| 角色 | 第一轮上限 | 第二轮上限 |
|------|-----------|-----------|
| 技术分析师 | 400 字 | 300 字 |
| 基本面分析师 | 400 字 | 300 字 |
| 舆情分析师 | 300 字 | 200 字 |
| 风控官 | 300 字 | 300 字 |

### Session 管理

- 每启动一次流水线，创建一个新的 LLM session
- session_id 随 prompt 传递给 LM Studio
- 角色切换时不清空 session，追加历史消息
- 流水线结束后保留 session 用于结果溯源

### 输入输出

```
入参：code: string, date: string, dar: DailyAnalysisReport, sr?: SentimentReport
出参：AnalysisRoler[]（每人每条发言记录）
```

---

## Stage 5 — 综合报告

### 流程

```
1. 收集客观报告、舆情报告、多角色发言记录
2. 构造综合 prompt，发送给本地 LLM
3. 分别生成 full 和 overview 两个版本
4. 写入 final_report 表
5. 将报告向量化，存入 vec_embedding 表
```

### Prompt 框架

```
你是一位资深的 A 股投资分析师。请综合以下材料，生成一份投资分析报告。

[股票信息]
代码：{code}   名称：{name}

[客观数据报告]
{objective_report}

[舆情分析]
{sentiment_report}

[多角色分析讨论记录]
{role_discussions}

请生成以下两个部分：

1. 【概述】（overview，200 字以内）
   核心结论、关键信号、主要风险

2. 【完整报告】（full）
   分为以下章节：
   a. 技术面分析
   b. 基本面分析
   c. 市场情绪分析
   d. 风险提示
   e. 综合判断
```

### 输出格式

```json
{
  "summary": "核心结论...（200字以内）",
  "fullReport": "# 技术分析\n...\n\n# 基本面分析\n...",
  "roleSummary": [
    { "role": "技术分析师", "keyPoint": "..." },
    { "role": "基本面分析师", "keyPoint": "..." },
    { "role": "舆情分析师", "keyPoint": "..." },
    { "role": "风控官", "keyPoint": "..." }
  ]
}
```

### 输入输出

```
入参：code: string, date: string
出参：FinalReport
```

---

## Session 管理

### 生命周期

```
new session      →  流水线启动时创建
append message   →  每次 LLM 调用后追加
clear session    →  流水线结束后保留（可选重置）
list sessions    →  查看活跃 sessions
```

### 存储方式

- 运行时内存管理，不持久化
- 每个 session 存储：ID、创建时间、消息历史（摘要裁剪后）
- 消息历史超过 20 条时，裁剪最早的 5 条

### 上下文控制

```
会话累积达到上下文阈值时：
1. 优先裁剪工具调用记录（非对话内容）
2. 其次压缩早期 LLM 回复（保留摘要）
3. 不可裁剪部分：当前 prompt、核心数据
```

---

## 向量检索

### 索引内容

| 来源 | content_type | 何时索引 |
|------|-------------|---------|
| DailyAnalysisReport | `analysis` | Stage 2 完成后 |
| FinalReport | `final` | Stage 5 完成后 |

### 检索时机

- Stage 2 前：检索该股历史分析报告（作为客观报告上下文）
- Stage 5 前：检索该股历史最终报告（作为综合报告上下文）

### 检索参数

```
默认 top_k = 5
时间范围过滤：最近 30 天
相似度阈值：≥ 0.7
```

### Embedding API 调用

```
端点：通过 .env 配置（兼容 OpenAI 格式）
模型：text-embedding-3-small（或等价模型）
超时：10 秒
频率限制：每分钟最多 100 次调用
失败处理：重试 2 次，失败后跳过向量化（不影响主流程）
```

---

## 每日综述 Hook（v2，推荐）

### 触发时机

**自动触发**：`runPoolFullPipeline` 执行完成后（`finally` 块中），只要 `totalCompleted > 0` 就自动生成。
无论流水线成功完成还是中途崩溃，已成功执行的股票都会触发每日综述。

也支持通过 CLI 或 MCP 工具手动调用：

```bash
# v2（推荐）— 异常值驱动 + 多维分析 + RAG
fi-pool daily-summary-v2 [date]
fi-pool daily-summary-v2 [date] --verbose  # 带诊断信息

# v1（已废弃，因 MAX_INPUT_TOKENS=3000 限制始终 400 错误）
fi-pool daily-summary [date]                # ⚠ DEPRECATED
```

### 核心改进（v2）

- **异常值驱动**：通过 anomaly_score > 2.5 识别异常股票，聚焦于值得关注的标的
- **多维分析**：price / sentiment / volume / sector 四个维度独立分析
- **RAG 增强**：向量检索历史报告，为 LLM 提供更丰富的上下文
- **--verbose 模式**：输出各池覆盖率、分数分布等诊断信息

### 输出示例

```
📊 每日综合股池综述 — 2026-07-09
────────────────────────────────────────
  总股票: 66
  异常股票: 5 (anomaly_score > 2.5)
  异常分布: price=2, volume=2, sentiment=1, sector=0

📈 技术面异常
...
```

详见 [每日综述 v2 设计文档](daily-summary-improvement-plan.md)。