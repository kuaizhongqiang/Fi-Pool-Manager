/**
 * 命令类工具（Command）
 *
 * 封装报告输出、语义搜索和会话管理等功能。
 * 返回值均为复合结构，包含完整或摘要的内容。
 *
 * @module tools/command
 */

import { getDatabase } from '../db/index.js';
import {
  dailyAnalysisReport,
  finalReport,
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import * as poolService from '../services/pool.js';
import * as embeddingService from '../services/embedding.js';
import * as sessionService from '../services/session.js';

/**
 * 输出指定股票指定日期的客观分析报告。
 *
 * @param code - 股票代码
 * @param date - 报告日期 'yyyy-MM-dd'
 * @param mode - 输出模式：
 *   - 'overview'：仅返回 code、date、summary 摘要字段
 *   - 'full'（默认）：返回完整报告（含 indicators、signals JSON）
 * @returns 包含 code、date、summary 的报告对象，不存在时返回 null
 *
 * @example
 * const report = await outputAnalysisReport('600519', '2024-06-01', 'full');
 * if (report) console.log(report.summary);
 */
export async function outputAnalysisReport(
  code: string,
  date: string,
  mode: 'overview' | 'full' = 'full',
) {
  const db = getDatabase();
  const row = db
    .select()
    .from(dailyAnalysisReport)
    .where(
      and(
        eq(dailyAnalysisReport.code, code),
        eq(dailyAnalysisReport.date, date),
      ),
    )
    .get();

  if (!row) return null;

  const base = {
    code: row.code,
    date: row.date,
    summary: row.summary,
    createdAt: row.createdAt,
  };

  if (mode === 'overview') return base;

  return {
    ...base,
    id: row.id,
    indicators: row.indicators,
    signals: row.signals,
  };
}

/**
 * 输出指定股票指定日期的最终报告。
 *
 * @param code - 股票代码
 * @param date - 报告日期 'yyyy-MM-dd'
 * @param mode - 输出模式：
 *   - 'overview'：仅返回 code、date、summary、pipelineId 摘要字段
 *   - 'full'（默认）：返回完整报告（含 fullReport、roleSummary）
 * @returns 包含 code、date 的报告对象，不存在时返回 null
 *
 * @example
 * const report = await outputFinalReport('600519', '2024-06-01', 'overview');
 */
export async function outputFinalReport(
  code: string,
  date: string,
  mode: 'overview' | 'full' = 'full',
) {
  const db = getDatabase();
  const row = db
    .select()
    .from(finalReport)
    .where(
      and(
        eq(finalReport.code, code),
        eq(finalReport.date, date),
      ),
    )
    .get();

  if (!row) return null;

  const base = {
    code: row.code,
    date: row.date,
    summary: row.summary,
    pipelineId: row.pipelineId,
    createdAt: row.createdAt,
  };

  if (mode === 'overview') return base;

  // 尝试解析 roleSummary JSON，失败则返回原始字符串
  let roleSummary: string | { role: string; keyPoint: string }[] = row.roleSummary;
  try {
    roleSummary = JSON.parse(row.roleSummary);
  } catch {
    // 保持原始字符串
  }

  return {
    ...base,
    id: row.id,
    fullReport: row.fullReport,
    roleSummary,
  };
}

/**
 * 输出指定股池的综合分析报告。
 *
 * @param poolId - 股池 ID
 * @param mode - 输出模式：
 *   - 'overview'：仅输出股池摘要信息和股票列表
 *   - 'full'（默认）：输出完整报告（含每只股票的最新分析摘要）
 * @returns 包含 poolId、name 的股池报告对象，股池不存在时返回 null
 *
 * @example
 * const r = await outputPoolReport(1, 'overview');
 */
export async function outputPoolReport(poolId: number, mode: 'overview' | 'full' = 'full') {
  const poolInfo = await poolService.getPoolById(poolId);
  if (!poolInfo) return null;

  const stocksInPool = await poolService.getPoolStocks(poolId);

  const db = getDatabase();
  const stockSummaries = await Promise.all(
    stocksInPool.map(async (s) => {
      const latestAnalysis = db
        .select({
          date: dailyAnalysisReport.date,
          summary: dailyAnalysisReport.summary,
          signals: dailyAnalysisReport.signals,
        })
        .from(dailyAnalysisReport)
        .where(eq(dailyAnalysisReport.code, s.code))
        .orderBy(desc(dailyAnalysisReport.date))
        .limit(1)
        .get();

      let signal = 0;
      if (latestAnalysis?.signals) {
        try {
          const parsed = JSON.parse(latestAnalysis.signals);
          if (parsed.goldenCross) signal = 1;
          else if (parsed.deadCross) signal = -1;
        } catch {
          // ignore
        }
      }

      return {
        code: s.code,
        name: s.name,
        currentPrice: s.currentPrice,
        signal,
        latestAnalysisDate: latestAnalysis?.date || null,
        summary: latestAnalysis?.summary?.slice(0, 200) || null,
      };
    }),
  );

  const base = {
    poolId: poolInfo.id,
    poolName: poolInfo.name,
    poolDesc: poolInfo.desc,
    poolSignal: poolInfo.poolSignal,
    stockCount: stockSummaries.length,
    stocks: stockSummaries,
  };

  if (mode === 'overview') {
    const bullish = stockSummaries.filter((s) => s.signal === 1).length;
    const bearish = stockSummaries.filter((s) => s.signal === -1).length;
    return {
      ...base,
      summary: `股池共 ${base.stockCount} 只股票，看多 ${bullish} 只，看空 ${bearish} 只，中性 ${base.stockCount - bullish - bearish} 只。`,
    };
  }

  return base;
}

/**
 * 基于语义相似度搜索历史分析报告。
 *
 * 通过向量嵌入技术，搜索与查询文本语义相似的分析报告或最终报告。
 *
 * @param query - 搜索查询文本
 * @param limit - 最多返回结果数，默认 10
 * @param type - 搜索范围：
 *   - 'analysis'：仅搜索客观分析报告
 *   - 'final'：仅搜索最终报告
 *   - 'all'（默认）：搜索全部类型
 * @returns 搜索结果数组，按相关性降序排列
 *
 * @example
 * const results = await semanticSearch('贵州茅台', 5, 'final');
 * results.forEach(r => console.log(r.code, r.date, r.relevance));
 */
export async function semanticSearch(
  query: string,
  limit: number = 10,
  type: 'analysis' | 'final' | 'all' = 'all',
) {
  const searchType = type === 'all' ? undefined : type;
  return embeddingService.searchSimilar({
    query,
    type: searchType,
    limit,
  });
}

/**
 * 管理 LLM 会话。
 *
 * 支持新建、切换、列出全部和查看当前会话四种操作。
 *
 * @param action - 操作类型：
 *   - 'new'：创建新会话
 *   - 'switch'：切换到指定会话（不存在时自动创建）
 *   - 'list'：列出所有会话
 *   - 'current'：查看当前会话信息
 * @param sessionId - 切换到指定会话时的 ID（action 为 'switch' 时必填）
 * @returns 会话操作结果对象
 *
 * @example
 * // 创建新会话
 * const s1 = await sessionManage('new');
 * // 切换到已有会话
 * const s2 = await sessionManage('switch', 'a1b2c3d4');
 * // 列出所有会话
 * const list = await sessionManage('list');
 * // 查看当前会话
 * const cur = await sessionManage('current');
 */
export async function sessionManage(
  action: 'new' | 'switch' | 'list' | 'current',
  sessionId?: string,
) {
  switch (action) {
    case 'new': {
      const id = sessionService.createSession();
      return {
        action: 'new' as const,
        sessionId: id,
        createdAt: new Date().toISOString(),
      };
    }

    case 'switch': {
      if (!sessionId) {
        throw new Error('switch 操作需要提供 sessionId 参数');
      }
      const result = sessionService.switchSession(sessionId);
      return {
        action: 'switch' as const,
        sessionId: result.sessionId,
        previousId: result.previousId,
      };
    }

    case 'list': {
      const sessions = sessionService.listSessions();
      return {
        action: 'list' as const,
        count: sessions.length,
        sessions,
      };
    }

    case 'current': {
      const current = sessionService.getCurrentSession();
      return {
        action: 'current' as const,
        session: current
          ? {
              id: current.id,
              createdAt: current.createdAt,
              messageCount: current.messages.length,
            }
          : null,
      };
    }

    default:
      throw new Error(`未知的会话操作: ${action}`);
  }
}
