/**
 * Test fixtures for Fi-Pool-Manager tests
 *
 * Provides reusable mock data for unit and integration tests.
 */

import type { OHLCV } from '../../src/utils/indicators.js';

// ─── OHLCV test data ────────────────────────────────────────────

/** 60 days of OHLCV data in a simple uptrend pattern */
export const mockOHLCVData: OHLCV[] = Array.from({ length: 60 }, (_, i) => ({
  date: `2024-01-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i * 0.5,
  high: 101 + i * 0.5,
  low: 99 + i * 0.5,
  close: 100 + i * 0.5,
  volume: 1000000 + (i % 5 === 0 ? 2000000 : 0),
}));

/**
 * Uptrend data for golden cross testing.
 *
 * First 10 days: prices drop from 100 to 82 (downtrend).
 * Next 10 days:  prices rise from 82 upward (uptrend, MA5 crosses above MA10).
 */
export const goldenCrossData: OHLCV[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    date: `2024-01-${i + 1}`,
    open: 100,
    high: 101,
    low: 99,
    close: 100 - i * 2,
    volume: 1000000,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    date: `2024-01-${i + 11}`,
    open: 82,
    high: 83,
    low: 81,
    close: 82 + i * 3,
    volume: 1000000,
  })),
];

/** Volume spike data: last day has 5x normal volume */
export const volumeSpikeData: OHLCV[] = Array.from({ length: 15 }, (_, i) => ({
  date: `2024-01-${i + 1}`,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: i === 14 ? 5000000 : 1000000,
}));

// ─── Stock data for DB tests ────────────────────────────────────

export interface MockStock {
  code: string;
  name: string;
  currentPrice: number;
}

export const mockStocks: MockStock[] = [
  { code: '000001', name: '平安银行', currentPrice: 10.5 },
  { code: '600519', name: '贵州茅台', currentPrice: 1500.0 },
  { code: '000002', name: '万科A', currentPrice: 15.0 },
];
