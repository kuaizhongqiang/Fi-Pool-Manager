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
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function ensureDatabase(): ReturnType<typeof initDatabase> {
  const dbPath = resolve(getDbPath());
  const isNew = !existsSync(dbPath);

  const db = initDatabase();

  if (isNew) {
    console.log(`[db] 数据库文件不存在，初始化: ${dbPath}`);
  } else {
    console.log(`[db] 连接已有数据库: ${dbPath}`);
  }

  // 执行迁移 — 迁移文件夹路径相对于本文件位置
  // 编译后：packages/server/dist/db/migrate.js → ../../drizzle
  // 源码时：packages/server/src/db/migrate.ts → ../../drizzle
  const migrationsFolder = resolve(__dirname, '../../drizzle');
  try {
    migrate(db, { migrationsFolder });
    console.log('[db] 迁移执行完成');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[db] 迁移失败:', msg);
    console.error('[db] 数据库处于不一致状态，终止进程');
    process.exit(1);
  }

  return db;
}
