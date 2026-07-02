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
import { generateDailySummaryV2, printDailySummaryV2 } from '../services/daily-summary-v2.js';

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
 * 列出所有股池（供 CLI --all 使用）。
 *
 * @returns 股池列表（含 id / name）
 */
export async function listAllPools() {
  return poolService.listPools();
}

/**
 * 对指定股池中所有股票运行完整流水线（支持多池串行执行）。
 *
 * @param poolIds - 股池 ID 或 ID 数组
 * @param force   - 可选，true 则强制重新执行，默认 false
 * @returns { success: true, data: { total: number } }
 *
 * @example
 * // 单池
 * await runPoolFullPipeline(1);
 * // 多池串行
 * await runPoolFullPipeline([1, 2, 3]);
 */
export async function runPoolFullPipeline(poolIds: number | number[], force?: boolean) {
  try {
    const ids = Array.isArray(poolIds) ? poolIds : [poolIds];
    let completed = 0;

    for (const pid of ids) {
      const stocks = await poolService.getPoolStocks(pid);
      if (stocks.length === 0) {
        console.log(`[runPoolFullPipeline] 股池 ${pid} 无股票，跳过`);
        continue;
      }
      console.log(`[runPoolFullPipeline] 开始股池 ${pid} (${stocks.length} 只股票)`);

      for (const s of stocks) {
        try {
          await pipelineService.runFullPipeline(s.code, force);
          completed++;
        } catch (err) {
          console.warn(`[runPoolFullPipeline] ${s.code} 失败:`, (err as Error).message);
        }
      }
      console.log(`[runPoolFullPipeline] 股池 ${pid} 完成`);
    }

    // 自动触发每日综述 v2（仅当有股票成功完成时）
    if (completed > 0) {
      try {
        const summary = await generateDailySummaryV2(undefined);
        printDailySummaryV2(summary);
      } catch (err) {
        console.warn(`[runPoolFullPipeline] 生成每日综述失败:`, (err as Error).message);
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

/**
 * 停止指定流水线。
 *
 * @param pipelineId - 流水线 ID（由 runFullPipeline 返回）
 * @returns { success: true, data: { cancelled: boolean } }
 */
export async function stopPipeline(pipelineId: string) {
  const cancelled = pipelineService.cancelPipeline(pipelineId);
  return { success: true as const, data: { cancelled } };
}

/**
 * 列出所有运行中的流水线。
 *
 * @returns 流水线 ID 列表
 */
export async function listPipelines() {
  return pipelineService.listRunningPipelines();
}
