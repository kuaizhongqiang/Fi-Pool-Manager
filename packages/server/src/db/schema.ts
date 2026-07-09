/**
 * Drizzle ORM Schema — Fi-Pool-Manager
 *
 * 12 张表定义，与 docs/database-schema.md 完全对应。
 * 使用 drizzle-orm/sqlite-core 定义 SQLite 表结构。
 *
 * 表清单：
 * - pool                       股池
 * - pool_stock                 股池与股票关联（M:N）
 * - stock                      股票基础信息
 * - daily_info                 日行情数据
 * - daily_analysis_report      客观分析报告
 * - sentiment_report           舆情报告
 * - analysis_roler             多角色发言记录
 * - final_report               最终报告（含 anomaly_score）
 * - daily_summary_detail       每日异常股票逐维度分析明细
 * - daily_summary              每日综述最终报告
 * - config                     系统配置
 * - vec_embedding              向量数据
 * - pipeline_runs              流水线运行记录（#142/#141）
 *
 * 迁移命令：
 *   npm run db:generate   生成迁移文件
 *   npm run db:migrate    执行迁移
 */

import { sqliteTable, text, integer, real, blob, uniqueIndex, index, AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// ─── Pool 股池 ───────────────────────────────────────────────

export const pool = sqliteTable('pool', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  desc: text('desc').notNull().default(''),
  poolAnalysis: text('pool_analysis').notNull().default(''),
  poolSignal: integer('pool_signal').notNull().default(0), // -1:看空, 0:中性, 1:看多
  createdAt: text('created_at').notNull().default("datetime('now')"),
  updatedAt: text('updated_at').notNull().default("datetime('now')"),
}, (table) => ({
  nameIdx: index('idx_pool_name').on(table.name),
  signalIdx: index('idx_pool_signal').on(table.poolSignal),
}));

// ─── Stock 股票基础信息 ─────────────────────────────────────

export const stock = sqliteTable('stock', {
  code: text('code').primaryKey(), // 6位代码，如 '600519'
  name: text('name').notNull(),
  currentPrice: real('current_price').notNull().default(0),
  updatedAt: text('updated_at').notNull().default("datetime('now')"),
}, (table) => ({
  nameIdx: index('idx_stock_name').on(table.name),
}));

// ─── PoolStock 股池与股票的关联（M:N）──────────────────────

export const poolStock = sqliteTable('pool_stock', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  poolId: integer('pool_id').notNull().references(() => pool.id),
  stockCode: text('stock_code').notNull().references(() => stock.code),
  addedAt: text('added_at').notNull().default("datetime('now')"),
}, (table) => ({
  uniqueIdx: uniqueIndex('idx_pool_stock_unique').on(table.poolId, table.stockCode),
  poolIdx: index('idx_pool_stock_pool').on(table.poolId),
  stockIdx: index('idx_pool_stock_stock').on(table.stockCode),
}));

// ─── DailyInfo 日行情数据 ──────────────────────────────────

export const dailyInfo = sqliteTable('daily_info', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().references(() => stock.code),
  date: text('date').notNull(), // 'yyyy-MM-dd'
  open: real('open').notNull(),
  high: real('high').notNull(),
  low: real('low').notNull(),
  close: real('close').notNull(),
  volume: integer('volume').notNull(), // 股数
}, (table) => ({
  codeDateUnique: uniqueIndex('idx_daily_info_unique').on(table.code, table.date),
  codeIdx: index('idx_daily_info_code').on(table.code),
  dateIdx: index('idx_daily_info_date').on(table.date),
}));

// ─── DailyAnalysisReport 客观分析报告 ──────────────────────

export const dailyAnalysisReport = sqliteTable('daily_analysis_report', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().references(() => stock.code),
  date: text('date').notNull(), // 'yyyy-MM-dd'
  summary: text('summary').notNull().default(''), // 文本摘要
  indicators: text('indicators').notNull().default('{}'), // JSON: 结构化指标数据
  signals: text('signals').notNull().default('{}'), // JSON: 信号标记
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  codeDateUnique: uniqueIndex('idx_dar_unique').on(table.code, table.date),
  codeIdx: index('idx_dar_code').on(table.code),
  dateIdx: index('idx_dar_date').on(table.date),
}));

// ─── SentimentReport 舆情报告 ──────────────────────────────

export const sentimentReport = sqliteTable('sentiment_report', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().references(() => stock.code),
  date: text('date').notNull(), // 'yyyy-MM-dd'
  report: text('report').notNull().default(''),
  sources: text('sources').notNull().default('[]'), // JSON: 来源列表
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  codeDateUnique: uniqueIndex('idx_sr_unique').on(table.code, table.date),
  codeIdx: index('idx_sr_code').on(table.code),
  dateIdx: index('idx_sr_date').on(table.date),
}));

// ─── AnalysisRoler 多角色发言记录 ─────────────────────────

export const analysisRoler = sqliteTable('analysis_roler', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().references(() => stock.code),
  date: text('date').notNull(), // 'yyyy-MM-dd'
  role: text('role').notNull(), // 角色名
  responsibility: text('responsibility').notNull().default(''),
  report: text('report').notNull().default(''),
  round: integer('round').notNull().default(1), // 第几轮
  wordCount: integer('word_count').notNull().default(0), // 实际字数
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  codeDateIdx: index('idx_ar_code_date').on(table.code, table.date),
  roleIdx: index('idx_ar_role').on(table.role),
}));

// ─── FinalReport 最终报告 ──────────────────────────────────

export const finalReport = sqliteTable('final_report', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().references(() => stock.code),
  date: text('date').notNull(), // 'yyyy-MM-dd'
  summary: text('summary').notNull().default(''), // overview 内容
  fullReport: text('full_report').notNull().default(''), // full 内容
  roleSummary: text('role_summary').notNull().default('[]'), // JSON: 各角色核心观点
  pipelineId: text('pipeline_id').notNull().default(''), // 流水线运行 ID
  anomalyScore: real('anomaly_score').notNull().default(1.0), // 异常偏移值，1=正常，越大越异常
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  codeDateUnique: uniqueIndex('idx_fr_unique').on(table.code, table.date),
  codeIdx: index('idx_fr_code').on(table.code),
  dateIdx: index('idx_fr_date').on(table.date),
}));

// ─── DailySummaryDetail 每日异常股票逐维度分析 ──────────────

export const dailySummaryDetail = sqliteTable('daily_summary_detail', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stockCode: text('stock_code').notNull(), // 股票代码
  date: text('date').notNull(), // 'yyyy-MM-dd'
  dimension: text('dimension').notNull(), // 'price' | 'sentiment' | 'volume' | 'sector'
  anomalyDesc: text('anomaly_desc').notNull().default(''), // 该维度异常描述
  anomalyScore: real('anomaly_score').notNull().default(1.0), // 该维度异常分
  keyFindings: text('key_findings').notNull().default(''), // 关键发现
  pipelineId: text('pipeline_id').notNull().default(''),
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  dateIdx: index('idx_dsd_date').on(table.date),
  stockDateIdx: index('idx_dsd_stock_date').on(table.stockCode, table.date),
  dimensionIdx: index('idx_dsd_dimension').on(table.dimension),
  stockDateDimUnique: uniqueIndex('idx_dsd_unique').on(table.stockCode, table.date, table.dimension),
}));

// ─── DailySummary 每日综述最终报告 ─────────────────────────

export const dailySummary = sqliteTable('daily_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(), // 'yyyy-MM-dd'
  anomalyCount: integer('anomaly_count').notNull().default(0), // 异常股票数量
  totalStocks: integer('total_stocks').notNull().default(0), // 股池总股票数
  fullReport: text('full_report').notNull().default(''), // 完整报告
  overview: text('overview').notNull().default(''), // 概述（200 字内）
  pipelineIds: text('pipeline_ids').notNull().default('[]'), // 关联的流水线 ID 列表 JSON
  modelUsed: text('model_used').notNull().default(''), // 使用的 LLM 模型名
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  dateIdx: index('idx_ds_date').on(table.date),
}));

// ─── Config 系统配置 ──────────────────────────────────────

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at').notNull().default("datetime('now')"),
});

// ─── VecEmbedding 向量数据 ────────────────────────────────

export const vecEmbedding = sqliteTable('vec_embedding', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentType: text('content_type').notNull(), // 'analysis' | 'final' | 'daily_detail' | 'daily_summary'
  contentCode: text('content_code').notNull(), // 股票代码
  contentDate: text('content_date').notNull(), // 报告日期
  contentText: text('content_text').notNull(), // 原始文本（用于溯源）
  embedding: blob('embedding'), // 向量数据（sqlite-vec）
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  typeIdx: index('idx_ve_type').on(table.contentType),
  codeIdx: index('idx_ve_code').on(table.contentCode),
  typeCodeDateIdx: index('idx_ve_type_code_date').on(table.contentType, table.contentCode, table.contentDate),
}));

// ─── PipelineRun 流水线运行记录（#142 pipeline-log / #141 ETA）───

export const pipelineRun = sqliteTable('pipeline_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().unique(), // 如 'pool-run-xxxx'
  date: text('date').notNull(), // 运行日期 yyyy-MM-dd
  mode: text('mode').notNull().default('full'), // 'full' | 'force' | 'missing'
  poolIds: text('pool_ids').notNull().default('[]'), // JSON: 股池 ID 数组
  totalStocks: integer('total_stocks').notNull().default(0),
  completedStocks: integer('completed_stocks').notNull().default(0),
  failedStocks: integer('failed_stocks').notNull().default(0),
  skippedStocks: integer('skipped_stocks').notNull().default(0),
  status: text('status').notNull().default('running'), // 'running' | 'completed' | 'cancelled' | 'crashed'
  durationSeconds: real('duration_seconds'), // 总耗时（秒），完成时写入
  avgStockDuration: real('avg_stock_duration'), // 平均每只耗时（秒）
  args: text('args').notNull().default(''), // 启动参数快照
  startedAt: text('started_at').notNull().default("datetime('now')"),
  finishedAt: text('finished_at'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  dateIdx: index('idx_pr_date').on(table.date),
  statusIdx: index('idx_pr_status').on(table.status),
  runIdIdx: index('idx_pr_run_id').on(table.runId),
}));