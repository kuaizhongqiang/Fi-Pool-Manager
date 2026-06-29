/**
 * 管理类工具（Manager）
 *
 * 封装股池 CRUD 操作，对外暴露标准 API 格式：
 *   { success: true, data: T } | { success: false, error: { code: string, message: string } }
 *
 * 错误码约定：
 * - INVALID_PARAM：参数校验失败（空名称、负 ID、信号值范围错误等）
 * - DB_ERROR：数据库操作异常（唯一约束冲突、外键关联等）
 *
 * @module tools/manager
 */

import * as poolService from '../services/pool.js';
import { getDatabase } from '../db/index.js';
import { pool } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * 创建新的股票池。
 *
 * 创建后如果提供了 stockCodes，会立即将对应股票加入新股池。
 *
 * @param name - 股池名称（必填，不能为空字符串）
 * @param desc - 可选描述
 * @param stockCodes - 可选的初始股票代码列表
 * @returns 成功包含 { id }，失败带错误码 INVALID_PARAM 或 DB_ERROR
 *
 * @example
 * const r = await createPool('白马股池', '优质蓝筹', ['600519']);
 * if (r.success) console.log('created id:', r.data.id);
 */
export async function createPool(
  name: string,
  desc?: string,
  stockCodes?: string[],
): Promise<
  | { success: true; data: { id: number } }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!name || name.trim().length === 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池名称不能为空' } };
    }

    // 预检名称唯一性
    const existing = getDatabase().select().from(pool).where(eq(pool.name, name.trim())).get();
    if (existing) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: `股池名称"${name}"已存在` } };
    }

    const result = await poolService.createPool(name.trim(), desc?.trim());
    if (stockCodes && stockCodes.length > 0) {
      await poolService.addStocks(result.id, stockCodes);
    }
    return { success: true as const, data: { id: result.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 删除指定股池及其关联的 pool_stock 记录。
 *
 * @param id - 股池 ID（必须是正整数）
 * @returns 成功无 data，失败带错误码 INVALID_PARAM 或 DB_ERROR
 *
 * @example
 * const r = await deletePool(1);
 */
export async function deletePool(
  id: number,
): Promise<
  | { success: true; data?: undefined }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池 ID 必须是正整数' } };
    }
    await poolService.deletePool(id);
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 修改股池名称或描述。
 *
 * 仅提供需要更新的字段即可，未提供的字段保持不变。
 *
 * @param id - 股池 ID（必须是正整数）
 * @param name - 可选新名称（不能为空字符串）
 * @param desc - 可选新描述
 * @returns 成功无 data，失败带错误码 INVALID_PARAM 或 DB_ERROR
 *
 * @example
 * const r = await updatePool(1, { name: '新名称', desc: '新描述' });
 */
export async function updatePool(
  id: number,
  name?: string,
  desc?: string,
): Promise<
  | { success: true; data?: undefined }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池 ID 必须是正整数' } };
    }
    if (name !== undefined && name.trim().length === 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池名称不能为空' } };
    }

    // 预检名称唯一性（如需改名）
    if (name !== undefined) {
      const existing = getDatabase().select().from(pool).where(eq(pool.name, name.trim())).get();
      if (existing && existing.id !== id) {
        return { success: false as const, error: { code: 'INVALID_PARAM', message: `股池名称"${name}"已存在` } };
      }
    }

    const updateData: { name?: string; desc?: string } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (desc !== undefined) updateData.desc = desc.trim();

    if (Object.keys(updateData).length === 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '未提供任何需要更新的字段' } };
    }

    await poolService.updatePool(id, updateData);
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 向指定股池批量添加股票代码。
 *
 * 已存在于该股池的股票会自动跳过，不会重复添加。
 *
 * @param poolId - 股池 ID（必须是正整数）
 * @param stockCodes - 要添加的股票代码数组（不能为空）
 * @returns 成功包含 { added, skipped }，失败带错误码
 *
 * @example
 * const r = await addStocks(1, ['600519', '000001']);
 * if (r.success) console.log(`添加 ${r.data.added}，跳过 ${r.data.skipped}`);
 */
export async function addStocks(
  poolId: number,
  stockCodes: string[],
): Promise<
  | { success: true; data: { added: number; skipped: number } }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!Number.isInteger(poolId) || poolId <= 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池 ID 必须是正整数' } };
    }
    if (!stockCodes || stockCodes.length === 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股票代码列表不能为空' } };
    }

    const result = await poolService.addStocks(poolId, stockCodes);
    return { success: true as const, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 从指定股池中移除一批股票代码。
 *
 * @param poolId - 股池 ID（必须是正整数）
 * @param stockCodes - 要移除的股票代码数组（不能为空）
 * @returns 成功包含 { removed }，失败带错误码
 *
 * @example
 * const r = await removeStocks(1, ['600519']);
 * if (r.success) console.log(`移除了 ${r.data.removed} 只`);
 */
export async function removeStocks(
  poolId: number,
  stockCodes: string[],
): Promise<
  | { success: true; data: { removed: number } }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!Number.isInteger(poolId) || poolId <= 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池 ID 必须是正整数' } };
    }
    if (!stockCodes || stockCodes.length === 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股票代码列表不能为空' } };
    }

    const result = await poolService.removeStocks(poolId, stockCodes);
    return { success: true as const, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 设置股池综合信号值。
 *
 * @param poolId - 股池 ID（必须是正整数）
 * @param signal - 信号值：-1 看空, 0 中性, 1 看多
 * @returns 成功无 data，失败带错误码
 *
 * @example
 * const r = await setPoolSignal(1, 1); // 看多
 */
export async function setPoolSignal(
  poolId: number,
  signal: number,
): Promise<
  | { success: true; data?: undefined }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    if (!Number.isInteger(poolId) || poolId <= 0) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '股池 ID 必须是正整数' } };
    }
    if (![-1, 0, 1].includes(signal)) {
      return { success: false as const, error: { code: 'INVALID_PARAM', message: '信号值必须为 -1（看空）、0（中性）或 1（看多）' } };
    }

    await poolService.setPoolSignal(poolId, signal);
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}
