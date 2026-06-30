/**
 * fi-pool-server
 * Fi-Pool-Manager 核心服务入口
 *
 * 数据获取（腾讯财经接口）
 * 本地技术指标计算
 * LLM 分析引擎（LM Studio）
 * 向量检索
 * 舆情搜索（DashScope）
 * 数据库访问（Drizzle ORM + SQLite）
 *
 * 使用方式：
 * ```typescript
 * import { initDatabase, queryTools, managerTools } from 'fi-pool-server';
 *
 * await initDatabase();
 * const pools = await queryTools.listPools();
 * const result = await managerTools.createPool('我的股池');
 * ```
 *
 * 工具模块分类：
 * - managerTools   — 股池管理（创建/删除/更新），返回 { success, data/error }
 * - queryTools     — 数据查询（直接返回数据，不包装）
 * - commandTools   — 报告输出与操作型接口
 * - executeTools   — 流水线执行（返回 { success, data/error }）
 * - auxiliaryTools — 辅助功能（帮助、配置、状态）
 *
 * @module fi-pool-server
 */

// ─── 数据库 ────────────────────────────────────────────────────

export { initDatabase, getDatabase, closeDatabase, getDbPath } from './db/index.js';
export { ensureDatabase } from './db/migrate.js';

// ─── 数据库 Schema（供外部高级使用）─────────────────────────

export * from './db/schema.js';

// ─── 工具模块 ──────────────────────────────────────────────────

export * as managerTools from './tools/manager.js';
export * as queryTools from './tools/query.js';
export * as commandTools from './tools/command.js';
export * as executeTools from './tools/execute.js';
export * as auxiliaryTools from './tools/auxiliary.js';

// ─── 核心服务（供深度集成使用）───────────────────────────────

export * as stockService from './services/stock.js';
export * as poolService from './services/pool.js';
export * as dailyInfoService from './services/daily-info.js';
export * as analysisService from './services/analysis.js';
export * as llmService from './services/llm.js';
export * as sentimentService from './services/sentiment.js';
export * as sessionService from './services/session.js';
export * as wordCountService from './services/word-count.js';
export * as embeddingService from './services/embedding.js';
export * as dailySummaryService from './services/daily-summary.js';

// ─── 流水线编排器（独立入口点）─────────────────────────────

export { runFullPipeline, runLocalAnalysis, stage1FetchData } from './services/pipeline.js';

// ─── 版本号（从 package.json 读取，保持与发布版本同步）──────

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = resolve(__dirname, '../package.json');

let VERSION = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  VERSION = pkg.version || VERSION;
} catch {
  // 无法读取时保持默认
}

export { VERSION };
