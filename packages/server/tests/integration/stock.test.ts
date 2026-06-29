/**
 * Integration tests for stock CRUD operations using a test database.
 *
 * Creates an isolated temporary database with migrations,
 * inserts mock stock data, and verifies queries.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { stock } from '../../src/db/schema.js';
import { eq, like, sql } from 'drizzle-orm';
import { mockStocks } from '../fixtures/test-data.js';

// ─── Test DB Setup ──────────────────────────────────────────────

const { db, close } = createTestDb();

beforeAll(async () => {
  // Insert mock stock data
  for (const s of mockStocks) {
    await db.insert(stock).values(s).onConflictDoNothing();
  }
});

afterAll(() => {
  close();
});

// ─── Tests ──────────────────────────────────────────────────────

describe('Stock CRUD', () => {
  it('inserts and queries by code', async () => {
    const result = await db
      .select()
      .from(stock)
      .where(eq(stock.code, '000001'));

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('平安银行');
    expect(result[0].currentPrice).toBe(10.5);
  });

  it('searches by name', async () => {
    const result = await db
      .select()
      .from(stock)
      .where(eq(stock.name, '贵州茅台'));

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('600519');
  });

  it('returns all stocks', async () => {
    const result = await db.select().from(stock);
    expect(result).toHaveLength(mockStocks.length);
  });

  it('updates a stock price', async () => {
    await db
      .update(stock)
      .set({ currentPrice: 11.0 })
      .where(eq(stock.code, '000001'));

    const result = await db
      .select()
      .from(stock)
      .where(eq(stock.code, '000001'));

    expect(result[0].currentPrice).toBe(11.0);

    // Reset for other tests
    await db
      .update(stock)
      .set({ currentPrice: 10.5 })
      .where(eq(stock.code, '000001'));
  });

  it('deletes a stock', async () => {
    // Insert a temporary stock for deletion test
    await db.insert(stock).values({
      code: '999999',
      name: '测试股票',
      currentPrice: 100,
    }).onConflictDoNothing();

    await db.delete(stock).where(eq(stock.code, '999999'));

    const result = await db
      .select()
      .from(stock)
      .where(eq(stock.code, '999999'));

    expect(result).toHaveLength(0);
  });

  it('performs partial name search with LIKE', async () => {
    const result = await db
      .select()
      .from(stock)
      .where(like(stock.name, '%茅台%'));

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('600519');
  });

  it('returns empty array for non-existent code', async () => {
    const result = await db
      .select()
      .from(stock)
      .where(eq(stock.code, 'NONEXIST'));

    expect(result).toHaveLength(0);
  });
});
