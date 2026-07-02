/**
 * 日行情数据服务
 *
 * 提供上游职责：
 * 1. 从腾讯财经接口获取历史 K 线数据和实时报价
 * 2. 将获取的数据批量写入 daily_info 表（upsert）
 * 3. 查询已入库的日行情数据
 * 4. 刷新数据入口（单只或全量）
 *
 * 内置请求频率控制：相邻两次 HTTP 调用至少间隔 1200ms。
 *
 * @module services/daily-info
 */

import { getDatabase } from '../db/index.js';
import { dailyInfo, stock } from '../db/schema.js';
import { eq, and, between, sql } from 'drizzle-orm';
import { checkDataFreshness } from '../utils/data-freshness.js';

// ─── 模块级频率控制 ────────────────────────────────────────

/** 上一次 HTTP 请求的时间戳，用于频率控制 */
let lastFetchTime = 0;

/** 两次请求之间的最小间隔（毫秒），从 .env DATA_FETCH_INTERVAL_MS 读取，默认 1200ms */
const MIN_FETCH_INTERVAL = Math.max(200, parseInt(process.env.DATA_FETCH_INTERVAL_MS || '1200', 10));

/**
 * 确保两次请求之间满足最小间隔。
 * 如果上次请求至今不足 MIN_FETCH_INTERVAL，则等待剩余时间。
 * 导出供其他服务（如 sector.ts）共享使用。
 */
export async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_FETCH_INTERVAL) {
    const delay = MIN_FETCH_INTERVAL - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastFetchTime = Date.now();
}

// ─── 市场前缀 ──────────────────────────────────────────────

/**
 * 根据股票代码判断所属市场，返回前缀标识。
 *
 * 上海：600/601/603/605/688/900
 * 深圳：000/001/002/300/301/200
 *
 * @param code - 六位股票代码
 * @returns 'sh' 或 'sz'
 *
 * @example
 * getMarketPrefix('600519') // => 'sh'
 * getMarketPrefix('000001') // => 'sz'
 */
export function getMarketPrefix(code: string): 'sh' | 'sz' {
  const prefix = code.substring(0, 3);
  if (
    ['600', '601', '603', '605', '688', '900'].includes(prefix)
  ) {
    return 'sh';
  }
  return 'sz'; // 含 000/001/002/300/301/200 及未归类代码默认深圳
}

/**
 * 构建带市场前缀的完整代码（如 'sh600519'）。
 *
 * @param code - 六位股票代码
 * @returns 带前缀的代码
 */
function marketCode(code: string): string {
  return getMarketPrefix(code) + code;
}

// ─── 腾讯 K 线 API ────────────────────────────────────────

/**
 * 行情 K 线数据点接口。
 */
export interface OHLCV {
  /** 交易日期，格式 'yyyy-MM-dd' */
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

/**
 * 从腾讯财经接口获取最近 60 个交易日的日 K 线数据。
 *
 * 使用的接口：
 *   http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,60,qfq
 *
 * 返回数据的 day/qfqday 数组格式为 [date, open, close, high, low, volume]。
 *
 * @param code - 六位股票代码
 * @returns 日 K 线数据数组（按日期升序，最近的在最后）
 *
 * @example
 * const data = await fetchFromTencent('600519');
 * console.log(data.length); // <= 60
 */
export async function fetchFromTencent(code: string): Promise<OHLCV[]> {
  const url = `http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode(code)},day,,,60,qfq`;

  await enforceRateLimit();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`腾讯 K 线接口返回错误状态 ${response.status} (${code})`);
  }

  const rawText = await response.text();
  const json = parseJsonp(rawText) as {
    data?: Record<string, { day?: unknown[]; qfqday?: unknown[] }>;
  };

  // 提取数据：data -> {marketCode} -> day 或 qfqday
  const codeKey = marketCode(code);
  const stockData = json?.data?.[codeKey];
  if (!stockData) {
    throw new Error(`腾讯 K 线接口返回数据中无 ${codeKey} 节点 (${code})`);
  }

  // 优先使用 qfqday（前复权），否则用 day
  const rawEntries: unknown[] = stockData.qfqday ?? stockData.day ?? [];
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new Error(`腾讯 K 线接口返回空数组 (${code})`);
  }

  return rawEntries.map((entry: unknown) => {
    const row = entry as [string, string, string, string, string, string];
    return {
      date: row[0],
      open: parseFloat(row[1]),
      close: parseFloat(row[2]),
      high: parseFloat(row[3]),
      low: parseFloat(row[4]),
      volume: parseInt(row[5], 10),
    };
  });
}

// ─── 腾讯实时行情 API ─────────────────────────────────────

/**
 * 实时行情数据点接口。
 */
export interface RealTimeQuote {
  /** 当前最新价格 */
  price: number;
  /** 股票名称 */
  name: string;
}

/**
 * 从腾讯实时行情接口获取当前价格和名称。
 * 使用的接口：
 *   https://web.sqt.gtimg.cn/q=sh${code} 或 sz${code}
 *
 * 返回 JSONP 格式文本，解析为股票数据字段数组后提取所需信息。
 *
 * @param code - 六位股票代码
 * @returns 实时行情 { price, name }
 *
 * @example
 * const { price, name } = await fetchRealTimeQuote('600519');
 * // => { price: 1915.00, name: '贵州茅台' }
 */
export async function fetchRealTimeQuote(code: string): Promise<RealTimeQuote> {
  const url = `https://web.sqt.gtimg.cn/q=${marketCode(code)}`;

  await enforceRateLimit();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`腾讯实时行情接口返回错误状态 ${response.status} (${code})`);
  }

  // 腾讯接口返回 GBK 编码，必须显式解码，否则中文名称乱码
  const buf = await response.arrayBuffer();
  const rawText = new TextDecoder('gbk').decode(buf);

  // 格式: v_sh600519="1~贵州茅台~600519~...";
  // 提取引号内的内容
  const match = rawText.match(/"([^"]+)"/);
  if (!match) {
    throw new Error(`解析实时行情响应失败: 未找到引号内容 (${code})`);
  }

  const fields = match[1].split('~');
  // 标准字段索引（从 0 开始）:
  //   1 = 名称, 3 = 当前价
  const name = fields[1];
  const price = parseFloat(fields[3]);

  if (!name || isNaN(price)) {
    throw new Error(
      `解析实时行情数据字段失败 (${code}): name=${name}, price=${fields[3]}`,
    );
  }

  return { price, name };
}

// ─── JSONP 解析 ────────────────────────────────────────────

/**
 * 解析可能包含 JSONP 回调包装的响应文本为对象。
 * 如果文本以 `函数名(` 开头，则剥离函数调用和末尾的 `;` 后解析 JSON。
 * 否则直接解析为 JSON。
 *
 * @param text - 原始响应文本
 * @returns 解析后的对象
 */
function parseJsonp(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  // 检查是否以字母开头（JSONP 回调函数名）
  if (/^[a-zA-Z_\$]/.test(trimmed)) {
    // 去掉函数名和左括号
    const inner = trimmed.replace(/^[a-zA-Z_\$][a-zA-Z0-9_\$]*\(/, '').replace(/\);?\s*$/, '');
    return JSON.parse(inner);
  }
  return JSON.parse(trimmed);
}

// ─── 数据库操作 ────────────────────────────────────────────

/**
 * 批量插入或更新日行情数据。
 * 按 (code, date) 唯一约束执行 upsert：
 * - 已存在记录：更新 open/high/low/close/volume
 * - 不存在记录：新增
 *
 * @param records - 行情数据记录数组
 * @returns 成功处理的记录数
 *
 * @example
 * const n = await upsertDailyInfo([
 *   { code: '600519', date: '2024-06-01', open: 1500, high: 1510, low: 1490, close: 1505, volume: 1000000 },
 * ]);
 * // n === 1
 */
export async function upsertDailyInfo(
  records: {
    code: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[],
): Promise<number> {
  if (records.length === 0) return 0;

  const db = getDatabase();

  for (const record of records) {
    db.insert(dailyInfo)
      .values(record)
      .onConflictDoUpdate({
        target: [dailyInfo.code, dailyInfo.date],
        set: {
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
          volume: record.volume,
        },
      })
      .run();
  }

  return records.length;
}

/**
 * 查询指定股票的日行情数据。
 * 可选的日期范围过滤。
 *
 * @param code - 股票代码
 * @param startDate - 起始日期 'yyyy-MM-dd'（含），不指定则不限制起始
 * @param endDate - 结束日期 'yyyy-MM-dd'（含），不指定则不限制结束
 * @returns 日行情数据数组（按日期升序）
 *
 * @example
 * // 获取最近 10 天的数据
 * const data = await getDailyInfo('600519', '2024-05-01', '2024-06-01');
 */
export async function getDailyInfo(
  code: string,
  startDate?: string,
  endDate?: string,
) {
  const db = getDatabase();
  const conditions = [eq(dailyInfo.code, code)];

  if (startDate && endDate) {
    conditions.push(between(dailyInfo.date, startDate, endDate));
  } else if (startDate) {
    conditions.push(sql`${dailyInfo.date} >= ${startDate}`);
  } else if (endDate) {
    conditions.push(sql`${dailyInfo.date} <= ${endDate}`);
  }

  return db
    .select()
    .from(dailyInfo)
    .where(and(...conditions))
    .orderBy(dailyInfo.date)
    .all();
}

/**
 * 刷新最新行情数据。
 *
 * - 当指定 code 时：获取该股票的最新实时行情和 K 线数据，更新 stock 表和 daily_info 表。
 * - 当不指定 code 时：遍历数据库中所有股票，逐个刷新。
 *
 * @param code - 可选股票代码。不传则刷新全部
 * @returns 更新的 daily_info 记录总数
 *
 * @example
 * // 刷新单只
 * const { updated } = await refreshData('600519');
 * // 刷新全部
 * const { updated } = await refreshData();
 */
export async function refreshData(
  code?: string,
): Promise<{ updated: number }> {
  const db = getDatabase();

  let codes: string[] = [];

  if (code) {
    codes = [code];
  } else {
    const stocks = db.select({ code: stock.code }).from(stock).all();
    codes = stocks.map((s) => s.code);
  }

  let totalUpdated = 0;

  for (const c of codes) {
    try {
      // 0. 确保 stock 记录存在（首次使用会自动创建）
      const existingStock = db.select({ code: stock.code }).from(stock).where(eq(stock.code, c)).get();
      if (!existingStock) {
        db.insert(stock).values({ code: c, name: '', currentPrice: 0 }).run();
      }

      // 1. 获取实时行情并更新 stock 表
      const { price, name } = await fetchRealTimeQuote(c);
      db.update(stock)
        .set({ name, currentPrice: price, updatedAt: sql`datetime('now')` })
        .where(eq(stock.code, c))
        .run();

      // 2. 获取历史 K 线并 upsert daily_info
      const ohlcvList = await fetchFromTencent(c);
      const records = ohlcvList.map((ohlcv) => ({
        code: c,
        date: ohlcv.date,
        open: ohlcv.open,
        high: ohlcv.high,
        low: ohlcv.low,
        close: ohlcv.close,
        volume: ohlcv.volume,
      }));

      // 3. 检查数据是否陈旧
      checkDataFreshness(c, records[records.length - 1].date, 'refresh');

      const n = await upsertDailyInfo(records);
      totalUpdated += n;
    } catch (err) {
      // 单只股票失败不应影响后续股票的刷新
      console.warn(`[daily-info] 刷新 ${c} 失败:`, (err as Error).message);
    }
  }

  return { updated: totalUpdated };
}
