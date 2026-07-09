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
import { getDatabase } from '../db/index.js';
import { finalReport, pipelineRun } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── PID 文件锁（阻止并行 pipeline 实例）───────────────────────────

/**
 * 流水线锁文件路径。
 * 可通过 FI_POOL_LOCK_PATH 环境变量覆盖，默认在数据目录下。
 */
const LOCK_PATH = process.env.FI_POOL_LOCK_PATH || resolve(process.cwd(), 'data', '.pipeline.lock');

/**
 * 尝试获取流水线锁。
 *
 * 若锁文件存在且对应进程仍在运行，返回 false（拒绝启动）；
 * 若锁文件过期（进程不存在），清理后重新加锁。
 *
 * @returns true 表示成功加锁，false 表示已有实例在运行
 */
function acquirePipelineLock(): boolean {
  if (existsSync(LOCK_PATH)) {
    try {
      const content = readFileSync(LOCK_PATH, 'utf-8').trim();
      const pid = parseInt(content, 10);
      if (!isNaN(pid) && pid > 0) {
        try {
          // 检查进程是否存在（不发送信号，仅探活）
          process.kill(pid, 0);
          console.error(`[lock] 错误：已有流水线在运行 (PID: ${pid})，请等待完成或手动终止`);
          console.error(`[lock] 锁文件: ${LOCK_PATH}`);
          return false;
        } catch {
          // 进程不存在 → 过期锁，清理
          console.warn(`[lock] 清理过期锁 (PID: ${pid} 不存在)`);
        }
      }
    } catch {
      // 锁文件损坏，忽略并覆写
      console.warn('[lock] 锁文件损坏，将重新创建');
    }
  }

  // 写入自己的 PID
  try {
    writeFileSync(LOCK_PATH, String(process.pid), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[lock] 无法写入锁文件: ${LOCK_PATH}`, (err as Error).message);
    return true; // 锁失败不应阻止流水线运行（降级）
  }
}

/**
 * 释放流水线锁。
 */
function releasePipelineLock(): void {
  try {
    if (existsSync(LOCK_PATH)) {
      const content = readFileSync(LOCK_PATH, 'utf-8').trim();
      if (content === String(process.pid)) {
        unlinkSync(LOCK_PATH);
      }
      // 如果 PID 不匹配（其他进程覆写了），不删除
    }
  } catch {
    // 清理失败忽略
  }
}

// ─────────────────────────────────────────────────────────────────

/**
 * 获取今日日期字符串（北京时间，yyyy-MM-dd 格式）。
 */
function getTodayDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 生成流水线运行 ID（pool-run 级别）。
 */
function generatePoolRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 6);
  return `pool-run-${ts}-${rand}`;
}

/**
 * 格式化秒数为可读时长（如 "2分30秒" / "1小时5分"）。
 */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) return `${minutes}分${seconds}秒`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}小时${remainMin}分`;
}

/**
 * 检查某股票在指定日期是否有已完成的 final_report。
 * 用于断点重开：按目标日期精确匹配。
 *
 * @param code - 股票代码
 * @param date - 目标日期 yyyy-MM-dd
 * @returns 匹配的 final_report 的 date 和 id，或 null
 */
function checkExistingFinalReport(code: string, date: string): { date: string; id: number } | null {
  const db = getDatabase();
  const row = db
    .select({ id: finalReport.id, date: finalReport.date })
    .from(finalReport)
    .where(and(eq(finalReport.code, code), eq(finalReport.date, date)))
    .limit(1)
    .get();
  return row ?? null;
}

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
 * 支持断点重开（Checkpoint/Resume）双层策略：
 *
 * 第 1 层（预检，execute.ts）：
 * - 在 runPoolFullPipeline 中用 getTodayDate() 做快速预检
 * - 用今天日期匹配 final_report，匹配则跳过（最常用的场景）
 *
 * 第 2 层（精检，pipeline.ts）：
 * - Pipeline.runFull() 内 Stage 1 获取到真实最新交易日后
 * - 用真实日期再次检查 final_report
 * - 解决周末/假期中 getTodayDate() 与交易日不一致的问题
 *
 * 两层结合确保：
 * - 非 --force 模式下，已完成的股票不会触发 LLM 调用
 * - 中断后重新执行，已完成的股票自动跳过
 * - force=true 强制全量重跑（跳过所有缓存检查）
 *
 * @param poolIds - 股池 ID 或 ID 数组
 * @param force   - 可选，true 则强制重新执行（跳过缓存检查），默认 false
 * @param missing - 可选，true 则仅补跑今日未完成的股票，自动跳过已有 final_report 的
 * @returns { success: true, data: { total: number, skipped: number } }
 *
 * @example
 * // 单池
 * await runPoolFullPipeline(1);
 * // 多池串行
 * await runPoolFullPipeline([1, 2, 3]);
 * // 强制重跑
 * await runPoolFullPipeline([1, 2], true);
 * // 补跑未完成
 * await runPoolFullPipeline(undefined, false, true);
 */
export async function runPoolFullPipeline(poolIds?: number | number[], force?: boolean, missing?: boolean) {
  // ── PID 文件锁：阻止并行实例 ──
  if (!acquirePipelineLock()) {
    return {
      success: false as const,
      error: { code: 'LOCK_ERROR', message: '已有流水线在运行，请等待完成或手动终止' },
    };
  }

  const startTime = Date.now();
  const runId = generatePoolRunId();
  const targetDate = getTodayDate();
  const db = getDatabase();

  // --missing 模式无 poolIds 时自动检测所有股池
  if (missing && (!poolIds || (Array.isArray(poolIds) && poolIds.length === 0))) {
    const pools = await poolService.listPools();
    poolIds = pools.map(p => p.id);
  }

  const ids = poolIds && Array.isArray(poolIds) ? poolIds : (poolIds ? [poolIds] : []);
  const argsSnapshot = process.argv.slice(2).join(' ') || '';

  // 插入 pipeline_run 记录
  const modeLabel = missing ? 'missing' : force ? 'force' : 'full';
  db.insert(pipelineRun).values({
    runId,
    date: targetDate,
    mode: modeLabel,
    poolIds: JSON.stringify(ids),
    totalStocks: 0,
    args: argsSnapshot,
  }).run();

  let totalCompleted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let poolTotalStocks = 0;

  // 更新 pipeline_run 记录
  function updateRunStatus(status: string, extra?: Record<string, unknown>) {
    try {
      db.update(pipelineRun)
        .set({
          status,
          completedStocks: totalCompleted,
          failedStocks: totalFailed,
          skippedStocks: totalSkipped,
          totalStocks: poolTotalStocks,
          durationSeconds: (Date.now() - startTime) / 1000,
          finishedAt: sql`datetime('now')`,
          ...extra,
        })
        .where(eq(pipelineRun.runId, runId))
        .run();
    } catch {
      // 更新失败不影响主流程
    }
  }

  try {
    for (const pid of ids) {
      const stocks = await poolService.getPoolStocks(pid);
      if (stocks.length === 0) {
        console.log(`[runPoolFullPipeline] 股池 ${pid} 无股票，跳过`);
        continue;
      }
      poolTotalStocks += stocks.length;

      // --missing / 非 force 模式：预检已完成的股票，只跑未完成的
      const pendingStocks: typeof stocks = [];
      let poolSkipped = 0;

      if (missing || !force) {
        for (const s of stocks) {
          const existing = checkExistingFinalReport(s.code, targetDate);
          if (existing) {
            poolSkipped++;
            totalSkipped++;
          } else {
            pendingStocks.push(s);
          }
        }
        const poolMsg = `股池 ${pid} (${stocks.length} 只中已完成 ${poolSkipped} 只，待执行 ${pendingStocks.length} 只)`;
        if (pendingStocks.length === 0) {
          console.log(`[runPoolFullPipeline] ${poolMsg} → 全部完成，跳过`);
          continue;
        }
        console.log(`[runPoolFullPipeline] 开始 ${poolMsg}`);
      } else {
        // force 模式：全部重跑
        pendingStocks.push(...stocks);
        console.log(`[runPoolFullPipeline] 开始股池 ${pid} (${stocks.length} 只，强制重跑)`);
      }

      // ETA 统计
      let poolDuration = 0;
      let poolProcessed = 0;

      for (let i = 0; i < pendingStocks.length; i++) {
        const s = pendingStocks[i];
        const stockStart = Date.now();
        const progress = force
          ? `[${i + 1}/${pendingStocks.length}]`
          : `[${totalCompleted + 1}/${poolTotalStocks}]`;

        // force 模式仍要过 checkpoint（由 pipeline.runFull 内二次检查决定是否跳过）
        try {
          await pipelineService.runFullPipeline(s.code, !!force);
          totalCompleted++;
          const elapsed = (Date.now() - stockStart) / 1000;
          poolDuration += elapsed;
          poolProcessed++;
          console.log(`[runPoolFullPipeline] ${progress} ${s.code} ${s.name} 完成 ✓`);

          // ETA 估算（#141）：有足够样本后显示
          if (poolProcessed >= 3) {
            const avgSec = poolDuration / poolProcessed;
            const remaining = pendingStocks.length - i - 1;
            const etaSec = avgSec * remaining;
            const now = new Date();
            const etaTime = new Date(now.getTime() + etaSec * 1000);
            const etaStr = `${String(etaTime.getHours()).padStart(2, '0')}:${String(etaTime.getMinutes()).padStart(2, '0')}`;
            console.log(`  ⏱ 平均 ${avgSec.toFixed(0)}s/只，预计剩余 ${formatDuration(etaSec)}（~${etaStr} 完成）`);
          }
        } catch (err) {
          totalFailed++;
          console.warn(`[runPoolFullPipeline] ${progress} ${s.code} 失败:`, (err as Error).message);
        }
      }
    }

    // ── #76：自动触发每日综述 v2（仅当有股票成功完成时） ──
    if (totalCompleted > 0) {
      try {
        console.log(`[runPoolFullPipeline] 流水线完成，自动生成每日综述...`);
        const summary = await generateDailySummaryV2(undefined);
        printDailySummaryV2(summary);
      } catch (err) {
        console.warn(`[runPoolFullPipeline] 生成每日综述失败:`, (err as Error).message);
      }
    }

    const totalDuration = (Date.now() - startTime) / 1000;
    const completedInfo = `新执行 ${totalCompleted} 只，跳过 ${totalSkipped} 只，失败 ${totalFailed} 只`;
    console.log(`[runPoolFullPipeline] 全线完成！${completedInfo}，总耗时 ${formatDuration(totalDuration)}`);

    updateRunStatus('completed');
    return { success: true as const, data: { total: totalCompleted, skipped: totalSkipped, failed: totalFailed } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateRunStatus('crashed');
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  } finally {
    releasePipelineLock();
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
