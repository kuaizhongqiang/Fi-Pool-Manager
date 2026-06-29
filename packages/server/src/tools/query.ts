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
import { dailyAnalysisReport, finalReport, stock, pool } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
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
  const poolCount = db.select({ count: sql<number>`count(*)` }).from(pool).get()?.count ?? 0;

  // 获取最新行情更新时间
  const latestDaily = db
    .select({ maxDate: sql<string>`max(${dailyAnalysisReport.date})` })
    .from(dailyAnalysisReport)
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
