/**
 * 辅助类工具（Auxiliary）
 *
 * 提供帮助信息、资源列表、状态查询、版本信息、配置管理等功能。
 * 返回值均为元信息，不涉及业务数据。
 *
 * @module tools/auxiliary
 */

import { getDatabase } from '../db/index.js';
import { config as configTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { VERSION } from '../index.js';
import * as poolService from '../services/pool.js';
import * as stockService from '../services/stock.js';
import { generateDailySummary } from '../services/daily-summary.js';

/**
 * 输出所有可用的命令和工具帮助信息。
 *
 * @param command - 可选命令名称，不指定则输出所有
 * @returns 帮助文本
 */
export async function help(command?: string): Promise<string> {
  const lines: string[] = [
    'Fi-Pool-Manager v' + VERSION,
    '',
    '可用管理命令：',
    '  create_pool      创建新的股票池',
    '  delete_pool      删除指定股池',
    '  update_pool      修改股池信息',
    '  add_stocks       向股池添加股票',
    '  remove_stocks    从股池移除股票',
    '  set_pool_signal  设置股池信号',
    '',
    '可用查询命令：',
    '  list_pools       列出所有股池',
    '  get_pool_stocks  查股池中的股票',
    '  get_stock_info   查股票基本信息',
    '  get_daily_info   查日行情数据',
    '  get_analysis_report  查客观分析报告',
    '  get_final_report     查最终报告',
    '  get_system_status    查看系统状态',
    '',
    '可用执行命令：',
    '  run_local_analysis    运行本地分析',
    '  run_full_pipeline     运行完整流水线',
    '  run_pool_analysis     运行股池本地分析',
    '  run_pool_full_pipeline 运行股池完整流水线',
    '  refresh_data          刷新行情数据',
    '',
    '可用辅助命令：',
    '  help             显示帮助',
    '  list_resources   列出可用资源',
    '  show_state       查看系统简要状态',
    '  show_version     输出版本信息',
    '  get_config       查看配置',
    '  set_config       设置配置',
    '  generate_daily_summary  生成每日综合股池综述',
    '',
    '报告输出命令：',
    '  output_analysis_report  输出客观分析报告',
    '  output_final_report     输出最终报告',
    '  output_pool_report      输出股池报告',
    '  semantic_search         语义搜索',
    '  session_manage          管理 LLM 会话',
  ];

  if (command) {
    const filtered = lines.filter((l) => l.toLowerCase().includes(command.toLowerCase()));
    if (filtered.length > 0) {
      return ['匹配 "' + command + '" 的帮助信息：', '', ...filtered].join('\n');
    }
    return `未找到命令: ${command}`;
  }

  return lines.join('\n');
}

/**
 * 列出可用资源。
 *
 * @param type - 资源类型 "pools" | "stocks" | "tools"
 * @returns 资源列表
 */
export async function listResources(type: 'pools' | 'stocks' | 'tools') {
  switch (type) {
    case 'pools': {
      const pools = await poolService.listPools();
      return {
        items: pools.map((p) => ({
          id: String(p.id),
          name: p.name,
        })),
      };
    }
    case 'stocks': {
      const stocks = await stockService.listAllStocks();
      return {
        items: stocks.map((s) => ({
          id: s.code,
          name: s.name,
        })),
      };
    }
    case 'tools': {
      const toolNames = [
        'create_pool', 'delete_pool', 'update_pool', 'add_stocks', 'remove_stocks', 'set_pool_signal',
        'list_pools', 'get_pool_stocks', 'get_stock_info', 'get_daily_info', 'get_analysis_report',
        'get_final_report', 'get_system_status', 'output_analysis_report', 'output_final_report',
        'output_pool_report', 'semantic_search', 'session_manage', 'run_local_analysis',
        'run_full_pipeline', 'run_pool_analysis', 'run_pool_full_pipeline', 'refresh_data',
        'help', 'list_resources', 'show_state', 'show_version', 'get_config', 'set_config',
      ];
      return {
        items: toolNames.map((name) => ({ id: name, name })),
      };
    }
    default:
      return { items: [] };
  }
}

/**
 * 查看系统简要运行状态。
 *
 * @returns { status: 'running' | 'error', version: string, uptime: number }
 */
export async function showState() {
  return {
    status: 'running' as const,
    version: VERSION,
    uptime: Math.floor(process.uptime()),
  };
}

/**
 * 输出版本信息。
 *
 * @returns 版本字符串
 */
export async function showVersion(): Promise<string> {
  return `Fi-Pool-Manager v${VERSION}`;
}

/**
 * 查看指定配置项或所有配置。
 *
 * 查询优先级：DB → process.env → null。
 * DB 中不存在的键会 fallback 到 .env 环境变量。
 *
 * @param key - 可选配置键名，不指定则返回所有配置
 * @returns 配置键值对
 */
export async function getConfig(key?: string) {
  const db = getDatabase();

  if (key) {
    // 先查 DB，再 fallback 到 process.env
    const row = db
      .select()
      .from(configTable)
      .where(eq(configTable.key, key))
      .get();
    if (row) return { key: row.key, value: row.value };
    const envVal = process.env[key];
    return envVal !== undefined
      ? { key, value: envVal, source: '.env' }
      : { key, value: null };
  }

  // 返回全部：DB 值 + process.env 补充
  const allRows = db.select().from(configTable).all();
  const config: Record<string, string> = {};
  for (const row of allRows) {
    config[row.key] = row.value;
  }
  // 补充运行时环境变量中不在 DB 中的配置
  const envKeys = ['LLM_BASE_URL', 'LLM_MODEL', 'DB_PATH', 'DASHSCOPE_API_KEY', 'DATA_FETCH_INTERVAL_MS'];
  for (const ek of envKeys) {
    if (!(ek in config) && process.env[ek]) {
      config[ek] = process.env[ek]!;
    }
  }

  // 脱敏处理：对包含 KEY/TOKEN/SECRET/PASSWORD 的字段掩码显示
  for (const key of Object.keys(config)) {
    const upper = key.toUpperCase();
    if (upper.includes('KEY') || upper.includes('TOKEN') || upper.includes('SECRET') || upper.includes('PASSWORD')) {
      const val = config[key];
      if (val.length > 8) {
        config[key] = val.slice(0, 4) + '****' + val.slice(-4);
      } else if (val.length > 0) {
        config[key] = val.slice(0, 2) + '****';
      }
    }
  }

  return { config };
}

/**
 * 修改配置项。
 *
 * 同时更新 DB 和运行时的 process.env，确保对同一进程后续读取生效。
 *
 * @param key   - 配置键名
 * @param value - 配置值
 * @returns { success: true }
 */
export async function setConfig(key: string, value: string) {
  try {
    const db = getDatabase();
    db.insert(configTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: configTable.key,
        set: { value },
      })
      .run();
    // 同步到运行时环境，确保同一进程后续读取一致
    process.env[key] = value;
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: { code: 'DB_ERROR', message } };
  }
}

/**
 * 生成每日综合股池综述。
 *
 * 汇总所有股池的最新分析信号和报告，调用 LLM 生成完整的每日投资综述。
 * 流水线完成时会自动触发，也可手动调用。
 *
 * @param date - 可选目标日期（yyyy-MM-dd），默认今天
 * @returns 生成的 DailySummary 对象
 */
export async function generateDailySummaryReport(date?: string) {
  return generateDailySummary(date, false);
}
