/**
 * 信号检测工具模块
 *
 * 基于技术指标识别买入/卖出信号。
 * 用于在流水线中生成每日分析报告的 signals 字段。
 *
 * @module signals
 */

import { calcMA, type OHLCV } from './indicators.js';

// ─── 类型定义 ─────────────────────────────────────────────────

/**
 * 信号检测结果
 *
 * 包含常见的技术信号标记和辅助数值，
 * 最终会被序列化为 JSON 存入 daily_analysis_report.signals 字段。
 */
export interface Signals {
  /** 金叉：MA5 上穿 MA10 */
  goldenCross: boolean;
  /** 死叉：MA5 下穿 MA10 */
  deadCross: boolean;
  /** 超买：RSI14 > 80 */
  overbought: boolean;
  /** 超卖：RSI14 < 20 */
  oversold: boolean;
  /** 放量：当日成交量 > 前 5 日均量 × 2 */
  volumeSpike: boolean;
  /** 量比：当日成交量 / 前 5 日均量 */
  volumeRatio: number;
}

// ─── 默认值 ───────────────────────────────────────────────────

/** 空信号结果（所有信号为 false，量比为 0） */
const EMPTY_SIGNALS: Signals = {
  goldenCross: false,
  deadCross: false,
  overbought: false,
  oversold: false,
  volumeSpike: false,
  volumeRatio: 0,
};

// ─── 信号检测 ─────────────────────────────────────────────────

/**
 * 检测技术信号
 *
 * 综合判断金叉/死叉、超买/超卖、放量等信号。
 *
 * 金叉/死叉判断逻辑：
 *   计算 MA5 和 MA10 完整序列，取最后一个有效值及其前一个值进行比较。
 *   金叉条件：前值 MA5 ≤ MA10 且 现值 MA5 > MA10
 *   死叉条件：前值 MA5 ≥ MA10 且 现值 MA5 < MA10
 *
 * 量比逻辑：
 *   取最后 5 个交易日（不含当日）成交量的平均值作为基准，
 *   量比 = 当日成交量 / 基准均量。
 *
 * @param data        - 完整 OHLCV 数组（按日期升序排列）
 * @param latestMA    - 当前最新的 MA5 与 MA10 值（由调用方预计算传入）
 * @param latestRSI14 - 当前最新的 RSI14 值（由调用方预计算传入）
 * @returns 信号检测结果
 *
 * @example
 * ```typescript
 * const ma5 = calcMA(data, 5);
 * const ma10 = calcMA(data, 10);
 * const rsi14 = calcRSI(data, 14);
 * const signals = detectSignals(
 *   data,
 *   { ma5: ma5[ma5.length - 1], ma10: ma10[ma10.length - 1] },
 *   rsi14[rsi14.length - 1]
 * );
 * ```
 */
export function detectSignals(
  data: OHLCV[],
  latestMA: { ma5: number | null; ma10: number | null },
  latestRSI14: number | null,
): Signals {
  if (data.length === 0) {
    return { ...EMPTY_SIGNALS };
  }

  return {
    goldenCross: detectGoldenCross(data),
    deadCross: detectDeadCross(data),
    overbought: latestRSI14 !== null && latestRSI14 > 80,
    oversold: latestRSI14 !== null && latestRSI14 < 20,
    volumeSpike: detectVolumeSpike(data),
    volumeRatio: calcVolumeRatio(data),
  };
}

// ─── 内部检测函数 ─────────────────────────────────────────────

/**
 * 从完整的 MA 序列中定位最后一个有效索引
 *
 * @param ma - 可能含 null 的 MA 数组
 * @returns 最后一个非 null 值的索引，如无有效值返回 -1
 */
function lastValidIndex(ma: (number | null)[]): number {
  for (let i = ma.length - 1; i >= 0; i--) {
    if (ma[i] !== null) return i;
  }
  return -1;
}

/**
 * 检测金叉：MA5 上穿 MA10
 *
 * 从 data 中重新计算 MA5 和 MA10 序列，
 * 判断最近一个有效位置是否发生上穿。
 *
 * @param data - OHLCV 数组
 * @returns 是否发生金叉
 */
function detectGoldenCross(data: OHLCV[]): boolean {
  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);

  const idx = lastValidIndex(ma5);
  if (idx < 1) return false;
  if (ma5[idx - 1] === null || ma10[idx - 1] === null || ma10[idx] === null) {
    return false;
  }

  // 金叉：前值 MA5 ≤ MA10，现值 MA5 > MA10
  return ma5[idx - 1]! <= ma10[idx - 1]! && ma5[idx]! > ma10[idx]!;
}

/**
 * 检测死叉：MA5 下穿 MA10
 *
 * @param data - OHLCV 数组
 * @returns 是否发生死叉
 */
function detectDeadCross(data: OHLCV[]): boolean {
  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);

  const idx = lastValidIndex(ma5);
  if (idx < 1) return false;
  if (ma5[idx - 1] === null || ma10[idx - 1] === null || ma10[idx] === null) {
    return false;
  }

  // 死叉：前值 MA5 ≥ MA10，现值 MA5 < MA10
  return ma5[idx - 1]! >= ma10[idx - 1]! && ma5[idx]! < ma10[idx]!;
}

/**
 * 检测放量信号
 *
 * 当日成交量 > 前 5 日均量 × 2。
 * 若数据不足 6 个交易日，返回 false。
 *
 * @param data - OHLCV 数组
 * @returns 是否放量
 */
function detectVolumeSpike(data: OHLCV[]): boolean {
  if (data.length < 6) return false;

  const currentVolume = data[data.length - 1].volume;
  const avgVolume = averageOfLastN(data, 5, data.length - 1);

  if (avgVolume <= 0) return false;

  return currentVolume > avgVolume * 2;
}

/**
 * 计算量比
 *
 * 量比 = 当日成交量 / 前 5 日均量。
 * 若数据不足 6 个交易日或均量为 0，返回 0。
 *
 * @param data - OHLCV 数组
 * @returns 量比值
 */
function calcVolumeRatio(data: OHLCV[]): number {
  if (data.length < 6) return 0;

  const currentVolume = data[data.length - 1].volume;
  const avgVolume = averageOfLastN(data, 5, data.length - 1);

  if (avgVolume <= 0) return 0;

  return currentVolume / avgVolume;
}

/**
 * 计算最近 N 个交易日的成交量平均值（排除指定索引）
 *
 * @param data           - OHLCV 数组
 * @param count          - 取多少天
 * @param excludeIndex   - 要排除的索引（通常是当天）
 * @returns 平均成交量
 */
function averageOfLastN(data: OHLCV[], count: number, excludeIndex: number): number {
  let sum = 0;
  let actualCount = 0;

  for (let i = excludeIndex - 1; i >= 0 && actualCount < count; i--) {
    sum += data[i].volume;
    actualCount++;
  }

  return actualCount > 0 ? sum / actualCount : 0;
}
