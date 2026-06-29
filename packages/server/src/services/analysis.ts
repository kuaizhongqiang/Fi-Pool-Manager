/**
 * 技术分析与信号检测服务
 *
 * 将 utils/indicators 和 utils/signals 中的纯函数组合为
 * 面向流水线场景的高级分析接口。
 *
 * @module services/analysis
 */

import type { OHLCV } from '../utils/indicators.js';
import { calcMA, calcMACD, calcRSI, calcKDJ, calcBollinger, calcPriceChangePct, calcAmplitude } from '../utils/indicators.js';
import { detectSignals, type Signals } from '../utils/signals.js';

/**
 * 结构化技术指标。
 * 对应 daily_analysis_report.indicators 字段的 JSON 结构。
 */
export interface Indicators {
  priceChangePct: number;
  amplitude: number;
  ma: { ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null };
  macd: { dif: number | null; dea: number | null; histogram: number | null };
  rsi: { rsi6: number | null; rsi14: number | null };
  kdj: { k: number | null; d: number | null; j: number | null };
  bb: { upper: number | null; mid: number | null; lower: number | null };
}

/**
 * 对一组 OHLCV 数据计算完整的技术指标集合。
 *
 * @param data - OHLCV 日行情数组（按日期升序）
 * @returns 结构化指标对象，最新位置的有效值
 *
 * @example
 * const ind = computeIndicators(ohlcvData);
 * console.log(ind.ma.ma5, ind.rsi.rsi14);
 */
export function computeIndicators(data: OHLCV[]): Indicators {
  const lastIdx = data.length - 1;

  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const ma20 = calcMA(data, 20);
  const ma60 = calcMA(data, 60);

  const { dif, dea, histogram } = calcMACD(data);
  const rsi6 = calcRSI(data, 6);
  const rsi14 = calcRSI(data, 14);
  const { k, d, j } = calcKDJ(data);
  const { upper, mid, lower } = calcBollinger(data);

  return {
    priceChangePct: calcPriceChangePct(data, lastIdx),
    amplitude: calcAmplitude(data, lastIdx),
    ma: {
      ma5: ma5[lastIdx] ?? null,
      ma10: ma10[lastIdx] ?? null,
      ma20: ma20[lastIdx] ?? null,
      ma60: data.length >= 60 ? (ma60[lastIdx] ?? null) : null,
    },
    macd: {
      dif: dif[lastIdx] ?? null,
      dea: dea[lastIdx] ?? null,
      histogram: histogram[lastIdx] ?? null,
    },
    rsi: {
      rsi6: rsi6[lastIdx] ?? null,
      rsi14: rsi14[lastIdx] ?? null,
    },
    kdj: {
      k: k[lastIdx] ?? null,
      d: d[lastIdx] ?? null,
      j: j[lastIdx] ?? null,
    },
    bb: {
      upper: upper[lastIdx] ?? null,
      mid: mid[lastIdx] ?? null,
      lower: lower[lastIdx] ?? null,
    },
  };
}

/**
 * 检测技术信号。
 *
 * @param data        - OHLCV 数组
 * @returns 信号检测结果
 */
export function computeSignals(data: OHLCV[]): Signals {
  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const rsi14 = calcRSI(data, 14);

  return detectSignals(
    data,
    { ma5: ma5[ma5.length - 1] ?? null, ma10: ma10[ma10.length - 1] ?? null },
    rsi14[rsi14.length - 1] ?? null,
  );
}
