#!/usr/bin/env node
/**
 * E2E 端到端测试 — 真实 API 调用
 *
 * 测试内容：
 *   1. 腾讯财经接口：获取股票日行情
 *   2. 数据库写入与查询
 *   3. LM Studio LLM 调用
 *   4. DashScope 舆情搜索
 *   5. Embedding 向量化
 *   6. 完整流水线 Stage 1~5
 *
 * 用法：
 *   npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts
 *   npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts --skip-pipeline  # 跳过耗时流水线
 *   npx tsx packages/server/tests/e2e/full-pipeline.e2e.ts --stock 000001   # 指定股票
 */

import { initDatabase, getDatabase, closeDatabase } from '../../src/db/index.js';
import { ensureDatabase } from '../../src/db/migrate.js';
import * as stockService from '../../src/services/stock.js';
import * as dailyInfoService from '../../src/services/daily-info.js';
import * as llmService from '../../src/services/llm.js';
import * as sentimentService from '../../src/services/sentiment.js';
import * as embeddingService from '../../src/services/embedding.js';
import * as sessionService from '../../src/services/session.js';
import * as pipeline from '../../src/services/pipeline.js';
import { eq } from 'drizzle-orm';
import { stock, dailyInfo } from '../../src/db/schema.js';

// ─── 配置 ──────────────────────────────────────────────────

const STOCK_CODE = process.argv.includes('--stock')
  ? process.argv[process.argv.indexOf('--stock') + 1]
  : '600519';

const SKIP_PIPELINE = process.argv.includes('--skip-pipeline');

let passed = 0;
let failed = 0;
let errors: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function assertAsync<T>(promise: Promise<T>, msg: string): Promise<T> {
  try {
    const result = await promise;
    passed++;
    console.log(`  ✓ ${msg}`);
    return result;
  } catch (err) {
    failed++;
    errors.push(`${msg}: ${(err as Error).message}`);
    console.log(`  ✗ ${msg}: ${(err as Error).message}`);
    throw err;
  }
}

// ─── 测试入口 ──────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  Fi-Pool-Manager E2E 端到端测试');
  console.log(`  股票: ${STOCK_CODE}  流水线: ${SKIP_PIPELINE ? '跳过' : '执行'}`);
  console.log('══════════════════════════════════════════════');
  console.log('');

  // 1. 数据库初始化
  console.log('─── 1. 数据库初始化 ───');
  const db = ensureDatabase();
  assert(!!db, '数据库初始化成功');

  // 2. 腾讯财经 API 测试
  console.log('\n─── 2. 腾讯财经 API ───');
  let quote: { price: number; name: string } | null = null;
  try {
    quote = await dailyInfoService.fetchRealTimeQuote(STOCK_CODE);
    assert(!!quote, `获取实时报价: ${quote?.name} @ ${quote?.price}`);
    assert(quote!.price > 0, `价格有效: ${quote!.price}`);
    assert(quote!.name.length > 0, `股票名称非空: ${quote!.name}`);
  } catch (err) {
    failed++;
    errors.push(`实时报价失败: ${(err as Error).message}`);
    console.log(`  ✗ 获取实时报价失败: ${(err as Error).message}`);
  }

  let klineData: any[] = [];
  try {
    klineData = await dailyInfoService.fetchFromTencent(STOCK_CODE);
    assert(klineData.length >= 10, `日K线数据 >= 10 条: ${klineData.length}`);
    if (klineData.length > 0) {
      assert(klineData[0].date && klineData[0].close > 0, 'K线数据格式正确（date + close）');
    }
  } catch (err) {
    failed++;
    errors.push(`日K线获取失败: ${(err as Error).message}`);
    console.log(`  ✗ 获取日K线失败: ${(err as Error).message}`);
  }

  // 3. 数据库写入测试
  console.log('\n─── 3. 数据库写入与查询 ───');
  try {
    // Upsert stock
    await stockService.upsertStock(STOCK_CODE, quote?.name || 'E2E测试', quote?.price || 0);
    const s = await stockService.getStockByCode(STOCK_CODE);
    assert(!!s, `stock 表写入成功: ${s?.code}`);
    assert(s!.currentPrice > 0, `股价已更新: ${s!.currentPrice}`);

    // Upsert daily info
    if (klineData.length > 0) {
      const records = klineData.map((k: any) => ({
        code: STOCK_CODE,
        date: k.date,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
      }));
      const inserted = await dailyInfoService.upsertDailyInfo(records);
      assert(inserted > 0, `daily_info 写入 ${inserted} 条记录`);
    }

    // Query back
    const daily = await dailyInfoService.getDailyInfo(STOCK_CODE);
    assert(daily.length > 0, `daily_info 查询成功: ${daily.length} 条`);
  } catch (err) {
    failed++;
    errors.push(`数据库操作失败: ${(err as Error).message}`);
    console.log(`  ✗ 数据库操作失败: ${(err as Error).message}`);
  }

  // 4. LM Studio LLM 测试
  console.log('\n─── 4. LM Studio LLM ───');
  try {
    const connected = await llmService.checkConnection();
    assert(connected, 'LM Studio 连接正常');

    const models = await llmService.listModels();
    assert(models.length > 0, `模型列表: ${models.length} 个`);

    const reply = await llmService.chatCompletion({
      messages: [{ role: 'user', content: `请用一句话介绍${STOCK_CODE}（仅回答，不超过20字）` }],
      maxTokens: 100,
      temperature: 0.3,
    });
    assert(reply.length > 0, `LLM 回复成功: "${reply.slice(0, 50)}..."`);
  } catch (err) {
    failed++;
    errors.push(`LLM 调用失败: ${(err as Error).message}`);
    console.log(`  ✗ LLM 调用失败: ${(err as Error).message}`);
  }

  // 5. Embedding 测试
  console.log('\n─── 5. Embedding 向量化 ───');
  try {
    const vector = await embeddingService.getEmbedding('E2E测试样本数据');
    assert(vector.length > 0, `向量生成成功: ${vector.length} 维`);
    assert(Math.abs(vector[0]) > 0, '向量值非零');
  } catch (err) {
    failed++;
    errors.push(`Embedding 失败: ${(err as Error).message}`);
    console.log(`  ✗ Embedding 失败: ${(err as Error).message}`);
  }

  // 6. DashScope 舆情测试
  console.log('\n─── 6. DashScope 舆情搜索 ───');
  try {
    const sr = await sentimentService.fetchSentiment(STOCK_CODE, quote?.name || '');
    assert(sr.report.length > 0, `舆情报告生成成功: ${sr.report.length} 字`);
    if (sr.sources.length > 0) {
      console.log(`     来源: ${sr.sources.join(', ')}`);
    }
  } catch (err) {
    failed++;
    errors.push(`舆情搜索失败: ${(err as Error).message}`);
    console.log(`  ✗ 舆情搜索失败: ${(err as Error).message}`);
  }

  // 7. 完整流水线测试
  if (!SKIP_PIPELINE) {
    console.log('\n─── 7. 完整流水线 Stage 1~5 ───');
    try {
      const result = await pipeline.runFullPipeline(STOCK_CODE);
      assert(!!result.date, `流水线完成，日期: ${result.date}`);
      assert(result.pipelineId.length > 0, `Pipeline ID: ${result.pipelineId}`);
      console.log(`     耗时较长，请查看上方各 Stage 日志`);
    } catch (err) {
      failed++;
      errors.push(`流水线失败: ${(err as Error).message}`);
      console.log(`  ✗ 流水线失败: ${(err as Error).message}`);
    }
  } else {
    console.log('\n─── 7. 完整流水线 ─── (--skip-pipeline，跳过)');
  }

  // ─── 汇总 ────────────────────────────────────────────────
  const total = passed + failed;
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log(`  结果: ${passed}/${total} 通过 | ${failed} 失败`);
  if (errors.length > 0) {
    console.log('');
    console.log('  失败明细:');
    errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }
  console.log('══════════════════════════════════════════════');
  console.log('');

  closeDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E 测试崩溃:', err);
  closeDatabase();
  process.exit(1);
});
