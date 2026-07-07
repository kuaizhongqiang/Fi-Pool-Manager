/**
 * 查询类工具（Query）
 *
 * 封装面向用户的数据查询操作，直接返回数据而不包装在 data 中。
 *
 * @module tools/query
 */

import * as poolService from '../services/pool.js';
import * as stockService from '../services/stock.js';
import * as dailyInfoService from '../services/daily-info.js';
import * as llmService from '../services/llm.js';
import { getDatabase, getDbPath } from '../db/index.js';
import {
  dailyAnalysisReport,
  finalReport,
  dailySummary,
  dailySummaryDetail,
  dailyInfo,
  stock,
  pool as poolTable,
} from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { VERSION } from '../index.js';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

/**
 * 列出所有股池，附带每个股池中的股票数量。
 *
 * @returns 股池列表，每个元素包含 pool 全部字段和 stockCount
 *
 * @example
 * const pools = await listPools();
 * pools.forEach(p => console.log(p.name, p.stockCount));
 */
export async function listPools() {
  return poolService.listPools();
}

/**
 * 查询指定股池中的所有股票详情。
 *
 * 返回包含股票代码、名称、当前价格以及加入时间的列表。
 *
 * @param poolId - 股池 ID
 * @returns 股池中的股票列表
 *
 * @example
 * const stocks = await getPoolStocks(1);
 * stocks.forEach(s => console.log(s.code, s.name));
 */
export async function getPoolStocks(poolId: number) {
  return poolService.getPoolStocks(poolId);
}

/**
 * 查询股票基本信息。
 *
 * @param code - 六位股票代码（如 '600519'）
 * @returns 股票对象，未找到时返回 null
 *
 * @example
 * const info = await getStockInfo('600519');
 * if (info) console.log(info.name, info.currentPrice);
 */
export async function getStockInfo(code: string) {
  return stockService.getStockByCode(code);
}

/**
 * 查询指定股票的日行情数据。
 *
 * 可选的日期范围过滤。
 *
 * @param code - 股票代码
 * @param startDate - 可选起始日期 'yyyy-MM-dd'（含），不指定则不限制起始
 * @param endDate - 可选结束日期 'yyyy-MM-dd'（含），不指定则不限制结束
 * @returns 日行情数据数组（按日期升序）
 *
 * @example
 * const data = await getDailyInfo('600519', '2024-05-01', '2024-06-01');
 */
export async function getDailyInfo(code: string, startDate?: string, endDate?: string) {
  return dailyInfoService.getDailyInfo(code, startDate, endDate);
}

/**
 * 查询指定股票指定日期的客观分析报告。
 *
 * @param code - 股票代码
 * @param date - 报告日期 'yyyy-MM-dd'
 * @param mode - 输出模式：
 *   - 'overview'：仅返回 id, code, date, summary 等摘要字段
 *   - 'full'（默认）：返回完整报告字段（含 indicators, signals 等）
 * @returns 分析报告对象，未找到时返回 null
 *
 * @example
 * const report = await getAnalysisReport('600519', '2024-06-01', 'overview');
 */
export async function getAnalysisReport(code: string, date: string, mode: 'overview' | 'full' = 'full') {
  const db = getDatabase();
  const row = db
    .select()
    .from(dailyAnalysisReport)
    .where(
      and(
        eq(dailyAnalysisReport.code, code),
        eq(dailyAnalysisReport.date, date),
      ),
    )
    .get();

  if (!row) return null;

  if (mode === 'overview') {
    return {
      id: row.id,
      code: row.code,
      date: row.date,
      summary: row.summary,
      createdAt: row.createdAt,
    };
  }

  return row;
}

/**
 * 查询指定股票指定日期的最终报告。
 *
 * @param code - 股票代码
 * @param date - 报告日期 'yyyy-MM-dd'
 * @param mode - 输出模式：
 *   - 'overview'：仅返回 id, code, date, summary, pipelineId 等摘要字段
 *   - 'full'（默认）：返回完整报告字段（含 fullReport, roleSummary 等）
 * @returns 最终报告对象，未找到时返回 null
 *
 * @example
 * const report = await getFinalReport('600519', '2024-06-01', 'full');
 */
export async function getFinalReport(code: string, date: string, mode: 'overview' | 'full' = 'full') {
  const db = getDatabase();
  const row = db
    .select()
    .from(finalReport)
    .where(
      and(
        eq(finalReport.code, code),
        eq(finalReport.date, date),
      ),
    )
    .get();

  if (!row) return null;

  if (mode === 'overview') {
    return {
      id: row.id,
      code: row.code,
      date: row.date,
      summary: row.summary,
      pipelineId: row.pipelineId,
      createdAt: row.createdAt,
    };
  }

  return row;
}

/**
 * 检查某日期的数据完成度——各池的 final_report 覆盖情况。
 *
 * 返回每个股池中已有 final_report 和缺失的股票数量，
 * 以及 anomalyScore 的分布概览。
 *
 * @param date - 目标日期 yyyy-MM-dd（默认今天）
 * @returns 数据完成度报告
 *
 * @example
 * const report = await checkDataCompleteness('2026-07-07');
 * console.log(report.pools);
 */
export async function checkDataCompleteness(date?: string) {
  const db = getDatabase();
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  // 1. 获取所有股池
  const pools = await poolService.listPools();

  // 2. 获取该日期所有 final_report
  const allReports = db
    .select({ code: finalReport.code, anomalyScore: finalReport.anomalyScore })
    .from(finalReport)
    .where(eq(finalReport.date, targetDate))
    .all();

  const reportCodes = new Set(allReports.map((r) => r.code));
  const anomalyScores = allReports.map((r) => r.anomalyScore);

  // 3. 按股池统计
  const poolStats = await Promise.all(
    pools.map(async (p) => {
      const stocks = await poolService.getPoolStocks(p.id);
      const withReport = stocks.filter((s) => reportCodes.has(s.code));
      const withoutReport = stocks.filter((s) => !reportCodes.has(s.code));
      return {
        poolId: p.id,
        poolName: p.name,
        totalStocks: stocks.length,
        withReport: withReport.length,
        withoutReport: withoutReport.length,
        pendingStocks: withoutReport.map((s) => s.code),
      };
    }),
  );

  // 4. 汇总
  const totalWithReport = allReports.length;
  const scoreStats =
    anomalyScores.length > 0
      ? {
          min: Math.min(...anomalyScores).toFixed(1),
          max: Math.max(...anomalyScores).toFixed(1),
          avg: (anomalyScores.reduce((a, b) => a + b, 0) / anomalyScores.length).toFixed(1),
          aboveThreshold: anomalyScores.filter((s) => s >= 2.5).length,
        }
      : { min: 'N/A', max: 'N/A', avg: 'N/A', aboveThreshold: 0 };

  return {
    date: targetDate,
    totalStocksInPools: poolStats.reduce((sum, p) => sum + p.totalStocks, 0),
    totalFinalReports: totalWithReport,
    scoreDistribution: scoreStats,
    pools: poolStats,
  };
}

/**
 * 查看指定股池的分析进度——各股票在指定日期的 final_report 状态。
 *
 * @param poolId - 股池 ID
 * @param date   - 目标日期 yyyy-MM-dd（默认今天）
 * @returns 股池分析状态
 *
 * @example
 * const status = await getPoolAnalysisStatus(1);
 * status.stocks.forEach(s => console.log(s.code, s.hasReport, s.anomalyScore));
 */
export async function getPoolAnalysisStatus(poolId: number, date?: string) {
  const db = getDatabase();
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const stocks = await poolService.getPoolStocks(poolId);
  const poolInfo = await poolService.getPoolById(poolId);

  // 批量查询 final_report
  const reports = db
    .select()
    .from(finalReport)
    .where(
      and(
        eq(finalReport.date, targetDate),
        sql`${finalReport.code} IN (${sql.join(stocks.map((s) => sql`${s.code}`), sql`,`)})`,
      ),
    )
    .all();

  const reportMap = new Map(reports.map((r) => [r.code, r]));

  const stockStatus = stocks.map((s) => {
    const r = reportMap.get(s.code);
    return {
      code: s.code,
      name: s.name,
      hasReport: !!r,
      anomalyScore: r?.anomalyScore ?? null,
      pipelineId: r?.pipelineId ?? null,
      summary: r?.summary?.slice(0, 100) ?? null,
    };
  });

  return {
    poolId,
    poolName: poolInfo?.name ?? `Pool #${poolId}`,
    date: targetDate,
    totalStocks: stocks.length,
    completedStocks: stockStatus.filter((s) => s.hasReport).length,
    pendingStocks: stockStatus.filter((s) => !s.hasReport).length,
    stocks: stockStatus,
  };
}

/**
 * 查看某日 daily-summary 的执行状态。
 *
 * 返回当日 daily_summary 记录、异常股票数、
 * 各维度分析明细的数据分布。
 *
 * @param date - 目标日期 yyyy-MM-dd（默认今天）
 * @returns daily-summary 状态
 *
 * @example
 * const status = await getDailySummaryStatus('2026-07-07');
 * console.log(status.dimensions);
 */
export async function getDailySummaryStatus(date?: string) {
  const db = getDatabase();
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  // 1. 查询 daily_summary
  const summary = db
    .select()
    .from(dailySummary)
    .where(eq(dailySummary.date, targetDate))
    .get();

  // 2. 查询 daily_summary_detail
  const details = db
    .select()
    .from(dailySummaryDetail)
    .where(eq(dailySummaryDetail.date, targetDate))
    .all();

  // 3. 按维度分组
  const byDimension: Record<string, number> = {};
  for (const d of details) {
    byDimension[d.dimension] = (byDimension[d.dimension] ?? 0) + 1;
  }

  // 4. 按股票分组
  const byStock = new Map<string, { dimensions: string[]; maxScore: number }>();
  for (const d of details) {
    const existing = byStock.get(d.stockCode) ?? { dimensions: [], maxScore: 0 };
    existing.dimensions.push(d.dimension);
    existing.maxScore = Math.max(existing.maxScore, d.anomalyScore);
    byStock.set(d.stockCode, existing);
  }

  return {
    date: targetDate,
    hasSummary: !!summary,
    summaryRecord: summary
      ? {
          anomalyCount: summary.anomalyCount,
          totalStocks: summary.totalStocks,
          modelUsed: summary.modelUsed,
          overviewLength: summary.overview.length,
          fullReportLength: summary.fullReport.length,
          createdAt: summary.createdAt,
        }
      : null,
    detailCount: details.length,
    stockCountInDetail: byStock.size,
    byDimension,
    stocks: [...byStock.entries()].map(([code, info]) => ({
      code,
      dimensions: info.dimensions,
      maxScore: info.maxScore,
    })),
  };
}

/**
 * 查看系统运行状态。
 *
 * 收集版本号、数据库大小、股票/股池数量、最新数据时间、
 * LLM 连接状态及服务运行时长等信息。
 *
 * @returns 系统状态对象
 *
 * @example
 * const status = await getSystemStatus();
 * console.log(status.version, status.llmConnected);
 */
export async function getSystemStatus() {
  const db = getDatabase();

  // 统计股票数量
  const stockCount = db.select({ count: sql<number>`count(*)` }).from(stock).get()?.count ?? 0;

  // 统计股池数量
  const poolCount = db.select({ count: sql<number>`count(*)` }).from(poolTable).get()?.count ?? 0;

  // 获取最新行情更新时间（从 daily_info 获取真实数据日期）
  const latestDaily = db
    .select({ maxDate: sql<string>`max(${dailyInfo.date})` })
    .from(dailyInfo)
    .get();

  // 数据库文件大小
  let dbSize = '未知';
  try {
    const dbPath = resolve(getDbPath());
    if (existsSync(dbPath)) {
      const bytes = statSync(dbPath).size;
      dbSize = bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  } catch {
    // 忽略文件大小错误
  }

  // 检查 LLM 连接
  const llmConnected = await llmService.checkConnection().catch(() => false);

  return {
    version: VERSION,
    dbSize,
    stocksTracked: stockCount,
    poolsCount: poolCount,
    lastDataUpdate: latestDaily?.maxDate || '无数据',
    llmConnected,
    uptime: Math.floor(process.uptime()),
  };
}
