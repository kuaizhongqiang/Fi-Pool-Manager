/**
 * 板块数据服务
 *
 * 对接东方财富免费 API 获取 A 股板块/行业分类数据。
 * 提供股票所属板块查询和板块涨跌幅数据。
 *
 * 缓存策略：板块分类变化慢，首次获取后缓存到内存 Map。
 *
 * @module services/sector
 */

import { fetchJson } from '../utils/http-client.js';
import { enforceRateLimit } from './daily-info.js';

// ─── 类型 ────────────────────────────────────────────────────────

export interface SectorInfo {
  /** 板块代码（如 BK0001） */
  code: string;
  /** 板块名称（如"白酒"） */
  name: string;
  /** 涨跌幅（百分比，如 2.5） */
  changePct: number;
  /** 板块类型（industry | concept | region） */
  type: 'industry' | 'concept' | 'region';
}

// ─── 缓存 ────────────────────────────────────────────────────────

/**
 * 板块缓存。
 * stockCode → SectorInfo[] 的映射。
 */
let sectorCache: Map<string, SectorInfo[]> | null = null;

/** 缓存最后更新时间 */
let cacheLastUpdated = 0;

/** 缓存有效期（5 分钟） */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 判断缓存是否有效。
 */
function isCacheValid(): boolean {
  return sectorCache !== null && Date.now() - cacheLastUpdated < CACHE_TTL;
}

// ─── 东方财富 API ───────────────────────────────────────────────

/** 行业板块 API 参数 */
const API_BASE = 'http://push2.eastmoney.com/api/qt/clist/get';

/**
 * 构建东方财富 API 的 secid 格式。
 * 沪市代码以 6 开头 → market=1，深市 → market=0，北交所以 8 开头 → market=0
 */
function getMarket(code: string): number {
  return code.startsWith('6') ? 1 : 0;
}

/**
 * 获取股票代码对应的市场前缀。
 */
function getSecId(code: string): string {
  return `${getMarket(code)}.${code}`;
}

// ─── 公开 API ───────────────────────────────────────────────────

/**
 * 刷新板块缓存。
 *
 * 遍历东方财富行业板块和概念板块，获取每只股票所属板块信息。
 * 建议在首次调用 getStockSectors 前手动触发，或由 getStockSectors 自动触发。
 */
async function refreshCache(): Promise<void> {
  const newCache = new Map<string, SectorInfo[]>();
  const boardTypes: Array<{ fs: string; type: SectorInfo['type'] }> = [
    { fs: 'm:90+t1', type: 'industry' }, // 行业板块
    { fs: 'm:90+t2', type: 'concept' },  // 概念板块
  ];

  for (const { fs, type } of boardTypes) {
    // 1. 获取板块列表
    const boardUrl = `${API_BASE}?pn=1&pz=500&po=1&np=1&fields=f12,f14,f2,f3,f4&fid=f3&fs=${fs}`;

    let boardData: { data?: { diff?: Array<{ f12: string; f14: string; f3: number }> } } = {};
    try {
      boardData = await fetchJson(boardUrl);
    } catch (err) {
      console.warn(`[sector] 获取板块列表失败 (${type}):`, (err as Error).message);
      continue;
    }

    const boards = boardData?.data?.diff || [];
    if (boards.length === 0) {
      console.warn(`[sector] 板块列表为空 (${type})`);
      continue;
    }

    console.log(`[sector] 获取到 ${boards.length} 个${type}板块`);

    // 2. 遍历每个板块，获取成分股
    for (const board of boards) {
      const boardCode = board.f12;
      const boardName = board.f14;
      const changePct = board.f3 ?? 0;

      if (!boardCode) continue;

      // 获取该板块的成分股列表
      const stockUrl = `${API_BASE}?pn=1&pz=1000&po=1&np=1&fields=f12&fid=f3&fs=b:${boardCode}`;

      try {
        await enforceRateLimit();
        const stockData = await fetchJson<{ data?: { diff?: Array<{ f12: string }> } }>(stockUrl);
        const stocks = stockData?.data?.diff || [];

        for (const s of stocks) {
          if (!s.f12) continue;
          const stockCode = s.f12;
          const info: SectorInfo = { code: boardCode, name: boardName, changePct, type };

          if (newCache.has(stockCode)) {
            newCache.get(stockCode)!.push(info);
          } else {
            newCache.set(stockCode, [info]);
          }
        }
      } catch (err) {
        // 单个板块获取失败不影响其他板块
        console.warn(`[sector] 获取板块 ${boardName}(${boardCode}) 成分股失败:`, (err as Error).message);
        continue;
      }
    }
  }

  sectorCache = newCache;
  cacheLastUpdated = Date.now();
  console.log(`[sector] 缓存刷新完成: ${sectorCache.size} 只股票`);
}

/**
 * 获取指定股票所属的板块信息。
 *
 * 自动触发缓存刷新（缓存过期或未初始化时）。
 *
 * @param code - 六位股票代码
 * @returns 板块信息数组（可能为空数组）
 *
 * @example
 * const sectors = await getStockSectors('600519');
 * // [{ code: 'BK0001', name: '白酒', changePct: 2.5, type: 'industry' }]
 */
export async function getStockSectors(code: string): Promise<SectorInfo[]> {
  if (!isCacheValid()) {
    try {
      await refreshCache();
    } catch (err) {
      console.warn('[sector] 刷新缓存失败:', (err as Error).message);
      return [];
    }
  }

  return sectorCache?.get(code) ?? [];
}

/**
 * 获取指定板块的涨跌幅。
 *
 * @param sectorCode - 板块代码
 * @returns 涨跌幅，获取失败返回 0
 */
export async function getSectorTrend(sectorCode: string): Promise<number> {
  const url = `${API_BASE}?pn=1&pz=1&po=1&np=1&fields=f3&fid=f3&fs=b:${sectorCode}`;
  try {
    const data = await fetchJson<{ data?: { diff?: Array<{ f3: number }> } }>(url);
    return data?.data?.diff?.[0]?.f3 ?? 0;
  } catch {
    return 0;
  }
}
