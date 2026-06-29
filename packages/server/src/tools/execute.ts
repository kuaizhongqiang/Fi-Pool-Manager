/**
 * 执行类工具（Execute）
 *
 * 封装流水线执行操作，返回执行确认信息。
 * 执行进度可通过 getSystemStatus 查看。
 *
 * @module tools/execute
 */

import * as pipelineService from '../services/pipeline.js';
import * as dailyInfoService from '../services/daily-info.js';
import * as poolService from '../services/pool.js';

/**
 * 对单只股票运行本地分析（数据获取 + 技术指标计算 + 客观报告）。
 *
 * @param code  - 股票代码
 * @param force - 可选，true 则强制重新执行（跳过缓存检查）
 * @returns { success: true, data: { date: string } }
 */
export async function runLocalAnalysis(code: string, force?: boolean) {
  try {
    const result = await pipelineService.runLocalAnalysis(code, force);
    return { success: true as const, data: { date: result.date } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'LLM_ERROR', message } };
  }
}

/**
 * 对单只股票运行完整流水线。
 *
 * @param code  - 股票代码
 * @param force - 可选，true 则强制重新执行
 * @returns { success: true, data: { date: string } }
 */
export async function runFullPipeline(code: string, force?: boolean) {
  try {
    const result = await pipelineService.runFullPipeline(code, force);
    return { success: true as const, data: { date: result.date } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'LLM_ERROR', message } };
  }
}

/**
 * 对指定股池中所有股票运行本地分析。
 *
 * @param poolId - 股池 ID
 * @param force  - 可选，true 则强制重新执行
 * @returns { success: true, data: { total: number } }
 */
export async function runPoolAnalysis(poolId: number, force?: boolean) {
  try {
    const stocks = await poolService.getPoolStocks(poolId);
    let completed = 0;
    for (const s of stocks) {
      try {
        await pipelineService.runLocalAnalysis(s.code, force);
        completed++;
      } catch (err) {
        console.warn(`[runPoolAnalysis] ${s.code} 失败:`, (err as Error).message);
      }
    }
    return { success: true as const, data: { total: completed } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 对指定股池中所有股票运行完整流水线。
 *
 * @param poolId - 股池 ID
 * @param force  - 可选，true 则强制重新执行
 * @returns { success: true, data: { total: number } }
 */
export async function runPoolFullPipeline(poolId: number, force?: boolean) {
  try {
    const stocks = await poolService.getPoolStocks(poolId);
    let completed = 0;
    for (const s of stocks) {
      try {
        await pipelineService.runFullPipeline(s.code, force);
        completed++;
      } catch (err) {
        console.warn(`[runPoolFullPipeline] ${s.code} 失败:`, (err as Error).message);
      }
    }
    return { success: true as const, data: { total: completed } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 触发获取最新日行情数据。
 *
 * @param code - 可选股票代码，不指定则更新所有关注股票
 * @returns { success: true, data: { updated: number } }
 */
export async function refreshData(code?: string) {
  try {
    const result = await dailyInfoService.refreshData(code);
    return { success: true as const, data: { updated: result.updated } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'RATE_LIMIT', message } };
  }
}
