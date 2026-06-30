/**
 * 数据新鲜度检查工具
 *
 * 在刷新数据和流水线执行时检测行情数据是否陈旧，
 * 避免静默使用超过 N 个交易日的旧数据进行分析。
 *
 * @module utils/data-freshness
 */

/** 默认陈旧阈值（天），超过此天数视为数据可能已不可用 */
const DEFAULT_STALE_THRESHOLD_DAYS = 10;

/**
 * 检查最新交易日数据是否陈旧，如果陈旧则打印警告。
 *
 * @param code      - 股票代码
 * @param latestDate - 最新交易日期（yyyy-MM-dd）
 * @param context    - 调用上下文标识（如 "refresh", "pipeline"）
 * @param threshold  - 阈值天数，默认 10
 * @returns 是否陈旧（超过阈值）
 *
 * @example
 * checkDataFreshness('601989', '2025-08-12', 'refresh');
 * // => true, 输出: ⚠ [601989][refresh] 数据可能已陈旧: ...
 */
export function checkDataFreshness(
  code: string,
  latestDate: string,
  context: string,
  threshold = DEFAULT_STALE_THRESHOLD_DAYS,
): boolean {
  const today = new Date();
  const latestDt = new Date(latestDate);
  const daysDiff = Math.round((today.getTime() - latestDt.getTime()) / 86400000);

  if (daysDiff > threshold) {
    console.warn(
      `  ⚠ [${code}][${context}] 数据可能已陈旧: 最新交易日 ${latestDate}，距今 ${daysDiff} 天。`,
      `股票可能已停牌或数据源未更新。`,
    );
    return true;
  }

  return false;
}
