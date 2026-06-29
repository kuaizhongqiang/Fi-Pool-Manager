/**
 * 数据库连接与初始化
 *
 * 职责：
 * - 读取 .env 配置的 DB_PATH
 * - 创建 better-sqlite3 数据库连接
 * - 初始化时自动创建数据目录
 * - 暴露 drizzle 实例供全局使用
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.DB_PATH || './data/fi-pool.db';
}

export function initDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance;

  const dbPath = resolve(getDbPath());
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (err) {
      throw new Error(`数据库目录创建失败: ${dbDir} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('foreign_keys = ON');

  dbInstance = drizzle(sqliteInstance, { schema });
  return dbInstance;
}

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return dbInstance;
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return sqliteInstance;
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}
