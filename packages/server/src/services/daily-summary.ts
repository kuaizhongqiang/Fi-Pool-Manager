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
import { pool, poolStock, stock, dailyAnalysisReport, sentimentReport, finalReport } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import * as llmService from './llm.js';
import * as sessionService from './session.js';

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
 */
async function collectPoolData(date: string): Promise<PoolSummaryData[]> {
  const db = getDatabase();
  const pools = db.select().from(pool).all();
  const results: PoolSummaryData[] = [];

  for (const p of pools) {
    const stockCodes = db
      .select({ code: poolStock.stockCode })
      .from(poolStock)
      .where(eq(poolStock.poolId, p.id))
      .all()
      .map((r) => r.code);

    const stockSignals: StockSignal[] = [];

    for (const code of stockCodes) {
      const stk = db.select().from(stock).where(eq(stock.code, code)).get();
      if (!stk) continue;

      // 取当日或最近的分析报告
      const analysis = db
        .select({
          summary: dailyAnalysisReport.summary,
          signals: dailyAnalysisReport.signals,
        })
        .from(dailyAnalysisReport)
        .where(
          and(
            eq(dailyAnalysisReport.code, code),
            sql`${dailyAnalysisReport.date} <= ${date}`,
          ),
        )
        .orderBy(desc(dailyAnalysisReport.date))
        .limit(1)
        .get();

      // 取当日或最近的最终报告 summary
      const final = db
        .select({ summary: finalReport.summary })
        .from(finalReport)
        .where(
          and(
            eq(finalReport.code, code),
            sql`${finalReport.date} <= ${date}`,
          ),
        )
        .orderBy(desc(finalReport.date))
        .limit(1)
        .get();

      let signal = 0;
      if (analysis?.signals) {
        try {
          const parsed = JSON.parse(analysis.signals);
          if (parsed.goldenCross) signal = 1;
          else if (parsed.deadCross) signal = -1;
        } catch { /* ignore */ }
      }

      stockSignals.push({
        code: stk.code,
        name: stk.name,
        currentPrice: stk.currentPrice,
        signal,
        summary: analysis?.summary?.slice(0, 300) ?? '无分析报告',
        finalSummary: final?.summary?.slice(0, 300),
      });
    }

    const bullish = stockSignals.filter((s) => s.signal === 1).length;
    const bearish = stockSignals.filter((s) => s.signal === -1).length;
    const neutral = stockSignals.length - bullish - bearish;

    results.push({
      poolId: p.id,
      poolName: p.name,
      stocks: stockSignals,
      bullish,
      bearish,
      neutral,
    });
  }

  return results;
}

/**
 * 构建 LLM 用的 prompt，将所有股池数据格式化为结构化文本。
 */
function buildDailySummaryPrompt(pools: PoolSummaryData[], date: string): string {
  let poolSections = '';

  for (const p of pools) {
    poolSections += `\n## 股池: ${p.poolName}\n`;
    poolSections += `看多: ${p.bullish} | 看空: ${p.bearish} | 中性: ${p.neutral}\n\n`;

    for (const s of p.stocks) {
      const signalLabel = s.signal === 1 ? '📈看多' : s.signal === -1 ? '📉看空' : '➖中性';
      poolSections += `- ${s.code} ${s.name} (${s.currentPrice}) [${signalLabel}]\n`;
      poolSections += `  分析摘要: ${s.summary}\n`;
      if (s.finalSummary) {
        poolSections += `  综合结论: ${s.finalSummary}\n`;
      }
    }
  }

  return `你是一位资深的A股投资策略分析师。请基于以下 ${date} 的股池分析数据，生成一份每日投资综述。

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
${poolSections}

请直接输出综述内容，不要输出 JSON。`;
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
  }

  // 4. 输出到控制台
  const separator = '='.repeat(60);
  console.log(`\n${separator}`);
  console.log(`  📋 每日综合股池综述 — ${targetDate}`);
  console.log(separator);
  console.log(`  总览: ${totalStocks} 只股票 | 📈${totalBullish} | 📉${totalBearish} | ➖${totalNeutral}`);
  for (const p of pools) {
    console.log(`  [${p.poolName}] ${p.stocks.length} 只 | 📈${p.bullish} 📉${p.bearish} ➖${p.neutral}`);
  }
  console.log(separator);
  console.log(llmSummary);
  console.log(`${separator}\n`);

  return {
    date: targetDate,
    pools,
    overall: { totalStocks, totalBullish, totalBearish, totalNeutral },
    llmSummary,
    pipelineTriggered,
  };
}
