/**
 * 技术指标计算工具模块
 *
 * 提供 A 股常用的技术分析指标计算函数。
 * 所有函数接收 OHLCV 日行情数组，返回与输入等长的计算结果数组。
 * 数据不足时对应位置填充 null。
 *
 * @module indicators
 */

// ─── 类型定义 ─────────────────────────────────────────────────

/**
 * OHLCV 日行情数据点
 */
export interface OHLCV {
  /** 日期，格式 'yyyy-MM-dd' */
  date: string;
  /** 开盘价 */
  open: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 收盘价 */
  close: number;
  /** 成交量（股数） */
  volume: number;
}

// ─── 移动平均线 ───────────────────────────────────────────────

/**
 * 计算简单移动平均线（SMA）
 *
 * 公式：MA = (P₁ + P₂ + ... + Pₙ) / n
 * 前 n-1 个位置为 null（数据不足）。
 *
 * @param data   - OHLCV 数组
 * @param period - 计算周期（如 5、10、20）
 * @returns 长度与 data 相同的数组，每个元素为对应周期的 MA 值或 null
 *
 * @example
 * ```typescript
 * const ma5 = calcMA(dailyData, 5);
 * // ma5[4] 为第 1-5 天的平均值
 * ```
 */
export function calcMA(data: OHLCV[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  if (data.length < period || period <= 0) {
    return result;
  }

  // 滑动窗口求和，避免每次重新遍历
  let sum = 0;

  // 填充第一个窗口
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  result[period - 1] = sum / period;

  // 滑动窗口
  for (let i = period; i < data.length; i++) {
    sum += data[i].close - data[i - period].close;
    result[i] = sum / period;
  }

  return result;
}

/**
 * 计算指数移动平均线（EMA）
 *
 * 公式：
 *   multiplier = 2 / (n + 1)
 *   EMA₁ = SMA(前 n 个 close)
 *   EMAₜ = (closeₜ - EMAₜ₋₁) × multiplier + EMAₜ₋₁
 *
 * 前 n-1 个位置为 null（数据不足）。
 *
 * @param data   - OHLCV 数组
 * @param period - 计算周期（如 12、26）
 * @returns 长度与 data 相同的数组，每个元素为对应位置的 EMA 值或 null
 */
export function calcEMA(data: OHLCV[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  if (data.length < period || period <= 0) {
    return result;
  }

  const multiplier = 2 / (period + 1);

  // 初始 EMA = 第一个周期的 SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;

  // 递推计算后续 EMA
  for (let i = period; i < data.length; i++) {
    const ema = (data[i].close - prevEma) * multiplier + prevEma;
    result[i] = ema;
    prevEma = ema;
  }

  return result;
}

// ─── MACD ──────────────────────────────────────────────────────

/**
 * 从可空数组中提取有效值及其索引，计算 EMA
 *
 * 内部辅助函数，用于对 DIF 序列计算 DEA。
 *
 * @param values - 可能包含 null 的数值数组
 * @param period - EMA 周期
 * @returns 长度与 values 相同的 EMA 计算结果数组
 */
function emaOnNullable(values: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);

  // 收集所有非 null 值及其索引
  const valid: { value: number; index: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) {
      valid.push({ value: values[i]!, index: i });
    }
  }

  if (valid.length < period || period <= 0) {
    return result;
  }

  const multiplier = 2 / (period + 1);

  // 初始 EMA = 第一个周期的 SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += valid[i].value;
  }
  let prevEma = sum / period;
  result[valid[period - 1].index] = prevEma;

  // 递推计算后续 EMA
  for (let i = period; i < valid.length; i++) {
    const ema = (valid[i].value - prevEma) * multiplier + prevEma;
    result[valid[i].index] = ema;
    prevEma = ema;
  }

  return result;
}

/**
 * 计算 MACD 指标（指数平滑异同移动平均线）
 *
 * 标准参数 (12, 26, 9)：
 *   DIF = EMA₁₂(close) − EMA₂₆(close)
 *   DEA = EMA₉(DIF)
 *   Histogram = 2 × (DIF − DEA)
 *
 * @param data - OHLCV 数组
 * @returns 包含 DIF、DEA、Histogram 三个等长数组的对象
 *
 * @example
 * ```typescript
 * const { dif, dea, histogram } = calcMACD(dailyData);
 * // 最后一个值为最新信号
 * ```
 */
export function calcMACD(
  data: OHLCV[],
): { dif: (number | null)[]; dea: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);

  const length = data.length;
  const dif: (number | null)[] = new Array(length).fill(null);

  // DIF = EMA12 - EMA26（两者均非 null 时有效）
  for (let i = 0; i < length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      dif[i] = ema12[i]! - ema26[i]!;
    }
  }

  // DEA = EMA9(DIF)
  const dea = emaOnNullable(dif, 9);

  // Histogram = 2 * (DIF - DEA)
  const histogram: (number | null)[] = new Array(length).fill(null);
  for (let i = 0; i < length; i++) {
    if (dif[i] !== null && dea[i] !== null) {
      histogram[i] = 2 * (dif[i]! - dea[i]!);
    }
  }

  return { dif, dea, histogram };
}

// ─── RSI ──────────────────────────────────────────────────────

/**
 * 计算相对强弱指标（RSI）
 *
 * 使用 Wilder 平滑法（改良指数平均）：
 *   1. 计算每日价格变动 Δ = closeₜ − closeₜ₋₁
 *   2. 初始平均涨幅 = 前 n 个 Δ 中正值的平均值
 *      初始平均跌幅 = 前 n 个 Δ 中负值绝对值的平均值
 *   3. 后续平滑：
 *      avgGainₜ = (avgGainₜ₋₁ × (n−1) + gainₜ) / n
 *      avgLossₜ = (avgLossₜ₋₁ × (n−1) + lossₜ) / n
 *   4. RS = avgGain / avgLoss
 *      RSI = 100 − 100 / (1 + RS)
 *
 * 前 n 个位置为 null（需要 n+1 个价格才能计算第一个 RSI 值）。
 *
 * @param data   - OHLCV 数组
 * @param period - RSI 计算周期（通常为 14）
 * @returns 长度与 data 相同的 RSI 值数组
 *
 * @example
 * ```typescript
 * const rsi14 = calcRSI(dailyData, 14);
 * ```
 */
export function calcRSI(data: OHLCV[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  if (data.length < period + 1 || period <= 0) {
    return result;
  }

  // 计算每日价格变化
  const changes: number[] = new Array(data.length - 1);
  for (let i = 1; i < data.length; i++) {
    changes[i - 1] = data[i].close - data[i - 1].close;
  }

  // 初始平均涨幅/跌幅（前 period 个变化值）
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  // 第一个 RSI 值（位于 index = period）
  result[period] = avgLoss === 0
    ? 100
    : 100 - 100 / (1 + avgGain / avgLoss);

  // 递推计算后续 RSI
  for (let i = period + 1; i < data.length; i++) {
    const change = changes[i - 1]; // changes[i-1] 对应 data[i]
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = avgLoss === 0
      ? 100
      : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// ─── KDJ ──────────────────────────────────────────────────────

/**
 * 计算 KDJ 指标（随机指标）
 *
 * 标准参数 (9, 3, 3)：
 *   1. RSV = (close − LLV) / (HHV − LLV) × 100
 *      其中 LLV 为最近 period 周期的最低价，HHV 为最近 period 周期的最高价
 *   2. Kₜ = ⅔ × Kₜ₋₁ + ⅓ × RSVₜ     （初始 K = 50）
 *   3. Dₜ = ⅔ × Dₜ₋₁ + ⅓ × Kₜ       （初始 D = 50）
 *   4. Jₜ = 3 × Kₜ − 2 × Dₜ
 *
 * 前 period-1 个位置为 null（数据不足）。
 *
 * @param data   - OHLCV 数组
 * @param period - 周期（默认 9，即 RSV 的观察窗口）
 * @returns 包含 K、D、J 三个等长数组的对象
 *
 * @example
 * ```typescript
 * const { k, d, j } = calcKDJ(dailyData);
 * ```
 */
export function calcKDJ(
  data: OHLCV[],
  period: number = 9,
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const length = data.length;
  const k: (number | null)[] = new Array(length).fill(null);
  const d: (number | null)[] = new Array(length).fill(null);
  const j: (number | null)[] = new Array(length).fill(null);

  if (data.length < period || period <= 0) {
    return { k, d, j };
  }

  // K/D 初始值
  let prevK = 50;
  let prevD = 50;

  for (let i = period - 1; i < length; i++) {
    // 计算周期内最高价、最低价
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let jj = i - period + 1; jj <= i; jj++) {
      if (data[jj].high > highestHigh) highestHigh = data[jj].high;
      if (data[jj].low < lowestLow) lowestLow = data[jj].low;
    }

    // RSV 计算
    const rsv = highestHigh === lowestLow
      ? 50
      : ((data[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;

    // K、D、J 递推
    if (i === period - 1) {
      k[i] = prevK; // 初始 K = 50
      d[i] = prevD; // 初始 D = 50
    } else {
      const currK = (2 / 3) * prevK + (1 / 3) * rsv;
      const currD = (2 / 3) * prevD + (1 / 3) * currK;
      k[i] = currK;
      d[i] = currD;
      prevK = currK;
      prevD = currD;
    }

    j[i] = 3 * k[i]! - 2 * d[i]!;
  }

  return { k, d, j };
}

// ─── 布林带 ───────────────────────────────────────────────────

/**
 * 计算布林带（Bollinger Bands）
 *
 * 公式（标准参数 20, 2）：
 *   MID = SMA(close, n)
 *   StdDev = √(Σ(close − MID)² / n)
 *   UPPER = MID + multiplier × StdDev
 *   LOWER = MID − multiplier × StdDev
 *
 * 前 n-1 个位置为 null（数据不足）。
 *
 * @param data       - OHLCV 数组
 * @param period     - 计算周期（默认 20）
 * @param multiplier - 标准差倍数（默认 2）
 * @returns 包含 upper、mid、lower 三个等长数组的对象
 *
 * @example
 * ```typescript
 * const { upper, mid, lower } = calcBollinger(dailyData, 20, 2);
 * ```
 */
export function calcBollinger(
  data: OHLCV[],
  period: number = 20,
  multiplier: number = 2,
): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const length = data.length;
  const upper: (number | null)[] = new Array(length).fill(null);
  const mid: (number | null)[] = new Array(length).fill(null);
  const lower: (number | null)[] = new Array(length).fill(null);

  if (data.length < period || period <= 0) {
    return { upper, mid, lower };
  }

  for (let i = period - 1; i < length; i++) {
    // 计算 SMA
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    const sma = sum / period;
    mid[i] = sma;

    // 计算标准差（总体标准差）
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - sma;
      variance += diff * diff;
    }
    const stdDev = Math.sqrt(variance / period);

    upper[i] = sma + multiplier * stdDev;
    lower[i] = sma - multiplier * stdDev;
  }

  return { upper, mid, lower };
}

// ─── 辅助指标 ─────────────────────────────────────────────────

/**
 * 计算指定位置的振幅
 *
 * 振幅 = (high − low) / prevClose × 100
 *
 * 首日（index = 0）因无前一日收盘价，返回 0。
 *
 * @param data  - OHLCV 数组
 * @param index - 目标位置（从 0 开始）
 * @returns 振幅百分比
 *
 * @example
 * ```typescript
 * const amp = calcAmplitude(dailyData, dailyData.length - 1);
 * // 最新一天的振幅
 * ```
 */
export function calcAmplitude(data: OHLCV[], index: number): number {
  if (index <= 0 || index >= data.length) {
    return 0;
  }

  const { high, low } = data[index];
  const prevClose = data[index - 1].close;

  if (prevClose === 0) {
    return 0;
  }

  return ((high - low) / prevClose) * 100;
}

/**
 * 计算指定位置的涨跌幅
 *
 * 涨跌幅 = (close − prevClose) / prevClose × 100
 *
 * 首日（index = 0）因无前一日收盘价，返回 0。
 *
 * @param data  - OHLCV 数组
 * @param index - 目标位置（从 0 开始）
 * @returns 涨跌幅百分比
 *
 * @example
 * ```typescript
 * const pct = calcPriceChangePct(dailyData, dailyData.length - 1);
 * // 最新一天的涨跌幅
 * ```
 */
export function calcPriceChangePct(data: OHLCV[], index: number): number {
  if (index <= 0 || index >= data.length) {
    return 0;
  }

  const currentClose = data[index].close;
  const prevClose = data[index - 1].close;

  if (prevClose === 0) {
    return 0;
  }

  return ((currentClose - prevClose) / prevClose) * 100;
}
