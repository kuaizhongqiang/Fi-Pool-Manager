/**
 * 股池（Pool）与股池-股票关联（PoolStock）管理服务
 *
 * 提供股池的 CRUD 操作，以及向股池添加/移除股票的功能。
 * 删除股池时会级联删除关联的 pool_stock 记录（外键约束 CASCADE）。
 *
 * @module services/pool
 */

import { getDatabase } from '../db/index.js';
import { pool, poolStock, stock } from '../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';

/**
 * 创建新的股池。
 *
 * @param name - 股池名称（必须唯一）
 * @param desc - 可选描述，默认为空字符串
 * @returns 包含新股池 id 的对象
 *
 * @example
 * const { id } = await createPool('我的自选股', '日常关注');
 */
export async function createPool(name: string, desc?: string) {
  const db = getDatabase();
  const result = db
    .insert(pool)
    .values({ name, desc: desc ?? '' })
    .run();

  // 获取自增 ID
  const id = Number(result.lastInsertRowid);
  return { id };
}

/**
 * 删除指定股池及其关联的 pool_stock 记录。
 *
 * @param id - 股池 ID
 *
 * @example
 * await deletePool(1);
 */
export async function deletePool(id: number) {
  const db = getDatabase();
  // 先删除关联记录
  db.delete(poolStock).where(eq(poolStock.poolId, id)).run();
  // 再删除股池
  db.delete(pool).where(eq(pool.id, id)).run();
}

/**
 * 更新股池的名称或描述。
 * 仅提供需要更新的字段即可，未提供的字段保持不变。
 *
 * @param id - 股池 ID
 * @param data - 包含 name 和/或 desc 的更新对象
 *
 * @example
 * await updatePool(1, { name: '新名称', desc: '新描述' });
 * await updatePool(1, { desc: '仅更新描述' });
 */
export async function updatePool(
  id: number,
  data: { name?: string; desc?: string },
) {
  const db = getDatabase();
  const updateData: Record<string, unknown> = { updatedAt: sql`datetime('now')` };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.desc !== undefined) updateData.desc = data.desc;

  db.update(pool).set(updateData).where(eq(pool.id, id)).run();
}

/**
 * 列出所有股池，附带每个股池中的股票数量。
 *
 * @returns 股池列表，每个元素包含股池全部字段和 stockCount
 *
 * @example
 * const pools = await listPools();
 * pools.forEach(p => console.log(p.name, p.stockCount));
 */
export async function listPools() {
  const db = getDatabase();
  return db
    .select({
      id: pool.id,
      name: pool.name,
      desc: pool.desc,
      poolAnalysis: pool.poolAnalysis,
      poolSignal: pool.poolSignal,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
      stockCount: sql<number>`cast(count(${poolStock.id}) as integer)`,
    })
    .from(pool)
    .leftJoin(poolStock, eq(poolStock.poolId, pool.id))
    .groupBy(pool.id)
    .orderBy(pool.id)
    .all();
}

/**
 * 向指定股池批量添加股票代码。
 * 已存在于该股池的股票会被跳过，不会重复添加。
 *
 * @param poolId - 股池 ID
 * @param stockCodes - 要添加的股票代码数组
 * @returns 实际添加的数量和跳过的数量
 *
 * @example
 * const { added, skipped } = await addStocks(1, ['600519', '000001']);
 * // added: 2, skipped: 0
 */
export async function addStocks(poolId: number, stockCodes: string[]) {
  if (stockCodes.length === 0) return { added: 0, skipped: 0 };

  const db = getDatabase();

  // 查询已存在于该股池中的股票
  const existing = db
    .select({ stockCode: poolStock.stockCode })
    .from(poolStock)
    .where(
      and(
        eq(poolStock.poolId, poolId),
        inArray(poolStock.stockCode, stockCodes),
      ),
    )
    .all();

  const existingCodes = new Set(existing.map((r) => r.stockCode));
  const toAdd = stockCodes.filter((c) => !existingCodes.has(c));

  if (toAdd.length > 0) {
    db.insert(poolStock)
      .values(toAdd.map((c) => ({ poolId, stockCode: c })))
      .run();
  }

  return { added: toAdd.length, skipped: stockCodes.length - toAdd.length };
}

/**
 * 从指定股池中移除一批股票代码。
 *
 * @param poolId - 股池 ID
 * @param stockCodes - 要移除的股票代码数组
 * @returns 实际移除的数量
 *
 * @example
 * const { removed } = await removeStocks(1, ['600519']);
 * // removed: 1
 */
export async function removeStocks(poolId: number, stockCodes: string[]) {
  if (stockCodes.length === 0) return { removed: 0 };

  const db = getDatabase();
  const info = db
    .delete(poolStock)
    .where(
      and(
        eq(poolStock.poolId, poolId),
        inArray(poolStock.stockCode, stockCodes),
      ),
    )
    .run();

  return { removed: Number(info.changes) };
}

/**
 * 获取指定股池中的所有股票详情。
 * 返回的列表包含股票代码、名称、当前价格以及加入时间。
 *
 * @param poolId - 股池 ID
 * @returns 股池中的股票列表
 *
 * @example
 * const stocks = await getPoolStocks(1);
 * stocks.forEach(s => console.log(s.code, s.name));
 */
export async function getPoolStocks(poolId: number) {
  const db = getDatabase();
  return db
    .select({
      code: stock.code,
      name: stock.name,
      currentPrice: stock.currentPrice,
      addedAt: poolStock.addedAt,
    })
    .from(poolStock)
    .innerJoin(stock, eq(poolStock.stockCode, stock.code))
    .where(eq(poolStock.poolId, poolId))
    .orderBy(stock.code)
    .all();
}

/**
 * 设置股池的看多/看空/中性信号。
 *
 * @param poolId - 股池 ID
 * @param signal - 信号值：-1 看空, 0 中性, 1 看多
 *
 * @example
 * await setPoolSignal(1, 1); // 看多
 * await setPoolSignal(1, -1); // 看空
 */
export async function setPoolSignal(poolId: number, signal: number) {
  const db = getDatabase();
  db.update(pool)
    .set({
      poolSignal: signal,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(pool.id, poolId))
    .run();
}

/**
 * 根据 ID 获取单个股池信息。
 *
 * @param id - 股池 ID
 * @returns 股池对象，未找到时返回 null
 *
 * @example
 * const p = await getPoolById(1);
 * if (p) console.log(p.name);
 */
export async function getPoolById(id: number) {
  const db = getDatabase();
  const rows = db.select().from(pool).where(eq(pool.id, id)).all();
  return rows[0] ?? null;
}
