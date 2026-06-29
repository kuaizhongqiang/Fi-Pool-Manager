/**
 * Test database helper.
 *
 * Creates an isolated temporary SQLite database for integration tests,
 * executes the project's Drizzle migration SQL (with fixes for the
 * auto-generated nested-quote issue), and provides a cleanup method.
 *
 * @module tests/fixtures/test-db
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import * as schema from '../../src/db/schema.js';

export interface TestDbResult {
  /** Drizzle ORM database instance */
  db: BetterSQLite3Database<typeof schema>;
  /** Raw better-sqlite3 instance (for pragma / direct queries) */
  sqlite: Database.Database;
  /** Path to the temporary database file */
  dbPath: string;
  /** Close the connection and remove the file */
  close: () => void;
}

let counter = 0;

/**
 * Create a fresh temporary SQLite database for testing.
 *
 * - Creates a unique temp file path
 * - Initializes better-sqlite3 with WAL mode
 * - Reads the project's SQL migration file, fixes nested-quote default
 *   values, and executes each statement directly
 *
 * The fix addresses a Drizzle codegen quirk where
 *   DEFAULT 'datetime('now')'
 * is emitted (literal string with nested single quotes) rather than the
 * valid SQLite expression
 *   DEFAULT (datetime('now'))
 * or the keyword
 *   DEFAULT CURRENT_TIMESTAMP
 */
export function createTestDb(): TestDbResult {
  const dbDir = mkdtempSync(join(tmpdir(), 'fi-pool-test-'));
  const dbPath = resolve(join(dbDir, `test-${Date.now()}-${counter++}.db`));

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Read and fix the migration SQL
  const migrationsFolder = resolve(join(import.meta.dirname, '..', '..', 'drizzle'));
  const migrationFiles = ['0000_equal_marvel_apes.sql'];

  for (const file of migrationFiles) {
    const filePath = resolve(join(migrationsFolder, file));
    if (!existsSync(filePath)) continue;

    const sql = readFileSync(filePath, 'utf-8');

    // Fix: Drizzle codegen produces DEFAULT 'datetime('now')' which is
    // invalid SQLite (nested unescaped single quotes). Replace with
    // the valid expression form DEFAULT (datetime('now')).
    const fixedSql = sql.replace(
      /DEFAULT\s+'datetime\('now'\)'/g,
      "DEFAULT (datetime('now'))",
    );

    const statements = fixedSql.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  }

  return {
    db,
    sqlite,
    dbPath,
    close: () => {
      try {
        sqlite.close();
      } catch {
        // ignore close errors
      }
      // Clean up the WAL, SHM, and db files
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          const p = dbPath + suffix;
          if (existsSync(p)) unlinkSync(p);
        } catch {
          // ignore cleanup errors
        }
      }
      // Note: the parent temp directory is left behind and cleaned
      // up by the OS. Avoids cross-platform rmdir complications.
    },
  };
}
