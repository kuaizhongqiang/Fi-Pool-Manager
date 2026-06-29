/**
 * Drizzle ORM Schema
 *
 * 数据库表定义，与 docs/database-schema.md 对应。
 * 使用 drizzle-orm/sqlite-core 定义 SQLite 表结构。
 *
 * 表清单：
 * - pool            股池
 * - pool_stock      股池与股票关联
 * - stock           股票基础信息
 * - daily_info      日行情数据
 * - daily_analysis_report  客观分析报告
 * - sentiment_report       舆情报告
 * - analysis_roler         多角色发言记录
 * - final_report           最终报告
 * - config                 系统配置
 * - vec_embedding          向量数据
 *
 * 迁移命令：
 *   npm run db:generate   生成迁移文件
 *   npm run db:migrate    执行迁移
 */

import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

// TODO: 实现各表定义
