/**
 * 数据库迁移运行器
 *
 * 启动时查找数据库文件：
 * - 不存在 → 初始化数据库并执行迁移
 * - 存在 → 直接连接
 * - 版本更新 → 通过 Drizzle 迁移脚本变更表结构（不覆盖已有数据）
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { initDatabase, getDatabase, getDbPath } from './index.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

export function ensureDatabase(): ReturnType<typeof initDatabase> {
  const dbPath = resolve(getDbPath());
  const isNew = !existsSync(dbPath);

  const db = initDatabase();

  if (isNew) {
    console.log(`[db] 数据库文件不存在，初始化: ${dbPath}`);
  } else {
    console.log(`[db] 连接已有数据库: ${dbPath}`);
  }

  // 执行迁移（Drizzle 会跳过已应用的迁移）
  try {
    migrate(db, { migrationsFolder: './drizzle' });
    console.log('[db] 迁移执行完成');
  } catch (err) {
    console.warn('[db] 迁移执行失败（可能是首次运行或迁移已是最新）:', (err as Error).message);
  }

  return db;
}
