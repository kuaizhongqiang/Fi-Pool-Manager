/**
 * fi-pool-plugin
 * Fi-Pool-Manager OpenClaw 插件入口
 *
 * 将 fi-pool-server 的能力暴露为 OpenClaw 插件，
 * 通过 MCP 协议供 Claude、Cursor 等 AI 代理调用。
 *
 * 公开 29 个工具，覆盖管理、查询、命令、执行、辅助五大类。
 */

import { ensureDatabase } from 'fi-pool-server/db/migrate.js';
import * as manager from 'fi-pool-server/tools/manager.js';
import * as query from 'fi-pool-server/tools/query.js';
import * as cmd from 'fi-pool-server/tools/command.js';
import * as exec from 'fi-pool-server/tools/execute.js';
import * as aux from 'fi-pool-server/tools/auxiliary.js';

/** 从 JSON Schema 工具定义中提取 handler 的返回类型 */
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// ─── Handler 通用辅助 ──────────────────────────────────────────

/**
 * 安全地将参数解析为整数。
 */
function parseIntArg(val: unknown): number {
  if (typeof val === 'number') return Math.floor(val);
  return parseInt(String(val ?? ''), 10) || 0;
}

/**
 * 安全地将参数解析为字符串数组。
 * 支持传入数组、逗号分隔字符串、或单个字符串。
 */
function parseStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// ─── 工具定义 ───────────────────────────────────────────────────

const tools: ToolDefinition[] = [

  // ── 管理类（6） ─────────────────────────────────────────────

  {
    name: 'create_pool',
    description: '创建新的股票池，可选初始股票列表',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '池子名称（必填）' },
        desc: { type: 'string', description: '可选描述' },
        stockCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '可选的初始股票代码列表',
        },
      },
      required: ['name'],
    },
    handler: async (args) => {
      return manager.createPool(
        String(args.name ?? ''),
        args.desc ? String(args.desc) : undefined,
        args.stockCodes ? parseStringArray(args.stockCodes) : undefined,
      );
    },
  },

  {
    name: 'delete_pool',
    description: '删除指定股池（不删除关联股票数据）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '股池 ID' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      return manager.deletePool(parseIntArg(args.id));
    },
  },

  {
    name: 'update_pool',
    description: '修改股池名称或描述',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '股池 ID' },
        name: { type: 'string', description: '新名称（可选）' },
        desc: { type: 'string', description: '新描述（可选）' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      return manager.updatePool(
        parseIntArg(args.id),
        args.name ? String(args.name) : undefined,
        args.desc ? String(args.desc) : undefined,
      );
    },
  },

  {
    name: 'add_stocks',
    description: '向指定股池添加股票代码',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
        stockCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '股票代码数组',
        },
      },
      required: ['poolId', 'stockCodes'],
    },
    handler: async (args) => {
      return manager.addStocks(parseIntArg(args.poolId), parseStringArray(args.stockCodes));
    },
  },

  {
    name: 'remove_stocks',
    description: '从指定股池移除股票代码',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
        stockCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '股票代码数组',
        },
      },
      required: ['poolId', 'stockCodes'],
    },
    handler: async (args) => {
      return manager.removeStocks(parseIntArg(args.poolId), parseStringArray(args.stockCodes));
    },
  },

  {
    name: 'set_pool_signal',
    description: '手动设置股池信号值（-1 看空 / 0 中性 / 1 看多）',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
        signal: {
          type: 'number',
          description: '信号值：-1 看空, 0 中性, 1 看多',
          enum: [-1, 0, 1],
        },
      },
      required: ['poolId', 'signal'],
    },
    handler: async (args) => {
      return manager.setPoolSignal(parseIntArg(args.poolId), parseIntArg(args.signal));
    },
  },

  // ── 查询类（7） ─────────────────────────────────────────────

  {
    name: 'list_pools',
    description: '列出所有股池及其股票数量',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return query.listPools();
    },
  },

  {
    name: 'get_pool_stocks',
    description: '查询指定股池中的股票列表',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
      },
      required: ['poolId'],
    },
    handler: async (args) => {
      return query.getPoolStocks(parseIntArg(args.poolId));
    },
  },

  {
    name: 'get_stock_info',
    description: '查询股票基本信息（代码、名称、最新价格）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      return query.getStockInfo(String(args.code ?? ''));
    },
  },

  {
    name: 'get_daily_info',
    description: '查询指定股票的日行情数据，支持日期范围过滤',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
        startDate: { type: 'string', description: '起始日期 yyyy-MM-dd（可选）' },
        endDate: { type: 'string', description: '结束日期 yyyy-MM-dd（可选）' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      return query.getDailyInfo(
        String(args.code ?? ''),
        args.startDate ? String(args.startDate) : undefined,
        args.endDate ? String(args.endDate) : undefined,
      );
    },
  },

  {
    name: 'get_analysis_report',
    description: '查询指定股票指定日期的客观分析报告',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
        date: { type: 'string', description: '报告日期 yyyy-MM-dd' },
        mode: {
          type: 'string',
          description: '输出模式 overview | full',
          enum: ['overview', 'full'],
        },
      },
      required: ['code', 'date'],
    },
    handler: async (args) => {
      return query.getAnalysisReport(
        String(args.code ?? ''),
        String(args.date ?? ''),
        (args.mode as 'overview' | 'full') || 'full',
      );
    },
  },

  {
    name: 'get_final_report',
    description: '查询指定股票指定日期的最终综合报告',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
        date: { type: 'string', description: '报告日期 yyyy-MM-dd' },
        mode: {
          type: 'string',
          description: '输出模式 overview | full',
          enum: ['overview', 'full'],
        },
      },
      required: ['code', 'date'],
    },
    handler: async (args) => {
      return query.getFinalReport(
        String(args.code ?? ''),
        String(args.date ?? ''),
        (args.mode as 'overview' | 'full') || 'full',
      );
    },
  },

  {
    name: 'get_system_status',
    description: '查看系统运行状态（版本、数据库大小、股票数、LLM 连接等）',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return query.getSystemStatus();
    },
  },

  // ── 命令类（5） ─────────────────────────────────────────────

  {
    name: 'output_analysis_report',
    description: '输出客观分析报告（含指标结构和文字摘要）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
        date: { type: 'string', description: '报告日期 yyyy-MM-dd' },
        mode: {
          type: 'string',
          description: '输出模式 overview | full',
          enum: ['overview', 'full'],
        },
      },
      required: ['code', 'date'],
    },
    handler: async (args) => {
      return cmd.outputAnalysisReport(
        String(args.code ?? ''),
        String(args.date ?? ''),
        (args.mode as 'overview' | 'full') || 'overview',
      );
    },
  },

  {
    name: 'output_final_report',
    description: '输出最终综合报告（含多角色观点）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
        date: { type: 'string', description: '报告日期 yyyy-MM-dd' },
        mode: {
          type: 'string',
          description: '输出模式 overview | full',
          enum: ['overview', 'full'],
        },
      },
      required: ['code', 'date'],
    },
    handler: async (args) => {
      return cmd.outputFinalReport(
        String(args.code ?? ''),
        String(args.date ?? ''),
        (args.mode as 'overview' | 'full') || 'overview',
      );
    },
  },

  {
    name: 'output_pool_report',
    description: '输出整个股池的综合报告（含各股票信号和摘要）',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
        mode: {
          type: 'string',
          description: '输出模式 overview | full',
          enum: ['overview', 'full'],
        },
      },
      required: ['poolId'],
    },
    handler: async (args) => {
      return cmd.outputPoolReport(
        parseIntArg(args.poolId),
        (args.mode as 'overview' | 'full') || 'overview',
      );
    },
  },

  {
    name: 'semantic_search',
    description: '基于向量检索语义搜索历史分析报告',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询文本' },
        limit: { type: 'number', description: '返回条数，默认 10' },
        type: {
          type: 'string',
          description: '搜索类型 analysis | final | all',
          enum: ['analysis', 'final', 'all'],
        },
      },
      required: ['query'],
    },
    handler: async (args) => {
      return cmd.semanticSearch(
        String(args.query ?? ''),
        args.limit ? parseIntArg(args.limit) : 10,
        (args.type as 'analysis' | 'final' | 'all') || 'all',
      );
    },
  },

  {
    name: 'session_manage',
    description: '管理 LLM 对话 Session：new / switch / list / current',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型 new | switch | list | current',
          enum: ['new', 'switch', 'list', 'current'],
        },
        sessionId: { type: 'string', description: '会话 ID（switch 时必填）' },
      },
      required: ['action'],
    },
    handler: async (args) => {
      return cmd.sessionManage(
        args.action as 'new' | 'switch' | 'list' | 'current',
        args.sessionId ? String(args.sessionId) : undefined,
      );
    },
  },

  // ── 执行类（5） ─────────────────────────────────────────────

  {
    name: 'run_local_analysis',
    description: '对单只股票运行本地分析（数据获取 + 技术指标 + 客观报告）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      return exec.runLocalAnalysis(String(args.code ?? ''));
    },
  },

  {
    name: 'run_full_pipeline',
    description: '对单只股票运行完整流水线（数据 + 分析 + 舆情 + 多角色 + 最终报告）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '六位股票代码' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      return exec.runFullPipeline(String(args.code ?? ''));
    },
  },

  {
    name: 'run_pool_analysis',
    description: '对指定股池中所有股票运行本地分析',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
      },
      required: ['poolId'],
    },
    handler: async (args) => {
      return exec.runPoolAnalysis(parseIntArg(args.poolId));
    },
  },

  {
    name: 'run_pool_full_pipeline',
    description: '对指定股池中所有股票运行完整流水线',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'number', description: '股池 ID' },
      },
      required: ['poolId'],
    },
    handler: async (args) => {
      return exec.runPoolFullPipeline(parseIntArg(args.poolId));
    },
  },

  {
    name: 'refresh_data',
    description: '触发获取最新日行情数据（可指定股票，不指定则更新全部）',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '可选股票代码，不传则更新所有关注股票' },
      },
    },
    handler: async (args) => {
      return exec.refreshData(args.code ? String(args.code) : undefined);
    },
  },

  // ── 辅助类（7） ─────────────────────────────────────────────

  {
    name: 'help',
    description: '输出命令或工具帮助信息',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '可选命令名称' },
      },
    },
    handler: async (args) => {
      return aux.help(args.command ? String(args.command) : undefined);
    },
  },

  {
    name: 'generate_daily_summary',
    description: '生成每日综合股池综述，汇总所有股池信号和分析报告，调用 LLM 生成完整投资回顾',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '可选目标日期 yyyy-MM-dd（默认今天）' },
      },
    },
    handler: async (args) => {
      return aux.generateDailySummaryReport(args.date ? String(args.date) : undefined);
    },
  },

  {
    name: 'list_resources',
    description: '列出可用资源（pools | stocks | tools）',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '资源类型 pools | stocks | tools',
          enum: ['pools', 'stocks', 'tools'],
        },
      },
      required: ['type'],
    },
    handler: async (args) => {
      return aux.listResources(args.type as 'pools' | 'stocks' | 'tools');
    },
  },

  {
    name: 'show_state',
    description: '查看系统简要运行状态',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return aux.showState();
    },
  },

  {
    name: 'show_version',
    description: '输出版本信息',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return aux.showVersion();
    },
  },

  {
    name: 'get_config',
    description: '查看指定配置项或所有配置',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '可选配置键名，不指定则返回所有配置' },
      },
    },
    handler: async (args) => {
      return aux.getConfig(args.key ? String(args.key) : undefined);
    },
  },

  {
    name: 'set_config',
    description: '修改配置项（运行时生效，同时持久化）',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '配置键名' },
        value: { type: 'string', description: '配置值' },
      },
      required: ['key', 'value'],
    },
    handler: async (args) => {
      return aux.setConfig(String(args.key ?? ''), String(args.value ?? ''));
    },
  },
];

// ─── 插件默认导出 ──────────────────────────────────────────────

export default {
  name: 'fi-pool-manager',
  version: '0.2.2',
  description: 'A股股池管理 — 管理股票池、获取行情、技术分析、LLM 分析报告',

  /** MCP 工具定义列表 */
  tools,

  /** 初始化钩子 */
  async init() {
    try {
      ensureDatabase();
      console.log('[fi-pool] 插件初始化完成');
    } catch (err) {
      console.error('[fi-pool] 插件初始化失败:', (err as Error).message);
    }
  },
};
