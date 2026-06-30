/**
 * 异常偏移值计算工具
 *
 * 基于技术指标数据计算 anomaly_base 基础异常分，
 * LLM 在此基础上 ±1.0 微调得到最终 anomaly_score。
 *
 * @module utils/anomaly
 */

import type { Signals } from './signals.js';

/** daily_analysis_report.indicators 的 JSON 结构（与本模块相关的字段） */
interface IndicatorsSubset {
  priceChangePct: number;
}

/**
 * 计算 anomaly_base 基础异常分。
 *
 * 规则引擎：从价格、交易量、信号三个维度计算基础分，
 * 确保跨股票可比，减少 LLM 随意打分的偏差。
 *
 * 分数范围：1.0 ~ 4.0
 *
 * @param params.priceChangePct - 涨跌幅（如 -2.5 表示跌 2.5%）
 * @param params.signals        - 信号检测结果（含 volumeRatio、金叉死叉、超买超卖）
 * @returns 基础异常分（1.0 ~ 4.0）
 *
 * @example
 * ```typescript
 * const base = computeAnomalyBase({
 *   priceChangePct: 4.2,
 *   signals: { goldenCross: false, deadCross: false, overbought: true, oversold: false, volumeSpike: true, volumeRatio: 2.5 },
 * });
 * // base ≈ 1.0 + 0.42 + 0.5 + 0.5 = 2.42
 * ```
 */
export function computeAnomalyBase(params: {
  priceChangePct: number;
  signals: Signals;
}): number {
  const { priceChangePct, signals } = params;

  // 1. 价格异常分：涨跌幅 > 3% 或 < -3%
  const absChange = Math.abs(priceChangePct);
  const priceAnomaly = absChange > 3 ? Math.min(absChange / 10, 1.0) : 0;

  // 2. 交易量异常分：量比 > 2.0
  const volumeAnomaly = signals.volumeRatio > 2.0
    ? Math.min((signals.volumeRatio - 1) / 3, 1.0)
    : 0;

  // 3. 信号异常分：金叉/死叉 + 超买/超卖
  let signalAnomaly = 0;
  if (signals.goldenCross) signalAnomaly += 0.5;
  if (signals.deadCross) signalAnomaly += 0.5;
  if (signals.overbought) signalAnomaly += 0.5;
  if (signals.oversold) signalAnomaly += 0.5;

  // 总和限制在 1.0 ~ 4.0 范围
  const total = 1.0 + priceAnomaly + volumeAnomaly + signalAnomaly;
  return Math.min(Math.max(total, 1.0), 4.0);
}
