/**
 * 每日综合股池综述服务 v2
 *
 * 通过"方法论 + 多轮 + RAG"提升每日综述质量。
 *
 * 流水线：
 *   筛选异常股票 → 逐只多维分析 → prompt 内容筛选 → 综合报告生成
 *
 * @module services/daily-summary-v2
 */

import { getDatabase } from '../db/index.js';
import {
  finalReport,
  dailySummaryDetail,
  dailySummary,
  stock,
} from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as llmService from './llm.js';
import * as sessionService from './session.js';
import * as embeddingService from './embedding.js';
import { getStockSectors } from './sector.js';

// ─── 常量 ────────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 2.5;   // 异常判定阈值
const MAX_ANOMALY_STOCKS = 15;   // 每期最多分析 15 只
const MIN_ANOMALY_STOCKS = 3;    // 兜底至少 3 只
const MAX_DIMS_PER_STOCK = 2;    // prompt 中每只股票最多 2 个维度
const OUTPUT_RESERVE_TOKENS = 1500; // LLM 输出预留 token
const SYS_PROMPT_TOKENS = 300;   // 系统 prompt 开销
const TOKENS_PER_ENTRY = 200;    // 每条维度分析约 200 token

// ─── 类型 ────────────────────────────────────────────────────────

interface AnomalyStock {
  code: string;
  name: string;
  anomalyScore: number;
  summary: string;
  fullReport: string;
}

interface DimensionAnalysis {
  stockCode: string;
  date: string;
  dimension: 'price' | 'sentiment' | 'volume' | 'sector';
  anomalyDesc: string;
  anomalyScore: number;
  keyFindings: string;
}

/** 逐只多维分析的 LLM 输出结构 */
interface MultiDimLLMOutput {
  stock_code: string;
  dimensions: {
    dimension: string;
    anomaly_desc: string;
    anomaly_score: number;
    key_findings: string;
  }[];
}

export interface DailySummaryV2Result {
  date: string;
  anomalyStocks: number;
  totalStocks: number;
  anomalies: { code: string; name: string; score: number }[];
  llmSummary: string;
}

// ─── 1. 筛选异常股票 ─────────────────────────────────────────────

/**
 * 从当日 final_report 中筛选异常股票。
 *
 * 策略：固定阈值 2.5 + 上限 15 只 + 兜底 top-3。
 * 保证即使所有股都正常，至少也有 3 只进入分析。
 */
function selectAnomalyStocks(date: string): AnomalyStock[] {
  const db = getDatabase();

  const rows = db
    .select({
      code: finalReport.code,
      name: stock.name,
      anomalyScore: finalReport.anomalyScore,
      summary: finalReport.summary,
      fullReport: finalReport.fullReport,
    })
    .from(finalReport)
    .innerJoin(stock, eq(finalReport.code, stock.code))
    .where(eq(finalReport.date, date))
    .orderBy(desc(finalReport.anomalyScore))
    .all();

  // 按 anomaly_score >= 阈值筛选（null → 1.0，避免旧数据异常）
  let candidates = rows.filter((r) => (r.anomalyScore ?? 1.0) >= ANOMALY_THRESHOLD);

  // 超过上限则截断
  if (candidates.length > MAX_ANOMALY_STOCKS) {
    candidates = candidates.slice(0, MAX_ANOMALY_STOCKS);
  }

  // 兜底：一只都没有则取 top-3
  if (candidates.length === 0) {
    candidates = rows.slice(0, MIN_ANOMALY_STOCKS);
  }

  return candidates.map((r) => ({
    code: r.code,
    name: r.name,
    anomalyScore: r.anomalyScore ?? 1.0,
    summary: r.summary,
    fullReport: r.fullReport,
  }));
}

// ─── 2. 逐只多维分析 ─────────────────────────────────────────────

/**
 * 构建多维分析 prompt。
 * 一次 LLM 调用完成四维度分析，输出结构化 JSON。
 */
function buildMultiDimPrompt(stock: AnomalyStock, sectorInfo?: string): string {
  return `你是一位A股多维分析师。请从以下四个维度分析 ${stock.code} ${stock.name} 今日的异常表现。

## 输入数据
- 股票：${stock.code} ${stock.name}
- 综合打分：${stock.anomalyScore.toFixed(1)}（越大越异常）
- 流水线分析摘要：${stock.summary}
- 流水线完整报告：${stock.fullReport}

## 分析要求
请从以下四个维度分析，每个维度给出：
1. anomaly_desc：该维度异常原因（若无异常则填"正常"）
2. anomaly_score：该维度异常程度（1=正常, 2~3=轻度异常, 4~5=显著异常）
3. key_findings：关键发现（一句话）

## 四个维度
- price：价格维度 — 涨跌幅、价格偏离、技术形态
- sentiment：舆情维度 — 舆情与结论是否相悖
- volume：交易量维度 — 放量/缩量情况
- sector：板块维度 — 所属板块整体表现关联${sectorInfo ? `\n\n## 板块数据（实时）\n${sectorInfo}` : ''}

## 输出格式（仅输出 JSON）
{
  "stock_code": "${stock.code}",
  "dimensions": [
    { "dimension": "price", "anomaly_desc": "...", "anomaly_score": 1.0, "key_findings": "..." },
    { "dimension": "sentiment", "anomaly_desc": "...", "anomaly_score": 1.0, "key_findings": "..." },
    { "dimension": "volume", "anomaly_desc": "...", "anomaly_score": 1.0, "key_findings": "..." },
    { "dimension": "sector", "anomaly_desc": "...", "anomaly_score": 1.0, "key_findings": "..." }
  ]
}`;
}

/**
 * 解析多维分析 LLM 回复。
 * 兼容字段名大小写和额外字段。
 */
function parseMultiDimResponse(
  raw: string,
  stockCode: string,
  date: string,
): DimensionAnalysis[] {
  try {
    const parsed = JSON.parse(raw) as MultiDimLLMOutput;
    if (!parsed.dimensions || !Array.isArray(parsed.dimensions)) {
      throw new Error('缺少 dimensions 数组');
    }
    return parsed.dimensions.map((d) => ({
      stockCode,
      date,
      dimension: d.dimension as DimensionAnalysis['dimension'],
      anomalyDesc: d.anomaly_desc || '',
      anomalyScore: Math.min(Math.max(d.anomaly_score || 1.0, 1.0), 5.0),
      keyFindings: d.key_findings || '',
    }));
  } catch {
    // JSON 解析失败，返回一个兜底条目
    return [
      {
        stockCode,
        date,
        dimension: 'price' as const,
        anomalyDesc: 'LLM 回复解析失败',
        anomalyScore: 1.0,
        keyFindings: '无法解析分析结果',
      },
    ];
  }
}

/**
 * 对单只异常股票运行多维分析。
 * 1 次 LLM 调用，结果写入 daily_summary_detail 并向量化。
 */
async function analyzeAnomalyStock(
  stock: AnomalyStock,
  date: string,
): Promise<DimensionAnalysis[]> {
  // 0. 获取板块数据（注入到 prompt 让 LLM 有真实数据可参考）
  let sectorInfo: string | undefined;
  try {
    const sectors = await getStockSectors(stock.code);
    if (sectors.length > 0) {
      sectorInfo = sectors
        .map(s => `- ${s.name}(${s.code}): ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}% [${s.type === 'industry' ? '行业' : '概念'}]`)
        .join('\n');
    }
  } catch (err) {
    console.warn(`[daily-summary-v2] 获取板块数据失败 (${stock.code}):`, (err as Error).message);
  }

  // 1. 构造 prompt 并调用 LLM
  const prompt = buildMultiDimPrompt(stock, sectorInfo);
  const sid = sessionService.createSession();
  sessionService.appendMessage(sid, 'system', prompt);

  let llmResponse: string;
  try {
    llmResponse = await llmService.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
      temperature: 0.3,
      sessionId: sid,
    });
  } catch (err) {
    console.warn(`[daily-summary-v2] LLM 多维分析失败 (${stock.code}):`, (err as Error).message);
    return []; // 失败时不写入兜底数据，直接跳过该股票的维度分析
  }

  // 2. 解析结果
  const dimensions = parseMultiDimResponse(llmResponse, stock.code, date);

  // 3. 写入 daily_summary_detail 表
  const db = getDatabase();
  for (const dim of dimensions) {
    db.insert(dailySummaryDetail)
      .values({
        stockCode: dim.stockCode,
        date,
        dimension: dim.dimension,
        anomalyDesc: dim.anomalyDesc,
        anomalyScore: dim.anomalyScore,
        keyFindings: dim.keyFindings,
      })
      .run();
  }

  // 4. 向量化每条维度分析
  for (const dim of dimensions) {
    try {
      const text = `[${dim.stockCode} ${date} ${dim.dimension}] ${dim.anomalyDesc} ${dim.keyFindings}`;
      const embedding = await embeddingService.getEmbedding(text);
      await embeddingService.storeEmbedding({
        contentType: 'daily_detail',
        contentCode: dim.stockCode,
        contentDate: date,
        contentText: text,
        embedding,
      });
    } catch (err) {
      console.warn(`[daily-summary-v2] 向量化失败 (${dim.stockCode} ${dim.dimension}):`, (err as Error).message);
    }
  }

  return dimensions;
}

// ─── 3. prompt 内容筛选器 ─────────────────────────────────────────

/**
 * 从 daily_summary_detail 中筛选进入最终 prompt 的内容。
 *
 * 策略：anomaly_score 降序 + 每只股票最多 2 个维度 + 上下文预算约束。
 * 不依赖语义检索（同日期同类型向量相似度过高）。
 */
function selectPromptEntries(
  date: string,
  contextLimit: number,
): DimensionAnalysis[] {
  const db = getDatabase();

  const allDetails = db
    .select()
    .from(dailySummaryDetail)
    .where(eq(dailySummaryDetail.date, date))
    .orderBy(desc(dailySummaryDetail.anomalyScore))
    .all();

  if (allDetails.length === 0) return [];

  // 计算可用预算（下限保护：极端小上下文配置下至少 3 条）
  const availableTokens = Math.max(0, contextLimit - SYS_PROMPT_TOKENS - OUTPUT_RESERVE_TOKENS);
  const maxEntries = Math.max(3, Math.floor(availableTokens / TOKENS_PER_ENTRY));

  // 按 anomaly_score 降序，每只股票最多 2 个维度
  const result: typeof allDetails = [];
  const stockCount = new Map<string, number>();

  for (const entry of allDetails) {
    const count = stockCount.get(entry.stockCode) ?? 0;
    if (count >= MAX_DIMS_PER_STOCK) continue;
    result.push(entry);
    stockCount.set(entry.stockCode, count + 1);
    if (result.length >= maxEntries) break;
  }

  return result.map((r) => ({
    stockCode: r.stockCode,
    date: r.date,
    dimension: r.dimension as DimensionAnalysis['dimension'],
    anomalyDesc: r.anomalyDesc,
    anomalyScore: r.anomalyScore,
    keyFindings: r.keyFindings,
  }));
}

// ─── 4. 综合报告生成 ─────────────────────────────────────────────

/**
 * 构建最终报告 prompt。
 * 包含筛选后的维度分析 + 可选的 RAG 历史参考。
 */
async function buildSummaryPrompt(
  entries: DimensionAnalysis[],
  date: string,
): Promise<string> {
  // 1. 构建各维度分析文本
  const dimSections = entries.map((e) => {
    const label =
      e.dimension === 'price'
        ? '价格'
        : e.dimension === 'sentiment'
          ? '舆情'
          : e.dimension === 'volume'
            ? '交易量'
            : '板块';
    return `- ${e.stockCode} [${label}] (异常分: ${e.anomalyScore.toFixed(1)})
  异常描述: ${e.anomalyDesc}
  关键发现: ${e.keyFindings}`;
  });

  // 2. 按股票分组统计
  const stockStats = new Map<string, { dims: string[]; maxScore: number }>();
  for (const e of entries) {
    const existing = stockStats.get(e.stockCode) ?? { dims: [], maxScore: 0 };
    existing.dims.push(e.dimension);
    existing.maxScore = Math.max(existing.maxScore, e.anomalyScore);
    stockStats.set(e.stockCode, existing);
  }
  const stockLines = [...stockStats.entries()]
    .map(([code, s]) => `- ${code} (异常维度: ${s.dims.join(', ')}, 最高异常分: ${s.maxScore.toFixed(1)})`)
    .join('\n');

  // 3. 可选：RAG 检索历史 daily_summary
  let historySection = '';
  try {
    const historyResults = await embeddingService.searchSimilar({
      query: `${date} A股市场异常分析综述 股票池`,
      type: 'daily_summary',
      dateBefore: date, // 排除今天，只查历史
      limit: 2,
      minScore: 0.6,
    });
    if (historyResults.length > 0) {
      historySection =
        '\n## 历史参考\n' +
        historyResults
          .map((r) => `- ${r.date} (相关度: ${r.relevance}): ${r.snippet}`)
          .join('\n');
    }
  } catch {
    // RAG 失败时不阻塞
  }

  const stockSummary =
    `涉及 ${stockStats.size} 只异常股票\n` +
    [...stockStats.entries()]
      .filter(([, s]) => s.maxScore >= 3)
      .map(([code]) => code)
      .join(', ');

  return `你是一位资深的A股投资策略分析师。请基于以下 ${date} 的异常分析数据，生成一份每日投资综述。

## 格式要求
- 语言：中文
- 风格：专业、简洁、客观
- 字数：800-1200字

## 内容要求
1. **市场概况**：今日异常股票数量、分布和整体特征
2. **重点异常个股分析**：选出异常最显著的 3-5 只股票，分析其背后原因
3. **各维度异常总览**：价格/舆情/交易量/板块维度的整体情况
4. **风险提示**：需要特别关注的风险点
5. **综合研判**：对明日市场的简要展望和策略建议

## 异常股票概览
${stockLines}

## 逐维度详细分析
${dimSections.join('\n\n')}
${historySection}

请直接输出综述内容，不要输出 JSON。`;
}

// ─── 5. 主入口 ────────────────────────────────────────────────────

/**
 * 生成每日综合股池综述（v2）。
 *
 * 完整流程：
 * 1. 筛选异常股票（阈值 2.5 + 上限 15 + 兜底 3）
 * 2. 逐只多维分析（串行，每只 1 次 LLM 调用）
 * 3. prompt 内容筛选（score 排序 + 最多 2 维/股）
 * 4. 综合报告生成（含可选的 RAG 历史参考）
 * 5. 结果持久化到 daily_summary 表并向量化
 *
 * @param date - 目标日期（默认今天），格式 yyyy-MM-dd
 * @returns 生成的综述结果
 */
export async function generateDailySummaryV2(
  date?: string,
): Promise<DailySummaryV2Result> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const db = getDatabase();

  // 1. 筛选异常股票
  const anomalies = selectAnomalyStocks(targetDate);
  const totalStocks = db
    .select({ count: sql<number>`count(*)` })
    .from(finalReport)
    .where(eq(finalReport.date, targetDate))
    .get()?.count ?? 0;

  console.log(
    `[daily-summary-v2] 筛选结果: ${anomalies.length} 只异常股票（共 ${totalStocks} 只）`,
  );

  if (anomalies.length === 0) {
    return {
      date: targetDate,
      anomalyStocks: 0,
      totalStocks,
      anomalies: [],
      llmSummary: '暂无股池数据，请先添加股票并运行流水线。',
    };
  }

  // 2. 串行执行逐只多维分析
  console.log(`[daily-summary-v2] 开始多维分析: ${anomalies.length} 只股票`);
  for (const stock of anomalies) {
    console.log(`[daily-summary-v2]   分析 ${stock.code} ${stock.name}...`);
    await analyzeAnomalyStock(stock, targetDate);
  }

  // 3. prompt 内容筛选
  const contextLimit = llmService.getContextLimit();
  const entries = selectPromptEntries(targetDate, contextLimit);
  console.log(
    `[daily-summary-v2] 筛选结果: ${entries.length} 条维度分析进入 prompt`,
  );

  // 4. 综合报告生成
  const prompt = await buildSummaryPrompt(entries, targetDate);
  const sid = sessionService.createSession();
  sessionService.appendMessage(sid, 'system', prompt);

  let llmSummary: string;
  try {
    llmSummary = await llmService.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.5,
      sessionId: sid,
    });
    sessionService.appendMessage(sid, 'assistant', llmSummary);
  } catch (err) {
    llmSummary = `LLM 调用失败: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[daily-summary-v2] 最终报告 LLM 调用失败:', llmSummary);
    sessionService.appendMessage(sid, 'assistant', llmSummary);
  }

  // 5. 持久化到 daily_summary 表
  const overview = llmSummary.slice(0, 200);
  db.insert(dailySummary)
    .values({
      date: targetDate,
      anomalyCount: anomalies.length,
      totalStocks,
      fullReport: llmSummary,
      overview,
      pipelineIds: '[]',
      modelUsed: process.env.LLM_MODEL || '',
    })
    .onConflictDoUpdate({
      target: [dailySummary.date],
      set: {
        anomalyCount: anomalies.length,
        totalStocks,
        fullReport: llmSummary,
        overview,
      },
    })
    .run();

  // 6. 向量化 daily_summary 入库
  try {
    const embeddingText = `[日综述 ${targetDate}] ${overview}`;
    const embedding = await embeddingService.getEmbedding(embeddingText);
    // 先清理旧的 daily_summary 类型向量
    await embeddingService.deleteEmbeddings(targetDate, 'daily_summary');
    await embeddingService.storeEmbedding({
      contentType: 'daily_summary',
      contentCode: targetDate,
      contentDate: targetDate,
      contentText: llmSummary.slice(0, 500),
      embedding,
    });
  } catch (err) {
    console.warn('[daily-summary-v2] daily_summary 向量化失败:', (err as Error).message);
  }

  return {
    date: targetDate,
    anomalyStocks: anomalies.length,
    totalStocks,
    anomalies: anomalies.map((a) => ({
      code: a.code,
      name: a.name,
      score: a.anomalyScore,
    })),
    llmSummary,
  };
}

// ─── 打印 ─────────────────────────────────────────────────────────

/**
 * 格式化并打印每日综述到控制台。
 */
export function printDailySummaryV2(summary: DailySummaryV2Result): void {
  const sep = '='.repeat(60);
  console.log(`\n${sep}`);
  console.log(`  📋 每日综合股池综述 v2 — ${summary.date}`);
  console.log(sep);
  console.log(`  总览: ${summary.totalStocks} 只股票 | 异常: ${summary.anomalyStocks} 只`);
  if (summary.anomalies.length > 0) {
    console.log(`  异常股票: ${summary.anomalies.map((a) => `${a.name}(${a.score.toFixed(1)})`).join(', ')}`);
  }
  console.log(sep);
  console.log(summary.llmSummary);
  console.log(`${sep}\n`);
}
