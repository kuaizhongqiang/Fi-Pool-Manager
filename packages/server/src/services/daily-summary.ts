/**
 * 每日综合股池综述服务
 *
 * 在流水线执行完成后，自动或手动生成每日综合投资回顾。
 * 汇总两个股池的行情数据、技术信号和 LLM 分析报告，
 * 调用 LLM 生成一份完整的每日投资综述。
 *
 * @module services/daily-summary
 */

import { getDatabase } from '../db/index.js';
import { pool, poolStock, stock, dailyAnalysisReport, finalReport } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import * as llmService from './llm.js';
import * as sessionService from './session.js';

// ─── 类型 ────────────────────────────────────────────────────────

/** daily_analysis_report.signals 字段的 JSON 结构 */
interface AnalysisSignals {
  goldenCross?: boolean;
  deadCross?: boolean;
  overbought?: boolean;
  oversold?: boolean;
  volumeSpike?: boolean;
  volumeRatio?: number;
}

/**
 * 综合多维度信号计算看多/看空/中性评级。
 * 优先级：金叉 > 死叉 > 超卖 > 超买。
 */
function computeSignal(signalsStr: string | null | undefined): number {
  if (!signalsStr) return 0;
  try {
    const s: AnalysisSignals = JSON.parse(signalsStr);
    if (s.goldenCross) return 1;
    if (s.deadCross) return -1;
    if (s.oversold) return 1;    // RSI < 20，超卖有反弹预期
    if (s.overbought) return -1; // RSI > 80，超买有回调风险
    return 0;
  } catch {
    return 0;
  }
}

// ─── 类型 ────────────────────────────────────────────────────────

export interface StockSignal {
  code: string;
  name: string;
  currentPrice: number;
  signal: number;       // -1 看空, 0 中性, 1 看多
  summary: string;
  finalSummary?: string; // final report 的 summary
}

export interface PoolSummaryData {
  poolId: number;
  poolName: string;
  stocks: StockSignal[];
  bullish: number;
  bearish: number;
  neutral: number;
}

export interface DailySummary {
  date: string;
  pools: PoolSummaryData[];
  overall: {
    totalStocks: number;
    totalBullish: number;
    totalBearish: number;
    totalNeutral: number;
  };
  llmSummary: string;       // LLM 生成的综述文本
  pipelineTriggered: boolean; // 是否由流水线完成自动触发
}

// ─── 数据收集 ─────────────────────────────────────────────────────

/**
 * 收集所有股池的最新分析数据，供 LLM 生成综述使用。
 *
 * 使用批量查询（IN）代替逐股 N+1 查询，避免性能问题。
 */
async function collectPoolData(date: string): Promise<PoolSummaryData[]> {
  const db = getDatabase();
  const pools = db.select().from(pool).all();
  if (pools.length === 0) return [];

  // 1. 一次性获取所有股池的股票代码
  const poolStockRows = db
    .select({
      poolId: poolStock.poolId,
      code: poolStock.stockCode,
    })
    .from(poolStock)
    .all();

  // 按 poolId 分组
  const codesByPool = new Map<number, string[]>();
  for (const row of poolStockRows) {
    const list = codesByPool.get(row.poolId) ?? [];
    list.push(row.code);
    codesByPool.set(row.poolId, list);
  }

  const allCodes = [...new Set(poolStockRows.map((r) => r.code))];
  if (allCodes.length === 0) return [];

  // 2. 批量查询所有股票信息
  const stockRows = db
    .select()
    .from(stock)
    .all();
  const stockMap = new Map(stockRows.map((s) => [s.code, s]));

  // 3. 批量查询所有股的最新分析报告
  //
  //    每个 code 只取最新的一条（date <= targetDate, ORDER BY date DESC LIMIT 1）
  //    用子查询实现：WHERE rowid IN (SELECT rowid FROM ... GROUP BY code)
  const analysisRows = db
    .select({
      code: dailyAnalysisReport.code,
      date: dailyAnalysisReport.date,
      summary: dailyAnalysisReport.summary,
      signals: dailyAnalysisReport.signals,
    })
    .from(dailyAnalysisReport)
    .where(sql`${dailyAnalysisReport.date} <= ${date}`)
    .all();

  // 按 code 分组取最新
  const latestAnalysis = new Map<string, typeof analysisRows[0]>();
  for (const row of analysisRows) {
    const existing = latestAnalysis.get(row.code);
    if (!existing || row.date > existing.date) {
      latestAnalysis.set(row.code, row);
    }
  }

  // 4. 批量查询所有股的最终报告（只取最新 summary）
  const finalRows = db
    .select({
      code: finalReport.code,
      date: finalReport.date,
      summary: finalReport.summary,
    })
    .from(finalReport)
    .where(sql`${finalReport.date} <= ${date}`)
    .all();

  const latestFinal = new Map<string, typeof finalRows[0]>();
  for (const row of finalRows) {
    const existing = latestFinal.get(row.code);
    if (!existing || row.date > existing.date) {
      latestFinal.set(row.code, row);
    }
  }

  // 5. 组装结果
  const results: PoolSummaryData[] = [];

  for (const p of pools) {
    const stockCodes = codesByPool.get(p.id) ?? [];
    const stockSignals: StockSignal[] = [];

    for (const code of stockCodes) {
      const stk = stockMap.get(code);
      if (!stk) continue;

      const analysis = latestAnalysis.get(code);
      const final = latestFinal.get(code);
      const signal = computeSignal(analysis?.signals ?? null);

      stockSignals.push({
        code,
        name: stk.name,
        currentPrice: stk.currentPrice,
        signal,
        summary: analysis?.summary?.slice(0, 300) ?? '无分析报告',
        finalSummary: final?.summary?.slice(0, 300),
      });
    }

    results.push({
      poolId: p.id,
      poolName: p.name,
      stocks: stockSignals,
      bullish: stockSignals.filter((s) => s.signal === 1).length,
      bearish: stockSignals.filter((s) => s.signal === -1).length,
      neutral: stockSignals.length - stockSignals.filter((s) => s.signal === 1).length - stockSignals.filter((s) => s.signal === -1).length,
    });
  }

  return results;
}

/**
 * 粗略估算文本的 token 数。
 * 中文约 2 字符/token，英文约 4 字符/token。
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    if (ch > 'ÿ') cjk++;
    else ascii++;
  }
  return Math.ceil(cjk / 2 + ascii / 4);
}

/**
 * 构建 LLM 用的 prompt，将所有股池数据格式化为结构化文本。
 *
 * 动态截断：根据 LLM 上下文窗口和输出预留，计算每只股票可用的 token 预算，
 * 超出时从尾部截断分析摘要，保证总 prompt 不超出模型容量，避免 400 错误。
 */
function buildDailySummaryPrompt(pools: PoolSummaryData[], date: string): string {
  const MAX_INPUT_TOKENS = 3000; // 输出预留 1500 + 格式开销 ~500，扣去后可用输入约 3000

  // 先构建 header
  let header = `你是一位资深的A股投资策略分析师。请基于以下 ${date} 的股池分析数据，生成一份每日投资综述。

## 格式要求
- 语言：中文
- 风格：专业、简洁、客观
- 字数：800-1200字

## 内容要求
1. **市场概况**：今日各股池整体表现，看多/看空比例分析
2. **重点个股点评**：选出看多和看空信号最明确的各 2-3 只股票，简要说明理由
3. **风险提示**：需要特别关注的风险点和不确定因素
4. **综合研判**：对明日市场的简要展望和策略建议

## 股池数据
`;

  const footer = '\n请直接输出综述内容，不要输出 JSON。';
  const headerTokens = estimateTokens(header + footer);
  const stockBudget = Math.max(200, MAX_INPUT_TOKENS - headerTokens);
  const totalStocks = pools.reduce((a, p) => a + p.stocks.length, 0);
  const budgetPerStock = totalStocks > 0 ? Math.floor(stockBudget / totalStocks) : stockBudget;

  // 截断辅助：保留开头核心内容，截断到指定 token 预算
  function truncateToBudget(text: string, budget: number): string {
    if (!text || budget <= 0) return '';
    // 先取前 budget*2 字符（中文约 2 字符/token），保证不超
    const maxLen = Math.max(20, budget * 2);
    if (estimateTokens(text) <= budget) return text;
    // 尝试截断到句子边界
    const truncated = text.slice(0, maxLen);
    const lastPeriod = Math.max(truncated.lastIndexOf('。'), truncated.lastIndexOf('.'));
    if (lastPeriod > maxLen * 0.5) return truncated.slice(0, lastPeriod + 1);
    return truncated;
  }

  let poolSections = '';
  for (const p of pools) {
    poolSections += `\n## 股池: ${p.poolName}\n`;
    poolSections += `看多: ${p.bullish} | 看空: ${p.bearish} | 中性: ${p.neutral}\n\n`;

    for (const s of p.stocks) {
      const signalLabel = s.signal === 1 ? '📈看多' : s.signal === -1 ? '📉看空' : '➖中性';
      poolSections += `- ${s.code} ${s.name} (${s.currentPrice}) [${signalLabel}]\n`;

      // 每只股票 summary 和 finalSummary 共享 budgetPerStock
      const summaryBudget = Math.floor(budgetPerStock * 0.6);
      const finalBudget = budgetPerStock - summaryBudget;
      poolSections += `  分析摘要: ${truncateToBudget(s.summary, Math.max(10, summaryBudget))}\n`;
      if (s.finalSummary) {
        poolSections += `  综合结论: ${truncateToBudget(s.finalSummary, Math.max(10, finalBudget))}\n`;
      }
    }
  }

  return `${header}${poolSections}${footer}`;
}

/**
 * 格式化并打印每日综述到控制台。
 * 由 CLI 和流水线 Hook 调用，不嵌入在 generateDailySummary 内部。
 */
export function printDailySummary(summary: DailySummary): void {
  const sep = '='.repeat(60);
  const bullish = summary.overall.totalBullish;
  const bearish = summary.overall.totalBearish;
  const neutral = summary.overall.totalNeutral;
  console.log(`\n${sep}`);
  console.log(`  📋 每日综合股池综述 — ${summary.date}`);
  console.log(sep);
  console.log(`  总览: ${summary.overall.totalStocks} 只股票 | 📈${bullish} | 📉${bearish} | ➖${neutral}`);
  for (const p of summary.pools) {
    console.log(`  [${p.poolName}] ${p.stocks.length} 只 | 📈${p.bullish} 📉${p.bearish} ➖${p.neutral}`);
  }
  console.log(sep);
  console.log(summary.llmSummary);
  console.log(`${sep}\n`);
}

// ─── 生成综述 ─────────────────────────────────────────────────────

/**
 * 生成每日综合股池综述。
 *
 * @param date - 目标日期（默认今天），格式 yyyy-MM-dd
 * @param pipelineTriggered - 是否由流水线自动触发
 * @returns 生成的 DailySummary 对象
 */
export async function generateDailySummary(
  date?: string,
  pipelineTriggered = false,
): Promise<DailySummary> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  // 1. 收集数据
  const pools = await collectPoolData(targetDate);

  const totalStocks = pools.reduce((acc, p) => acc + p.stocks.length, 0);
  const totalBullish = pools.reduce((acc, p) => acc + p.bullish, 0);
  const totalBearish = pools.reduce((acc, p) => acc + p.bearish, 0);
  const totalNeutral = totalStocks - totalBullish - totalBearish;

  // 2. 如果没有数据，返回基本结构
  if (totalStocks === 0) {
    return {
      date: targetDate,
      pools,
      overall: { totalStocks, totalBullish, totalBearish, totalNeutral },
      llmSummary: '暂无股池数据，请先添加股票并运行流水线。',
      pipelineTriggered,
    };
  }

  // 3. 调用 LLM 生成综述
  const prompt = buildDailySummaryPrompt(pools, targetDate);
  const sid = sessionService.createSession();
  sessionService.appendMessage(sid, 'system', prompt);

  let llmSummary: string;
  try {
    llmSummary = await llmService.chatCompletion({
      messages: sessionService.getSession(sid)?.messages ?? [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.5,
      sessionId: sid,
    });
    sessionService.appendMessage(sid, 'assistant', llmSummary);
  } catch (err) {
    llmSummary = `LLM 调用失败: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[daily-summary] LLM 调用失败:', llmSummary);
    // 保持 session 状态完整
    sessionService.appendMessage(sid, 'assistant', llmSummary);
  }

  return {
    date: targetDate,
    pools,
    overall: { totalStocks, totalBullish, totalBearish, totalNeutral },
    llmSummary,
    pipelineTriggered,
  };
}
