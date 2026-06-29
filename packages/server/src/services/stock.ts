/**
 * 股票基础信息 CRUD 服务
 *
 * 对 stock 表进行增删改查操作。
 * 每个股票存储 6 位代码、名称、最新价格和更新时间。
 *
 * @module services/stock
 */

import { getDatabase } from '../db/index.js';
import { stock } from '../db/schema.js';
import { eq, like, or, sql } from 'drizzle-orm';

/**
 * 根据股票代码获取单只股票信息。
 *
 * @param code - 六位股票代码（如 '600519'）
 * @returns 股票对象，未找到时返回 null
 *
 * @example
 * const s = await getStockByCode('600519');
 * if (s) console.log(s.name);
 */
export async function getStockByCode(code: string) {
  const db = getDatabase();
  const rows = db.select().from(stock).where(eq(stock.code, code)).all();
  return rows[0] ?? null;
}

/**
 * 根据关键词搜索股票（模糊匹配名称或代码）。
 *
 * @param keyword - 搜索关键词，自动在前后添加 % 通配符
 * @returns 匹配的股票列表
 *
 * @example
 * const results = await searchStocks('茅台');
 */
export async function searchStocks(keyword: string) {
  const db = getDatabase();
  const pattern = `%${keyword}%`;
  return db
    .select()
    .from(stock)
    .where(or(like(stock.code, pattern), like(stock.name, pattern)))
    .all();
}

/**
 * 插入或更新股票信息。
 * 当 code 已存在时更新名称、价格和更新时间；不存在时新增记录。
 *
 * @param code - 六位股票代码
 * @param name - 股票名称
 * @param price - 当前价格
 * @returns 插入或更新后的股票对象
 *
 * @example
 * const s = await upsertStock('600519', '贵州茅台', 1915.00);
 */
export async function upsertStock(code: string, name: string, price: number) {
  const db = getDatabase();
  db.insert(stock)
    .values({ code, name, currentPrice: price })
    .onConflictDoUpdate({
      target: stock.code,
      set: {
        name,
        currentPrice: price,
        updatedAt: sql`datetime('now')`,
      },
    })
    .run();

  // 重新查询以返回完整记录
  const rows = db.select().from(stock).where(eq(stock.code, code)).all();
  return rows[0]!;
}

/**
 * 列出数据库中所有股票，按代码升序排列。
 *
 * @returns 全部股票列表
 *
 * @example
 * const all = await listAllStocks();
 */
export async function listAllStocks() {
  const db = getDatabase();
  return db.select().from(stock).orderBy(stock.code).all();
}

/**
 * 根据股票代码删除一条股票记录。
 * 注意：会因外键约束失败而拒绝删除，如果存在关联的 pool_stock 或 daily_info 记录。
 *
 * @param code - 六位股票代码
 *
 * @example
 * await deleteStock('600519');
 */
export async function deleteStock(code: string) {
  const db = getDatabase();
  db.delete(stock).where(eq(stock.code, code)).run();
}
