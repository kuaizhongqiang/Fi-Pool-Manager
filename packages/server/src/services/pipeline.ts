/**
 * 流水线编排器
 *
 * 将数据获取、LLM 分析、舆情搜索、多角色讨论和最终报告
 * 组装为可执行的个股分析流水线。
 *
 * @module services/pipeline
 */

// ─── 导入 ────────────────────────────────────────────────────────

import * as stockService from './stock.js';
import * as dailyInfoService from './daily-info.js';
import * as analysisService from './analysis.js';
import * as llmService from './llm.js';
import * as sentimentService from './sentiment.js';
import * as sessionService from './session.js';
import * as embeddingService from './embedding.js';

import { getDatabase } from '../db/index.js';
import {
  dailyAnalysisReport,
  sentimentReport,
  analysisRoler,
  finalReport,
} from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { OHLCV } from '../utils/indicators.js';
import { countWords } from './word-count.js';

// ─── 公开类型 ────────────────────────────────────────────────────

export interface Stage1Result {
  date: string;
  records: number;
}

export interface Stage2Result {
  id: number;
  summary: string;
  indicators: string;
  signals: string;
}

export interface Stage3Result {
  id: number;
  report: string;
  sources: string[];
}

export interface Stage4Result {
  roles: {
    id: number;
    role: string;
    report: string;
    round: number;
    wordCount: number;
  }[];
}

export interface Stage5Result {
  id: number;
  summary: string;
  fullReport: string;
  roleSummary: string;
  pipelineId: string;
}

export interface PipelineResult {
  date: string;
  pipelineId: string;
  finalReportId: number;
}

export interface LocalAnalysisResult {
  date: string;
  analysisReportId: number;
}

// ─── 角色配置 ────────────────────────────────────────────────────

interface RoleConfig {
  name: string;
  responsibility: string;
  wordLimitRound1: number;
  wordLimitRound2: number;
  systemPrompt: string;
}

const ROLES: RoleConfig[] = [
  {
    name: '技术分析师',
    responsibility: '技术指标解读',
    wordLimitRound1: 400,
    wordLimitRound2: 300,
    systemPrompt:
      '你是一位A股技术分析师。请专注于技术面分析，解读均线、MACD、RSI、KDJ、布林带等指标信号，分析量价关系和趋势形态。不要讨论基本面或消息面。',
  },
  {
    name: '基本面分析师',
    responsibility: '基本面评估',
    wordLimitRound1: 400,
    wordLimitRound2: 300,
    systemPrompt:
      '你是一位A股基本面分析师。请专注于基本面分析，包括估值水平、财务健康度、行业地位和成长性评估。结合行情数据推断基本面表现。不要讨论技术面或消息面。',
  },
  {
    name: '舆情分析师',
    responsibility: '市场情绪解读',
    wordLimitRound1: 300,
    wordLimitRound2: 200,
    systemPrompt:
      '你是一位A股舆情分析师。请专注于市场情绪和消息面解读，分析舆情对股价的潜在影响，判断当前市场情绪倾向。',
  },
  {
    name: '风控官',
    responsibility: '风险评估',
    wordLimitRound1: 300,
    wordLimitRound2: 300,
    systemPrompt:
      '你是一位A股风控官。请全面评估下行风险，关注流动性问题、估值泡沫风险、板块回调风险和个股利空因素，给出风险等级判断。',
  },
];

// ─── 辅助函数 ────────────────────────────────────────────────────

/**
 * 生成流水线唯一 ID。
 * 格式：{时间戳}-{随机6位hex}
 */
function generatePipelineId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 8);
  return `pipe-${ts}-${rand}`;
}

/**
 * 获取今日日期字符串（北京时间，yyyy-MM-dd 格式）。
 */
function getTodayDate(): string {
  const now = new Date();
  // 调整为北京时间（UTC+8）
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取会话当前消息列表。
 */
function getSessionMessages(
  sessionId: string,
): { role: string; content: string }[] {
  const session = sessionService.getSession(sessionId);
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }
  return session.messages;
}

/**
 * 将 OHLCV 数组格式化为紧凑表格字符串（用于 LLM prompt）。
 *
 * @param data    - OHLCV 数组（按日期升序）
 * @param maxRows - 最多显示的行数，不指定则全部显示
 * @returns 格式化字符串
 */
function formatOHLCVTable(data: OHLCV[], maxRows?: number): string {
  const rows = maxRows ? data.slice(-maxRows) : data;
  const lines: string[] = ['日期|开盘|收盘|最高|最低|成交量(股)'];

  for (const r of rows) {
    lines.push(
      `${r.date}|${r.open.toFixed(2)}|${r.close.toFixed(2)}|${r.high.toFixed(2)}|${r.low.toFixed(2)}|${r.volume}`,
    );
  }

  return lines.join('\n');
}

/**
 * 从 LLM 回复中尝试提取并解析 JSON。
 *
 * 处理以下格式：
 * 1. 纯 JSON 字符串
 * 2. ```json ... ``` 代码块包裹
 * 3. ``` ... ``` 代码块包裹（无 json 标记）
 * 4. 文本中包含 { ... } 对象
 *
 * @param text  - LLM 回复文本
 * @returns 解析成功的对象，失败时返回 null
 */
function parseLLMJsonResponse<T>(text: string): T | null {
  // 尝试直接解析
  try {
    return JSON.parse(text) as T;
  } catch {
    // 忽略
  }

  // 尝试从 markdown 代码块提取
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim()) as T;
    } catch {
      // 忽略
    }
  }

  // 尝试提取第一个 { ... } 对象
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {
      // 忽略
    }
  }

  return null;
}

// ─── Prompt 构造 ─────────────────────────────────────────────────

/**
 * 构造 Stage 2 客观分析 prompt。
 */
function buildObjectivePrompt(params: {
  code: string;
  name: string;
  dailyData: OHLCV[];
  prevReports: { summary: string; indicators: string }[];
  indicators: ReturnType<typeof analysisService.computeIndicators>;
  signals: ReturnType<typeof analysisService.computeSignals>;
}): string {
  const ohlcvTable = formatOHLCVTable(params.dailyData, 60);
  const prevContext =
    params.prevReports.length > 0
      ? params.prevReports
          .map(
            (r, i) =>
              `[前第 ${i + 1} 日报告]\n摘要: ${r.summary}\n指标: ${r.indicators}`,
          )
          .join('\n\n')
      : '无历史报告';

  return `你是一个客观的A股数据分析师。请基于以下数据生成一份客观分析报告，仅陈述客观事实和数据，不要给出投资建议。

[股票信息]
代码：${params.code}
名称：${params.name}

[最近 ${params.dailyData.length} 个交易日行情]
${ohlcvTable}

[技术指标摘要（最新交易日）]
- 涨跌幅: ${params.indicators.priceChangePct.toFixed(2)}%
- 振幅: ${params.indicators.amplitude.toFixed(2)}%
- MA5: ${params.indicators.ma.ma5 ?? 'N/A'} | MA10: ${params.indicators.ma.ma10 ?? 'N/A'} | MA20: ${params.indicators.ma.ma20 ?? 'N/A'} | MA60: ${params.indicators.ma.ma60 ?? 'N/A'}
- MACD: DIF=${params.indicators.macd.dif ?? 'N/A'} DEA=${params.indicators.macd.dea ?? 'N/A'} 柱=${params.indicators.macd.histogram ?? 'N/A'}
- RSI(6): ${params.indicators.rsi.rsi6 ?? 'N/A'} | RSI(14): ${params.indicators.rsi.rsi14 ?? 'N/A'}
- KDJ: K=${params.indicators.kdj.k ?? 'N/A'} D=${params.indicators.kdj.d ?? 'N/A'} J=${params.indicators.kdj.j ?? 'N/A'}
- 布林带: 上=${params.indicators.bb.upper ?? 'N/A'} 中=${params.indicators.bb.mid ?? 'N/A'} 下=${params.indicators.bb.lower ?? 'N/A'}

[信号检测]
- 金叉: ${params.signals.goldenCross}
- 死叉: ${params.signals.deadCross}
- 超买: ${params.signals.overbought}
- 超卖: ${params.signals.oversold}
- 放量: ${params.signals.volumeSpike}
- 量比: ${params.signals.volumeRatio.toFixed(2)}

[历史报告参考]
${prevContext}

请按以下JSON格式输出（仅输出JSON，不要额外文字）：
{
  "summary": "简洁的客观数据总结（500字以内，对比前一日指标变化）",
  "indicators": {
    "priceChangePct": 数值,
    "amplitude": 数值,
    "ma": { "ma5": 数值, "ma10": 数值, "ma20": 数值, "ma60": 数值 },
    "macd": { "dif": 数值, "dea": 数值, "histogram": 数值 },
    "rsi": { "rsi6": 数值, "rsi14": 数值 },
    "kdj": { "k": 数值, "d": 数值, "j": 数值 },
    "bb": { "upper": 数值, "mid": 数值, "lower": 数值 }
  },
  "signals": {
    "goldenCross": 布尔,
    "deadCross": 布尔,
    "overbought": 布尔,
    "oversold": 布尔,
    "volumeSpike": 布尔,
    "volumeRatio": 数值
  }
}`;
}

/**
 * 构造 Stage 4 单个角色的 prompt。
 */
function buildRolePrompt(params: {
  role: RoleConfig;
  code: string;
  name: string;
  darSummary: string;
  darIndicators: string;
  srReport?: string;
  previousSpeeches: string;
  round: number;
}): string {
  const roundSuffix =
    params.round === 2
      ? '\n\n如有不同意见，请明确反驳前序发言的观点并说明理由。'
      : '';

  const sentimentSection = params.srReport
    ? `\n[舆情报告]\n${params.srReport}`
    : '';

  return `${
    params.role.systemPrompt
  }${roundSuffix}

[股票信息]
代码：${params.code}
名称：${params.name}

[客观数据报告]
指标: ${params.darIndicators}
摘要: ${params.darSummary}${sentimentSection}

[前序发言]
${params.previousSpeeches || '无'}

请输出你的分析报告。字数限制：${
    params.round === 1
      ? params.role.wordLimitRound1
      : params.role.wordLimitRound2
  }字以内。`;
}

/**
 * 构造 Stage 5 最终报告 prompt。
 */
function buildFinalReportPrompt(params: {
  code: string;
  name: string;
  darSummary: string;
  darIndicators: string;
  srReport?: string;
  roleDiscussions: string;
}): string {
  const sentimentSection = params.srReport
    ? `\n[舆情分析]\n${params.srReport}`
    : '';

  return `你是一位资深的A股投资分析师。请综合以下材料，生成一份投资分析报告。

[股票信息]
代码：${params.code}
名称：${params.name}

[客观数据报告]
指标: ${params.darIndicators}
摘要: ${params.darSummary}${sentimentSection}

[多角色分析讨论记录]
${params.roleDiscussions || '无'}

请生成以下两个部分：

1. 【概述】（200字以内）
核心结论、关键信号、主要风险

2. 【完整报告】（不限字数）
分为以下章节：
a. 技术面分析
b. 基本面分析
c. 市场情绪分析
d. 风险提示
e. 综合判断

请按以下JSON格式输出（仅输出JSON，不要额外文字）：
{
  "summary": "概述内容（200字以内）",
  "fullReport": "完整报告，包含技术面分析、基本面分析、市场情绪分析、风险提示、综合判断等章节",
  "roleSummary": [
    { "role": "技术分析师", "keyPoint": "核心观点" },
    { "role": "基本面分析师", "keyPoint": "核心观点" },
    { "role": "舆情分析师", "keyPoint": "核心观点" },
    { "role": "风控官", "keyPoint": "核心观点" }
  ]
}`;
}

// ─── Stage 1: 数据获取 ──────────────────────────────────────────

/**
 * Stage 1 — 数据获取
 *
 * 从腾讯财经接口获取最近 60 个交易日数据，
 * 写入 daily_info 表并更新 stock.current_price。
 *
 * @param code - 六位股票代码
 * @returns 最新交易日日期和记录数
 *
 * @throws 股票不存在或数据获取失败时抛出
 */
export async function stage1FetchData(code: string): Promise<Stage1Result> {
  // 验证股票存在
  const stockInfo = await stockService.getStockByCode(code);
  if (!stockInfo) {
    throw new Error(`股票 ${code} 不存在，请先添加该股票`);
  }

  // 从腾讯财经获取 K 线数据
  const ohlcvData = await dailyInfoService.fetchFromTencent(code);
  if (!ohlcvData || ohlcvData.length === 0) {
    throw new Error(`获取股票 ${code} 行情数据失败: 返回空数据`);
  }

  // 构造 upsert 记录
  const records = ohlcvData.map((o) => ({
    code,
    date: o.date,
    open: o.open,
    high: o.high,
    low: o.low,
    close: o.close,
    volume: o.volume,
  }));

  // 写入 daily_info 表
  const count = await dailyInfoService.upsertDailyInfo(records);

  // 更新股票最新价格
  const latest = ohlcvData[ohlcvData.length - 1];
  await stockService.upsertStock(code, stockInfo.name, latest.close);

  return {
    date: latest.date,
    records: count,
  };
}

// ─── Stage 2: 客观报告（LLM）────────────────────────────────────

/**
 * Stage 2 — 客观报告（LLM）
 *
 * 基于最近 60 个交易日的行情数据和技术指标，
 * 调用本地 LLM 生成客观分析报告。
 *
 * 报告包含结构化技术指标和文字摘要，
 * 写入 daily_analysis_report 表并生成向量嵌入。
 *
 * @param code      - 股票代码
 * @param date      - 报告日期（yyyy-MM-dd）
 * @param sessionId - LLM 会话 ID
 * @returns 创建的客观报告信息
 */
export async function stage2ObjectiveReport(
  code: string,
  date: string,
  sessionId: string,
): Promise<Stage2Result> {
  const db = getDatabase();

  // 1. 获取股票信息
  const stockInfo = await stockService.getStockByCode(code);
  if (!stockInfo) {
    throw new Error(`股票 ${code} 不存在`);
  }

  // 2. 获取日行情数据（最近 60 个交易日）
  const allDailyData = await dailyInfoService.getDailyInfo(code);
  if (allDailyData.length < 5) {
    throw new Error(
      `股票 ${code} 行情数据不足 (${allDailyData.length} 天，至少需要 5 天)`,
    );
  }

  const recentData = allDailyData.slice(-60);
  const ohlcvData: OHLCV[] = recentData.map((d) => ({
    date: d.date,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));

  // 3. 获取前 3 个交易日的分析报告
  const prevReports = db
    .select({
      summary: dailyAnalysisReport.summary,
      indicators: dailyAnalysisReport.indicators,
    })
    .from(dailyAnalysisReport)
    .where(
      and(
        eq(dailyAnalysisReport.code, code),
        sql`${dailyAnalysisReport.date} < ${date}`,
      ),
    )
    .orderBy(desc(dailyAnalysisReport.date))
    .limit(3)
    .all();

  // 4. 计算技术指标和信号
  const indicators = analysisService.computeIndicators(ohlcvData);
  const signals = analysisService.computeSignals(ohlcvData);

  // 5. 构造 prompt 并调用 LLM
  const prompt = buildObjectivePrompt({
    code,
    name: stockInfo.name,
    dailyData: ohlcvData,
    prevReports,
    indicators,
    signals,
  });

  // 追加到 session
  sessionService.appendMessage(
    sessionId,
    'system',
    '你是一个客观的A股数据分析师。请基于数据生成客观分析报告，不要给出投资建议。',
  );
  sessionService.appendMessage(sessionId, 'user', prompt);

  // 调用 LLM
  const llmResponse = await llmService.chatCompletion({
    messages: getSessionMessages(sessionId),
    maxTokens: 1500,
    temperature: 0.3,
    sessionId,
  });

  sessionService.appendMessage(sessionId, 'assistant', llmResponse);

  // 6. 解析 LLM 回复
  let summary = llmResponse;
  let indicatorsStr = JSON.stringify(indicators);
  let signalsStr = JSON.stringify(signals);

  const parsed = parseLLMJsonResponse<{
    summary?: string;
    indicators?: Record<string, unknown>;
    signals?: Record<string, unknown>;
  }>(llmResponse);

  if (parsed) {
    if (parsed.summary) summary = parsed.summary;
    if (parsed.indicators) indicatorsStr = JSON.stringify(parsed.indicators);
    if (parsed.signals) signalsStr = JSON.stringify(parsed.signals);
  }

  // 7. 写入 daily_analysis_report 表
  db.insert(dailyAnalysisReport)
    .values({
      code,
      date,
      summary,
      indicators: indicatorsStr,
      signals: signalsStr,
    })
    .onConflictDoUpdate({
      target: [dailyAnalysisReport.code, dailyAnalysisReport.date],
      set: {
        summary,
        indicators: indicatorsStr,
        signals: signalsStr,
      },
    })
    .run();

  const inserted = db
    .select()
    .from(dailyAnalysisReport)
    .where(
      and(
        eq(dailyAnalysisReport.code, code),
        eq(dailyAnalysisReport.date, date),
      ),
    )
    .get()!;

  // 8. 向量化并存储嵌入
  try {
    const embeddingText = `[${code} ${date}] ${summary}`;
    const embedding = await embeddingService.getEmbedding(embeddingText);

    // 先清理旧的 analysis 类型向量
    await embeddingService.deleteEmbeddings(code, 'analysis');
    await embeddingService.storeEmbedding({
      contentType: 'analysis',
      contentCode: code,
      contentDate: date,
      contentText: summary,
      embedding,
    });
  } catch (err) {
    console.warn(
      `[pipeline] 向量化失败 (${code} ${date}):`,
      (err as Error).message,
    );
  }

  return {
    id: inserted.id,
    summary,
    indicators: indicatorsStr,
    signals: signalsStr,
  };
}

// ─── Stage 3: 舆情获取 ──────────────────────────────────────────

/**
 * Stage 3 — 舆情获取
 *
 * 调用 DashScope API 搜索股票最近三天的新闻和市场舆情，
 * 将结果写入 sentiment_report 表。
 *
 * @param code - 股票代码
 * @param date - 报告日期（yyyy-MM-dd）
 * @returns 舆情报告信息
 */
export async function stage3Sentiment(
  code: string,
  date: string,
): Promise<Stage3Result> {
  const db = getDatabase();

  // 获取股票名称
  const stockInfo = await stockService.getStockByCode(code);
  const name = stockInfo?.name || code;

  // 调用舆情搜索
  const { report, sources } = await sentimentService.fetchSentiment(
    code,
    name,
  );

  // 写入 sentiment_report 表
  db.insert(sentimentReport)
    .values({
      code,
      date,
      report,
      sources: JSON.stringify(sources),
    })
    .onConflictDoUpdate({
      target: [sentimentReport.code, sentimentReport.date],
      set: {
        report,
        sources: JSON.stringify(sources),
      },
    })
    .run();

  const inserted = db
    .select()
    .from(sentimentReport)
    .where(
      and(
        eq(sentimentReport.code, code),
        eq(sentimentReport.date, date),
      ),
    )
    .get()!;

  return {
    id: inserted.id,
    report,
    sources,
  };
}

// ─── Stage 4: 多角色分析 ────────────────────────────────────────

/**
 * Stage 4 — 多角色分析
 *
 * 4 个角色按顺序发言，每轮每人聚焦各自专业领域。
 * 第一轮（必须）：技术分析师 → 基本面分析师 → 舆情分析师 → 风控官
 * 第二轮（可选）：风控官 → 舆情分析师 → 基本面分析师 → 技术分析师（回应分歧）
 *
 * 每个角色的发言写入 analysis_roler 表。
 *
 * @param code      - 股票代码
 * @param date      - 分析日期
 * @param darId     - 客观报告 ID
 * @param srId      - 舆情报告 ID（可为 null）
 * @param sessionId - LLM 会话 ID
 * @returns 所有角色发言记录
 */
export async function stage4MultiRole(
  code: string,
  date: string,
  darId: number,
  srId: number | null,
  sessionId: string,
): Promise<Stage4Result> {
  const db = getDatabase();

  // 1. 读取客观报告和舆情报告
  const dar = db
    .select()
    .from(dailyAnalysisReport)
    .where(eq(dailyAnalysisReport.id, darId))
    .get();

  if (!dar) {
    throw new Error(`客观报告不存在 (id=${darId})`);
  }

  const darNonNull = dar;

  const sr = srId
    ? db
        .select()
        .from(sentimentReport)
        .where(eq(sentimentReport.id, srId))
        .get()
    : null;

  // 2. 获取股票名称
  const stockInfo = await stockService.getStockByCode(code);
  const name = stockInfo?.name || code;

  const allRoleRecords: Stage4Result['roles'] = [];

  /**
   * 执行一轮角色发言。
   *
   * @param roleOrder    - 角色数组（发言顺序）
   * @param round        - 轮次编号
   * @param allRound1Speeches - 第一轮所有发言（仅第二轮需要）
   */
  async function runRound(
    roleOrder: RoleConfig[],
    round: number,
    allRound1Speeches?: string,
  ): Promise<void> {
    // 收集本轮之前的发言，用于构造上下文
    const previousSpeeches: string[] = [];

    for (const role of roleOrder) {
      // 构造本轮上下文（不包括当前角色的发言）
      const previousContext =
        allRound1Speeches && round === 2
          ? allRound1Speeches
          : previousSpeeches.join('\n\n---\n\n');

      const prompt = buildRolePrompt({
        role,
        code,
        name,
        darSummary: darNonNull.summary,
        darIndicators: darNonNull.indicators,
        srReport: sr?.report,
        previousSpeeches: previousContext,
        round,
      });

      // 添加到 session
      sessionService.appendMessage(sessionId, 'system', role.systemPrompt);
      sessionService.appendMessage(sessionId, 'user', prompt);

      // 调用 LLM
      const response = await llmService.chatCompletion({
        messages: getSessionMessages(sessionId),
        maxTokens: round === 1 ? role.wordLimitRound1 + 200 : role.wordLimitRound2 + 200,
        temperature: 0.5,
        sessionId,
      });

      sessionService.appendMessage(sessionId, 'assistant', response);

      // 统计字数并写入数据库
      const wordCount = countWords(response);

      db.insert(analysisRoler)
        .values({
          code,
          date,
          role: role.name,
          responsibility: role.responsibility,
          report: response,
          round,
          wordCount,
        })
        .run();

      const inserted = db
        .select()
        .from(analysisRoler)
        .where(
          and(
            eq(analysisRoler.code, code),
            eq(analysisRoler.date, date),
            eq(analysisRoler.role, role.name),
            eq(analysisRoler.round, round),
          ),
        )
        .orderBy(desc(analysisRoler.id))
        .limit(1)
        .all();

      if (inserted.length > 0) {
        allRoleRecords.push({
          id: inserted[0].id,
          role: role.name,
          report: response,
          round,
          wordCount,
        });
      }

      previousSpeeches.push(`【${role.name}】\n${response}`);
    }
  }

  // 第一轮：按 1→2→3→4 顺序
  await runRound(ROLES, 1);

  // 第二轮（可选）：收集第一轮所有内容作为上下文，按 4→3→2→1 顺序
  const round1Speeches = allRoleRecords
    .filter((r) => r.round === 1)
    .map((r) => `【${r.role}】\n${r.report}`)
    .join('\n\n---\n\n');

  const reversedRoles = [...ROLES].reverse();
  await runRound(reversedRoles, 2, round1Speeches);

  return { roles: allRoleRecords };
}

// ─── Stage 5: 最终报告 ──────────────────────────────────────────

/**
 * Stage 5 — 最终报告
 *
 * 综合客观报告、舆情报告和多角色分析结果，
 * 调用 LLM 生成包含概述（overview）和完整报告（full）的最终报告。
 *
 * 写入 final_report 表并生成向量嵌入。
 *
 * @param code      - 股票代码
 * @param date      - 报告日期
 * @param sessionId - LLM 会话 ID
 * @returns 最终报告信息
 */
export async function stage5FinalReport(
  code: string,
  date: string,
  sessionId: string,
): Promise<Stage5Result> {
  const db = getDatabase();

  // 1. 获取股票信息
  const stockInfo = await stockService.getStockByCode(code);
  const name = stockInfo?.name || code;

  // 2. 收集客观报告
  const dar = db
    .select()
    .from(dailyAnalysisReport)
    .where(
      and(
        eq(dailyAnalysisReport.code, code),
        eq(dailyAnalysisReport.date, date),
      ),
    )
    .get();

  // 3. 收集舆情报告
  const sr = db
    .select()
    .from(sentimentReport)
    .where(
      and(
        eq(sentimentReport.code, code),
        eq(sentimentReport.date, date),
      ),
    )
    .get();

  // 4. 收集多角色发言
  const roleRecords = db
    .select()
    .from(analysisRoler)
    .where(
      and(
        eq(analysisRoler.code, code),
        eq(analysisRoler.date, date),
      ),
    )
    .orderBy(analysisRoler.round, analysisRoler.id)
    .all();

  // 5. 编排角色讨论文本
  const roleDiscussions = roleRecords
    .map(
      (r) =>
        `[第${r.round}轮 ${r.role}]（${r.responsibility}）\n${r.report}`,
    )
    .join('\n\n---\n\n');

  // 6. 构造 prompt 并调用 LLM
  const pipelineId = generatePipelineId();

  const prompt = buildFinalReportPrompt({
    code,
    name,
    darSummary: dar?.summary || '无客观报告',
    darIndicators: dar?.indicators || '{}',
    srReport: sr?.report,
    roleDiscussions,
  });

  sessionService.appendMessage(
    sessionId,
    'system',
    '你是一位资深的A股投资分析师。请综合所有材料生成投资分析报告。',
  );
  sessionService.appendMessage(sessionId, 'user', prompt);

  const llmResponse = await llmService.chatCompletion({
    messages: getSessionMessages(sessionId),
    maxTokens: 3000,
    temperature: 0.5,
    sessionId,
  });

  sessionService.appendMessage(sessionId, 'assistant', llmResponse);

  // 7. 解析 LLM 回复
  let summary = llmResponse.slice(0, 500);
  let fullReport = llmResponse;
  let roleSummary = '[]';

  const parsed = parseLLMJsonResponse<{
    summary?: string;
    fullReport?: string;
    roleSummary?: { role: string; keyPoint: string }[];
  }>(llmResponse);

  if (parsed) {
    if (parsed.summary) summary = parsed.summary;
    if (parsed.fullReport) fullReport = parsed.fullReport;
    if (parsed.roleSummary) roleSummary = JSON.stringify(parsed.roleSummary);
  }

  // 8. 写入 final_report 表
  db.insert(finalReport)
    .values({
      code,
      date,
      summary,
      fullReport,
      roleSummary,
      pipelineId,
    })
    .onConflictDoUpdate({
      target: [finalReport.code, finalReport.date],
      set: {
        summary,
        fullReport,
        roleSummary,
        pipelineId,
      },
    })
    .run();

  const inserted = db
    .select()
    .from(finalReport)
    .where(
      and(
        eq(finalReport.code, code),
        eq(finalReport.date, date),
      ),
    )
    .get()!;

  // 9. 向量化并存储嵌入
  try {
    const embeddingText = `[${code} ${date} 最终报告] ${summary}`;
    const embedding = await embeddingService.getEmbedding(embeddingText);

    // 先清理旧的 final 类型向量
    await embeddingService.deleteEmbeddings(code, 'final');
    await embeddingService.storeEmbedding({
      contentType: 'final',
      contentCode: code,
      contentDate: date,
      contentText: fullReport.slice(0, 500),
      embedding,
    });
  } catch (err) {
    console.warn(
      `[pipeline] 最终报告向量化失败 (${code} ${date}):`,
      (err as Error).message,
    );
  }

  return {
    id: inserted.id,
    summary,
    fullReport,
    roleSummary,
    pipelineId,
  };
}

// ─── Orchestrators ───────────────────────────────────────────────

/**
 * 运行完整流水线（Stage 1→5）。
 *
 * 创建一个新的 LLM 会话，依次执行数据获取、客观报告、
 * 舆情获取、多角色分析和最终报告。
 *
 * @param code - 股票代码
 * @returns 流水线运行结果（日期、流水线 ID、最终报告 ID）
 *
 * @example
 * const result = await runFullPipeline('600519');
 * console.log(result.date, result.pipelineId);
 */
export async function runFullPipeline(code: string): Promise<PipelineResult> {
  // 创建新会话
  const sessionId = sessionService.createSession();
  console.log(`[pipeline] 开始全流水线: ${code} (session=${sessionId})`);

  // Stage 1: 数据获取
  console.log(`[pipeline] Stage 1/5 — 数据获取: ${code}`);
  const stage1 = await stage1FetchData(code);
  const date = stage1.date;
  console.log(`[pipeline] Stage 1 完成: date=${date}, records=${stage1.records}`);

  // Stage 2: 客观报告
  console.log(`[pipeline] Stage 2/5 — 客观报告: ${code}`);
  const stage2 = await stage2ObjectiveReport(code, date, sessionId);
  console.log(`[pipeline] Stage 2 完成: id=${stage2.id}`);

  // Stage 3: 舆情获取
  console.log(`[pipeline] Stage 3/5 — 舆情获取: ${code}`);
  const stage3 = await stage3Sentiment(code, date);
  console.log(`[pipeline] Stage 3 完成: id=${stage3.id}`);

  // Stage 4: 多角色分析
  console.log(`[pipeline] Stage 4/5 — 多角色分析: ${code}`);
  const stage4 = await stage4MultiRole(
    code,
    date,
    stage2.id,
    stage3.id,
    sessionId,
  );
  console.log(
    `[pipeline] Stage 4 完成: ${stage4.roles.length} 条发言`,
  );

  // Stage 5: 最终报告
  console.log(`[pipeline] Stage 5/5 — 最终报告: ${code}`);
  const stage5 = await stage5FinalReport(code, date, sessionId);
  console.log(
    `[pipeline] Stage 5 完成: id=${stage5.id}, pipelineId=${stage5.pipelineId}`,
  );

  console.log(`[pipeline] 全流水线完成: ${code} ${date}`);

  return {
    date,
    pipelineId: stage5.pipelineId,
    finalReportId: stage5.id,
  };
}

/**
 * 运行本地分析（Stage 1→2）。
 *
 * 仅执行数据获取和客观分析报告生成，跳过舆情和多角色环节。
 *
 * @param code - 股票代码
 * @returns 分析结果（日期和报告 ID）
 *
 * @example
 * const result = await runLocalAnalysis('600519');
 * console.log(result.date, result.analysisReportId);
 */
export async function runLocalAnalysis(
  code: string,
): Promise<LocalAnalysisResult> {
  // 创建新会话
  const sessionId = sessionService.createSession();
  console.log(`[pipeline] 开始本地分析: ${code} (session=${sessionId})`);

  // Stage 1: 数据获取
  console.log(`[pipeline] Stage 1/2 — 数据获取: ${code}`);
  const stage1 = await stage1FetchData(code);
  const date = stage1.date;
  console.log(`[pipeline] Stage 1 完成: date=${date}, records=${stage1.records}`);

  // Stage 2: 客观报告
  console.log(`[pipeline] Stage 2/2 — 客观报告: ${code}`);
  const stage2 = await stage2ObjectiveReport(code, date, sessionId);
  console.log(`[pipeline] Stage 2 完成: id=${stage2.id}`);

  console.log(`[pipeline] 本地分析完成: ${code} ${date}`);

  return {
    date,
    analysisReportId: stage2.id,
  };
}
