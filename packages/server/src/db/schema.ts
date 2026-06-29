/**
 * Drizzle ORM Schema — Fi-Pool-Manager
 *
 * 10 张表定义，与 docs/database-schema.md 完全对应。
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
 * - final_report               最终报告
 * - config                     系统配置
 * - vec_embedding              向量数据
 *
 * 迁移命令：
 *   npm run db:generate   生成迁移文件
 *   npm run db:migrate    执行迁移
 */

import { sqliteTable, text, integer, real, blob, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

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
  createdAt: text('created_at').notNull().default("datetime('now')"),
}, (table) => ({
  codeDateUnique: uniqueIndex('idx_fr_unique').on(table.code, table.date),
  codeIdx: index('idx_fr_code').on(table.code),
  dateIdx: index('idx_fr_date').on(table.date),
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
  contentType: text('content_type').notNull(), // 'analysis' | 'final'
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
