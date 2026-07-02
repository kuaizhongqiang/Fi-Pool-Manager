/**
 * REST API 服务器
 *
 * 供 personal-vscode-helper 等外部工具迁移股池数据源使用。
 * 提供股票查询、行情、分析执行等 HTTP 接口。
 *
 * @module api
 */

import express from 'express';
import cors from 'cors';
import { getDatabase } from '../db/index.js';
import {
  stock,
  dailyInfo,
  dailyAnalysisReport,
  finalReport,
  pool,
  poolStock,
} from '../db/schema.js';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import * as executeTools from '../tools/execute.js';
import * as dailyInfoService from '../services/daily-info.js';
import * as stockService from '../services/stock.js';
import { VERSION } from '../index.js';

const app = express();
app.use(cors());
app.use(express.json());

// ─── GET /api/v1/stocks/search — 股票搜索 ──────────────────
// #90

app.get('/api/v1/stocks/search', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);

    if (!q) {
      return res.status(400).json({ error: '缺少搜索关键词 q' });
    }

    const db = getDatabase();
    const results = db
      .select()
      .from(stock)
      .where(
        q.match(/^\d{6}$/)
          ? eq(stock.code, q) // 6 位数字精确匹配代码
          : sql`${stock.name} LIKE ${'%' + q + '%'}`, // 其他模糊匹配名称
      )
      .limit(limit)
      .all();

    res.json({ data: results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/v1/stocks/:code/quote — 个股实时行情详情 ─────
// #87

app.get('/api/v1/stocks/:code/quote', async (req, res) => {
  try {
    const { code } = req.params;
    const db = getDatabase();

    const stockInfo = db
      .select()
      .from(stock)
      .where(eq(stock.code, code))
      .get();

    if (!stockInfo) {
      return res.status(404).json({ error: `股票 ${code} 不存在` });
    }

    // 最近 5 天行情
    const recentDaily = db
      .select()
      .from(dailyInfo)
      .where(eq(dailyInfo.code, code))
      .orderBy(desc(dailyInfo.date))
      .limit(5)
      .all();

    // 最新分析报告
    const latestAnalysis = db
      .select()
      .from(dailyAnalysisReport)
      .where(eq(dailyAnalysisReport.code, code))
      .orderBy(desc(dailyAnalysisReport.date))
      .limit(1)
      .get();

    // 最新最终报告
    const latestFinal = db
      .select()
      .from(finalReport)
      .where(eq(finalReport.code, code))
      .orderBy(desc(finalReport.date))
      .limit(1)
      .get();

    res.json({
      data: {
        ...stockInfo,
        recentDaily,
        analysis: latestAnalysis
          ? { date: latestAnalysis.date, summary: latestAnalysis.summary, signals: latestAnalysis.signals }
          : null,
        finalReport: latestFinal
          ? { date: latestFinal.date, summary: latestFinal.summary, anomalyScore: latestFinal.anomalyScore }
          : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/v1/overview — 聚合概览 ────────────────────────
// #89

app.get('/api/v1/overview', async (req, res) => {
  try {
    const db = getDatabase();

    const totalStocks = db.select({ count: sql<number>`count(*)` }).from(stock).get()?.count ?? 0;
    const totalPools = db.select({ count: sql<number>`count(*)` }).from(pool).get()?.count ?? 0;

    const pools = db
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
      .all();

    // 最近分析日期
    const latestAnalysis = db
      .select({ date: dailyAnalysisReport.date })
      .from(dailyAnalysisReport)
      .orderBy(desc(dailyAnalysisReport.date))
      .limit(1)
      .get();

    res.json({
      data: {
        version: VERSION,
        totalStocks,
        totalPools,
        pools,
        latestAnalysisDate: latestAnalysis?.date ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/v1/pools — 股池列表（完整字段）───────────────

app.get('/api/v1/pools', async (_req, res) => {
  try {
    const db = getDatabase();
    const rows = db
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
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/v1/pools/:id/stocks — 池中股票列表 ──────────

app.get('/api/v1/pools/:id/stocks', async (req, res) => {
  try {
    const poolId = parseInt(req.params.id, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({ error: '无效的股池 ID' });
    }
    const db = getDatabase();
    const rows = db
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
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/v1/analysis/batch — 批量获取股票最新分析 ────

app.get('/api/v1/analysis/batch', async (req, res) => {
  try {
    const codesParam = (req.query.codes as string || '').trim();
    if (!codesParam) {
      return res.status(400).json({ error: '缺少 codes 参数（逗号分隔）' });
    }
    const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) {
      return res.json({ data: [] });
    }

    const db = getDatabase();
    const results: { code: string; summary: string | null; signals: string | null; date: string | null }[] = [];

    for (const code of codes) {
      const report = db
        .select({
          summary: dailyAnalysisReport.summary,
          signals: dailyAnalysisReport.signals,
          date: dailyAnalysisReport.date,
        })
        .from(dailyAnalysisReport)
        .where(eq(dailyAnalysisReport.code, code))
        .orderBy(desc(dailyAnalysisReport.date))
        .limit(1)
        .get();

      if (report) {
        results.push({ code, summary: report.summary, signals: report.signals, date: report.date });
      } else {
        results.push({ code, summary: null, signals: null, date: null });
      }
    }

    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/v1/analysis/run — 分析执行与数据刷新 ────────
// #88

app.post('/api/v1/analysis/run', async (req, res) => {
  try {
    const { codes, force } = req.body;
    const stockCodes: string[] = Array.isArray(codes) ? codes : [];

    if (stockCodes.length === 0) {
      return res.status(400).json({ error: '缺少 codes（股票代码数组）' });
    }

    let completed = 0;
    const errors: { code: string; error: string }[] = [];

    for (const code of stockCodes) {
      try {
        await executeTools.runFullPipeline(code, force ?? false);
        completed++;
      } catch (err) {
        errors.push({ code, error: (err as Error).message });
      }
    }

    res.json({
      data: {
        total: stockCodes.length,
        succeeded: completed,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/v1/stocks/repair-names — 修复已损坏的股票名称 ──

app.post('/api/v1/stocks/repair-names', async (_req, res) => {
  try {
    const allStocks = await stockService.listAllStocks();
    let repaired = 0;
    const errors: { code: string; error: string }[] = [];

    for (const s of allStocks) {
      try {
        const { name } = await dailyInfoService.fetchRealTimeQuote(s.code);
        if (name && name !== s.name) {
          await stockService.upsertStock(s.code, name, s.currentPrice);
          repaired++;
        }
      } catch (err) {
        errors.push({ code: s.code, error: (err as Error).message });
      }
    }

    res.json({
      data: {
        total: allStocks.length,
        repaired,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── 启动服务器 ──────────────────────────────────────────────

const PORT = parseInt(process.env.API_PORT || '3721', 10);

export function startApiServer(port?: number): void {
  const listenPort = port ?? PORT;
  app.listen(listenPort, () => {
    console.log(`[api] REST API 服务已启动: http://0.0.0.0:${listenPort}`);
    console.log(`[api] 端点列表:`);
    console.log(`  GET  /api/v1/stocks/search?q=关键词`);
    console.log(`  GET  /api/v1/stocks/:code/quote`);
    console.log(`  GET  /api/v1/overview`);
    console.log(`  GET  /api/v1/pools`);
    console.log(`  GET  /api/v1/pools/:id/stocks`);
    console.log(`  GET  /api/v1/analysis/batch?codes=`);
    console.log(`  POST /api/v1/analysis/run`);
    console.log(`  POST /api/v1/stocks/repair-names`);
  });
}

export default app;
