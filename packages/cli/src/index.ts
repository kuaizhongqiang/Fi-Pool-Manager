#!/usr/bin/env node

/**
 * fi-pool-cli
 * Fi-Pool-Manager CLI 命令行入口
 *
 * 基于 Commander.js 实现。
 * 所有命令调用 fi-pool-server 的核心逻辑。
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve, sep } from 'path';
import { homedir } from 'os';
import { Command } from 'commander';

// ─── .env 自动查找 ───────────────────────────────────────────────
//
// 全局安装后，CLI 可能在任意目录运行，需要向上递归查找 .env。
// 查找顺序：CWD → 父目录 → 祖父目录 → ... → ~/.fi-pool/.env
function resolveEnvFile(): string | undefined {
  // 1. 从 CWD 向上递归查找 .env
  let dir = process.cwd();
  const root = resolve(dir.split(sep)[0] || '/'); // 文件系统根 (win: "C:\\", posix: "/")
  while (true) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir || parent === root || parent.length >= dir.length) break;
    dir = parent;
  }

  // 2. 备用：~/.fi-pool/.env
  const homeEnv = resolve(homedir(), '.fi-pool', '.env');
  if (existsSync(homeEnv)) return homeEnv;

  // 3. 备用：/etc/fi-pool/.env
  const etcEnv = '/etc/fi-pool/.env';
  if (existsSync(etcEnv)) return etcEnv;

  return undefined; // 没找到就靠默认值
}

const envPath = resolveEnvFile();
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  // 兜底：尝试加载 CWD 的 .env（原来的行为）
  dotenv.config();
}

// 支持 --config 显式指定配置文件路径
const configIndex = process.argv.indexOf('--config');
if (configIndex !== -1 && configIndex + 1 < process.argv.length) {
  const explicitPath = resolve(process.cwd(), process.argv[configIndex + 1]);
  if (existsSync(explicitPath)) {
    dotenv.config({ path: explicitPath, override: true });
  }
}
// ─────────────────────────────────────────────────────────────────

import { ensureDatabase } from 'fi-pool-server/db/migrate.js';
import * as manager from 'fi-pool-server/tools/manager.js';
import * as query from 'fi-pool-server/tools/query.js';
import * as cmd from 'fi-pool-server/tools/command.js';
import * as exec from 'fi-pool-server/tools/execute.js';
import * as aux from 'fi-pool-server/tools/auxiliary.js';
import * as dailySummaryService from 'fi-pool-server/services/daily-summary.js';
import * as dailySummaryV2Service from 'fi-pool-server/services/daily-summary-v2.js';
import { startApiServer } from 'fi-pool-server/api/index.js';

// ─── 输出格式化辅助 ───────────────────────────────────────────

const PAD = 2;

function padRight(s: string, len: number): string {
  const visible = s.replace(/\x1b\[\d+m/g, '');
  return s + ' '.repeat(Math.max(0, len - visible.length));
}

function formatTable(rows: Record<string, unknown>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log('  (空)');
    return;
  }

  // 计算每列最大宽度
  const colWidths = columns.map((col) => {
    const headerLen = col.length;
    const dataLen = Math.max(
      ...rows.map((r) => String(r[col] ?? '').length),
    );
    return Math.max(headerLen, dataLen) + PAD;
  });

  // 表头
  const header = columns
    .map((col, i) => padRight(col, colWidths[i]))
    .join('');
  console.log('  ' + header);
  console.log('  ' + '─'.repeat(header.length));

  // 数据行
  for (const row of rows) {
    const line = columns
      .map((col, i) => padRight(String(row[col] ?? ''), colWidths[i]))
      .join('');
    console.log('  ' + line);
  }
}

function printKeyValue(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    console.log(`  ${label}: ${value}`);
  }
}

function printSuccess(msg: string): void {
  console.log('✓ ' + msg);
}

function printError(msg: string): void {
  console.error('✗ ' + msg);
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printReport(text: string): void {
  console.log(text);
}

// ─── 程序 ───────────────────────────────────────────────────────

const program = new Command();

program
  .name('fi-pool')
  .description('A股股池管理服务端')
  .version('0.3.0')
  .option('--config <path>', '指定 .env 配置文件路径（默认自动向上递归查找）');

// ─── Pool Management ────────────────────────────────────────────

const poolCmd = program.command('pool').description('股池管理');

poolCmd
  .command('create')
  .description('创建新的股票池')
  .argument('<name>', '池子名称')
  .argument('[desc]', '可选描述')
  .action(async (name: string, desc?: string) => {
    try {
      const result = await manager.createPool(name, desc);
      if (result.success) {
        printSuccess(`创建股票池成功: id=${result.data?.id}`);
      } else {
        printError(result.error?.message ?? '创建失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

poolCmd
  .command('delete')
  .description('删除指定股池')
  .argument('<id>', '股池 ID')
  .action(async (id: string) => {
    try {
      const result = await manager.deletePool(parseInt(id, 10));
      if (result.success) {
        printSuccess('删除股票池成功');
      } else {
        printError(result.error?.message ?? '删除失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

poolCmd
  .command('update')
  .description('修改股池信息')
  .argument('<id>', '股池 ID')
  .option('--name <name>', '新名称')
  .option('--desc <desc>', '新描述')
  .action(async (id: string, options: { name?: string; desc?: string }) => {
    try {
      const result = await manager.updatePool(parseInt(id, 10), options.name, options.desc);
      if (result.success) {
        printSuccess('更新股票池成功');
      } else {
        printError(result.error?.message ?? '更新失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

poolCmd
  .command('add-stocks')
  .description('向股池添加股票')
  .argument('<poolId>', '股池 ID')
  .argument('<codes...>', '股票代码列表')
  .action(async (poolId: string, codes: string[]) => {
    try {
      const result = await manager.addStocks(parseInt(poolId, 10), codes);
      if (result.success) {
        printSuccess(`添加 ${result.data?.added} 只股票成功，跳过 ${result.data?.skipped} 只`);
      } else {
        printError(result.error?.message ?? '添加失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

poolCmd
  .command('remove-stocks')
  .description('从股池移除股票')
  .argument('<poolId>', '股池 ID')
  .argument('<codes...>', '股票代码列表')
  .action(async (poolId: string, codes: string[]) => {
    try {
      const result = await manager.removeStocks(parseInt(poolId, 10), codes);
      if (result.success) {
        printSuccess(`移除 ${result.data?.removed} 只股票成功`);
      } else {
        printError(result.error?.message ?? '移除失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

poolCmd
  .command('set-signal')
  .description('设置股池信号')
  .argument('<poolId>', '股池 ID')
  .argument('<signal>', '信号值 (-1 看空 / 0 中性 / 1 看多)')
  .action(async (poolId: string, signal: string) => {
    try {
      const result = await manager.setPoolSignal(parseInt(poolId, 10), parseInt(signal, 10));
      if (result.success) {
        printSuccess('设置股池信号成功');
      } else {
        printError(result.error?.message ?? '设置失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── Query ──────────────────────────────────────────────────────

program
  .command('list-pools')
  .description('列出所有股池')
  .action(async () => {
    try {
      const pools = await query.listPools();
      if (pools.length === 0) {
        console.log('  (暂无股池)');
        return;
      }
      formatTable(
        pools as Record<string, unknown>[],
        ['id', 'name', 'desc', 'stockCount', 'poolSignal'],
      );
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('get-stock')
  .description('查股票基本信息')
  .argument('<code>', '股票代码')
  .action(async (code: string) => {
    try {
      const stock = await query.getStockInfo(code);
      if (!stock) {
        printError('股票不存在');
        return;
      }
      printKeyValue(stock as Record<string, unknown>);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('get-daily')
  .description('查日行情数据')
  .argument('<code>', '股票代码')
  .argument('[startDate]', '起始日期 yyyy-MM-dd')
  .argument('[endDate]', '结束日期 yyyy-MM-dd')
  .action(async (code: string, startDate?: string, endDate?: string) => {
    try {
      const data = await query.getDailyInfo(code, startDate, endDate);
      if (data.length === 0) {
        console.log('  (无日行情数据)');
        return;
      }
      formatTable(
        data as Record<string, unknown>[],
        ['date', 'open', 'close', 'high', 'low', 'volume'],
      );
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('get-analysis')
  .description('查客观分析报告')
  .argument('<code>', '股票代码')
  .argument('<date>', '日期 yyyy-MM-dd')
  .option('--mode <mode>', '输出模式 (overview|full)', 'overview')
  .action(async (code: string, date: string, options: { mode: string }) => {
    try {
      const report = await query.getAnalysisReport(code, date, options.mode as 'overview' | 'full');
      if (!report) {
        printError('未找到分析报告');
        return;
      }
      if (options.mode === 'full') {
        printJson(report);
      } else {
        console.log(`  ${report.date} ${report.code}`);
        console.log('  ' + report.summary.slice(0, 500));
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('get-final')
  .description('查最终报告')
  .argument('<code>', '股票代码')
  .argument('<date>', '日期 yyyy-MM-dd')
  .option('--mode <mode>', '输出模式 (overview|full)', 'overview')
  .action(async (code: string, date: string, options: { mode: string }) => {
    try {
      const report = await query.getFinalReport(code, date, options.mode as 'overview' | 'full');
      if (!report) {
        printError('未找到最终报告');
        return;
      }
      if (options.mode === 'full') {
        printJson(report);
      } else {
        console.log(`  ${report.date} ${report.code}`);
        console.log('  ' + report.summary.slice(0, 500));
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('status')
  .description('查看系统运行状态')
  .action(async () => {
    try {
      const status = await query.getSystemStatus();
      printKeyValue(status);
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── Command ────────────────────────────────────────────────────

program
  .command('output-analysis')
  .description('输出客观分析报告')
  .argument('<code>', '股票代码')
  .argument('<date>', '日期 yyyy-MM-dd')
  .option('--mode <mode>', '输出模式 (overview|full)', 'overview')
  .action(async (code: string, date: string, options: { mode: string }) => {
    try {
      const result = await cmd.outputAnalysisReport(code, date, options.mode as 'overview' | 'full');
      printJson(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('output-final')
  .description('输出最终综合报告')
  .argument('<code>', '股票代码')
  .argument('<date>', '日期 yyyy-MM-dd')
  .option('--mode <mode>', '输出模式 (overview|full)', 'overview')
  .action(async (code: string, date: string, options: { mode: string }) => {
    try {
      const result = await cmd.outputFinalReport(code, date, options.mode as 'overview' | 'full');
      printJson(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('output-pool')
  .description('输出股池综合报告')
  .argument('<poolId>', '股池 ID')
  .option('--mode <mode>', '输出模式 (overview|full)', 'overview')
  .action(async (poolId: string, options: { mode: string }) => {
    try {
      const result = await cmd.outputPoolReport(parseInt(poolId, 10), options.mode as 'overview' | 'full');
      printJson(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('search')
  .description('语义搜索历史分析报告')
  .argument('<query>', '搜索查询')
  .option('--limit <n>', '返回条数', '10')
  .option('--type <type>', '搜索类型 (analysis|final|all)', 'all')
  .action(async (queryStr: string, options: { limit: string; type: string }) => {
    try {
      const results = await cmd.semanticSearch(
        queryStr,
        parseInt(options.limit, 10),
        options.type as 'analysis' | 'final' | 'all',
      );
      if (results.length === 0) {
        console.log('  (无匹配结果)');
        return;
      }
      formatTable(
        results as unknown as Record<string, unknown>[],
        ['type', 'code', 'date', 'relevance'],
      );
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('session')
  .description('管理 LLM 对话 Session')
  .argument('<action>', '操作 (new|switch|list|current)')
  .argument('[sessionId]', '会话 ID (switch 时指定)')
  .action(async (action: string, sessionId?: string) => {
    try {
      const result = await cmd.sessionManage(
        action as 'new' | 'switch' | 'list' | 'current',
        sessionId,
      );
      printJson(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── Execute ────────────────────────────────────────────────────

program
  .command('run-analysis')
  .description('运行本地分析')
  .argument('<code>', '股票代码')
  .action(async (code: string) => {
    try {
      const result = await exec.runLocalAnalysis(code);
      if (result.success) {
        printSuccess(`本地分析完成: date=${result.data?.date}`);
      } else {
        printError(result.error?.message ?? '分析失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('run-pipeline')
  .description('运行完整流水线')
  .argument('<code>', '股票代码')
  .action(async (code: string) => {
    try {
      const result = await exec.runFullPipeline(code);
      if (result.success) {
        printSuccess(`全流水线完成: date=${result.data?.date}`);
      } else {
        printError(result.error?.message ?? '流水线失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('run-pool-analysis')
  .description('对股池所有股票运行本地分析')
  .argument('<poolId>', '股池 ID')
  .action(async (poolId: string) => {
    try {
      const result = await exec.runPoolAnalysis(parseInt(poolId, 10));
      if (result.success) {
        printSuccess(`股池本地分析完成: 共 ${result.data?.total} 只股票`);
      } else {
        printError(result.error?.message ?? '分析失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('run-pool-pipeline')
  .description('对股池所有股票运行完整流水线')
  .argument('<poolId>', '股池 ID')
  .action(async (poolId: string) => {
    try {
      const result = await exec.runPoolFullPipeline(parseInt(poolId, 10));
      if (result.success) {
        printSuccess(`股池全流水线完成: 共 ${result.data?.total} 只股票`);
      } else {
        printError(result.error?.message ?? '流水线失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('refresh')
  .description('刷新最新行情数据')
  .argument('[code]', '可选股票代码')
  .action(async (code?: string) => {
    try {
      const result = await exec.refreshData(code);
      if (result.success) {
        printSuccess(`刷新完成: 更新 ${result.data?.updated} 条日行情数据`);
      } else {
        printError(result.error?.message ?? '刷新失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── Auxiliary ──────────────────────────────────────────────────

program
  .command('help')
  .description('显示帮助信息')
  .argument('[command]', '可选命令名称')
  .action(async (command?: string) => {
    try {
      const helpText = await aux.help(command);
      printReport(helpText);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('daily-summary')
  .description('生成每日综合股池综述（v1，兼容旧数据）')
  .argument('[date]', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (date?: string) => {
    try {
      const result = await aux.generateDailySummaryReport(date);
      dailySummaryService.printDailySummary(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('daily-summary-v2')
  .description('生成每日综合股池综述（v2，异常值驱动 + 多维分析 + RAG）')
  .argument('[date]', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (date?: string) => {
    try {
      const result = await dailySummaryV2Service.generateDailySummaryV2(date);
      dailySummaryV2Service.printDailySummaryV2(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('list')
  .description('列出可用资源')
  .argument('<type>', '资源类型 (pools|stocks|tools)')
  .action(async (type: string) => {
    try {
      const result = await aux.listResources(type as 'pools' | 'stocks' | 'tools');
      if (result.items.length === 0) {
        console.log(`  (无 ${type} 资源)`);
        return;
      }
      formatTable(result.items, ['id', 'name']);
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('version')
  .description('输出版本信息')
  .action(async () => {
    try {
      const versionStr = await aux.showVersion();
      printReport(versionStr);
    } catch (err) {
      printError((err as Error).message);
    }
  });

const configCmd = program.command('config').description('配置管理');

configCmd
  .command('get')
  .description('查看配置')
  .argument('[key]', '可选配置键名')
  .action(async (key?: string) => {
    try {
      const result = await aux.getConfig(key);
      printJson(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

configCmd
  .command('set')
  .description('设置配置')
  .argument('<key>', '配置键名')
  .argument('<value>', '配置值')
  .action(async (key: string, value: string) => {
    try {
      const result = await aux.setConfig(key, value);
      if (result.success) {
        printSuccess(`设置 ${key}=${value} 成功`);
      } else {
        printError(result.error?.message ?? '设置失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('serve')
  .description('启动 REST API 服务器（供 external tools 使用）')
  .option('-p, --port <port>', '端口号', '3721')
  .action((options: { port: string }) => {
    try {
      startApiServer(parseInt(options.port, 10));
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── 启动 ─────────────────────────────────────────────────────────

// 初始化数据库
ensureDatabase();

program.parse(process.argv);
