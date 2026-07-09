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
import { readFileSync } from 'node:fs';

// 单一版本号来源：从 package.json 读取（try/catch 防止模块求值期崩溃）
let cliVersion = '0.0.0';
try {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  ) as { version: string };
  cliVersion = pkg.version;
} catch {
  cliVersion = '0.0.0';
}

// ─── .env 自动查找 ───────────────────────────────────────────────
//
// 全局安装后，CLI 可能在任意目录运行，需要向上递归查找 .env。
// 查找顺序：CWD → 父目录 → 祖父目录 → ...（合并所有找到的 .env，后加载的优先级高）
// 最后加载 ~/.fi-pool/.env 和 /etc/fi-pool/.env 作为系统级默认值。
//
// 合并多个 .env 解决用户分散配置的问题（如 workspace/.env 配 LLM,
// Fi-Pool-Manager/.env 配 DASHSCOPE_*）。
function resolveEnvFiles(): string[] {
  const found: string[] = [];

  // 1. 从 CWD 向上递归查找所有 .env
  let dir = process.cwd();
  const root = resolve(dir.split(sep)[0] || '/'); // 文件系统根 (win: "C:\\", posix: "/")
  const upwardFiles: string[] = [];
  while (true) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) upwardFiles.push(candidate);
    const parent = resolve(dir, '..');
    if (parent === dir || parent === root || parent.length >= dir.length) break;
    dir = parent;
  }
  // 上层目录的 .env 先加载，CWD 的 .env 后加载（覆盖上层）
  found.push(...upwardFiles.reverse());

  // 2. 备用：~/.fi-pool/.env
  const homeEnv = resolve(homedir(), '.fi-pool', '.env');
  if (existsSync(homeEnv)) found.push(homeEnv);

  // 3. 备用：/etc/fi-pool/.env
  const etcEnv = '/etc/fi-pool/.env';
  if (existsSync(etcEnv)) found.push(etcEnv);

  return found;
}

// 加载所有找到的 .env（后加载的覆盖先加载的）
const envFiles = resolveEnvFiles();
if (envFiles.length > 0) {
  for (const f of envFiles) {
    dotenv.config({ path: f });
  }
} else {
  // 兜底：尝试加载 CWD 的 .env
  dotenv.config();
}

// 支持 --config 显式指定配置文件路径（最高优先级）
const configIndex = process.argv.indexOf('--config');
if (configIndex !== -1 && configIndex + 1 < process.argv.length) {
  const explicitPath = resolve(process.cwd(), process.argv[configIndex + 1]);
  if (existsSync(explicitPath)) {
    dotenv.config({ path: explicitPath, override: true });
    envFiles.push(explicitPath);
  }
}

// 启动诊断：打印 .env 加载情况和关键配置状态
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
if (envFiles.length > 0) {
  console.error(`[fi-pool] 已加载 ${envFiles.length} 个 .env 文件:`);
  for (const f of envFiles) {
    console.error(`  - ${f}`);
  }
} else {
  console.error('[fi-pool] 未找到 .env 文件，将使用默认配置');
}
if (DASHSCOPE_KEY && DASHSCOPE_KEY.trim()) {
  console.error(`[fi-pool] DASHSCOPE_API_KEY 已配置 (${DASHSCOPE_KEY.slice(0, 4)}...${DASHSCOPE_KEY.slice(-4)})`);
} else {
  console.error('[fi-pool] ⚠ DASHSCOPE_API_KEY 未配置，Stage 3 舆情搜索将跳过');
  console.error('  如需舆情搜索，请在 .env 中添加:');
  console.error('    DASHSCOPE_API_KEY=sk-...');
  console.error('    DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1');
  console.error('    DASHSCOPE_MODEL=qwen3.5-flash');
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
  .version(cliVersion)
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
  .description('对股池所有股票运行完整流水线（支持多个池 ID 串行执行）')
  .argument('[poolIds...]', '股池 ID（可传多个，如 1 2 3；或用 --all / --missing）')
  .option('--all', '对所有股池串行执行')
  .option('--force', '强制重新执行（跳过缓存检查）')
  .option('--missing', '补跑模式：仅执行今日未完成的股票（自动识别已完成）')
  .action(async (poolIds: string[], options: { all?: boolean; force?: boolean; missing?: boolean }) => {
    try {
      let ids: number[] | undefined;
      if (options.all || options.missing) {
        const pools = await exec.listAllPools();
        ids = pools.map(p => p.id);
        const mode = options.missing ? '补跑' : '全量';
        console.log(`[run-pool-pipeline] ${mode}模式: 对所有 ${ids.length} 个股池执行`);
      } else {
        ids = (poolIds || []).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (ids.length === 0) {
          printError('请指定至少一个有效的股池 ID（或使用 --all / --missing）');
          return;
        }
      }
      const result = await exec.runPoolFullPipeline(ids, options.force, options.missing);
      if (result.success) {
        const skipped = result.data?.skipped ?? 0;
        const total = result.data?.total ?? 0;
        const failed = result.data?.failed ?? 0;
        const parts = [`新执行 ${total} 只`];
        if (skipped > 0) parts.push(`跳过 ${skipped} 只`);
        if (failed > 0) parts.push(`失败 ${failed} 只`);
        printSuccess(`股池全流水线完成: ${parts.join('，')}`);
      } else {
        printError(result.error?.message ?? '流水线失败');
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('pipeline-log')
  .description('查看流水线运行历史')
  .argument('[date]', '可选日期 yyyy-MM-dd（默认显示最近 20 条）')
  .option('--id <runId>', '查看指定 runId 的详细记录')
  .action(async (date?: string, options?: { id?: string }) => {
    try {
      if (options?.id) {
        const detail = await query.getPipelineRunDetail(options.id);
        if (!detail) {
          printError('未找到该流水线运行记录');
          return;
        }
        console.log(`\n  📋 流水线运行详情`);
        console.log(`  ${'─'.repeat(40)}`);
        console.log(`  ID: ${detail.runId}`);
        console.log(`  日期: ${detail.date}`);
        console.log(`  模式: ${detail.mode}`);
        console.log(`  状态: ${detail.status}`);
        console.log(`  股池: ${detail.poolIds}`);
        console.log(`  总股票: ${detail.totalStocks}`);
        console.log(`  完成: ${detail.completedStocks}`);
        console.log(`  跳过: ${detail.skippedStocks}`);
        console.log(`  失败: ${detail.failedStocks}`);
        if (detail.durationSeconds) console.log(`  耗时: ${Math.round(detail.durationSeconds)}秒`);
        if (detail.avgStockDuration) console.log(`  平均: ${detail.avgStockDuration.toFixed(1)}秒/只`);
        if (detail.args) console.log(`  参数: ${detail.args}`);
        console.log(`  开始: ${detail.startedAt}`);
        if (detail.finishedAt) console.log(`  结束: ${detail.finishedAt}`);
      } else {
        const runs = await query.listPipelineRuns(date);
        if (runs.length === 0) {
          console.log('  (无流水线运行记录)');
          return;
        }
        console.log(`\n  📋 流水线运行日志 ${date ? `— ${date}` : ''}`);
        console.log(`  ${'─'.repeat(50)}`);
        for (const r of runs) {
          const icon = r.status === 'completed' ? '✓' : r.status === 'running' ? '▶' : '✗';
          const dur = r.durationSeconds ? `, ${Math.round(r.durationSeconds)}秒` : '';
          const avg = r.avgStockDuration ? `, ~${r.avgStockDuration.toFixed(0)}秒/只` : '';
          console.log(`  ${icon} ${r.runId.slice(0, 24)}`);
          console.log(`     日期:${r.date} 模式:${r.mode} 状态:${r.status}${dur}${avg}`);
          console.log(`     进度: ${r.completedStocks}/${r.totalStocks} 完成, 跳过 ${r.skippedStocks}, 失败 ${r.failedStocks}`);
          console.log();
        }
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

// ─── Pipeline 控制 ─────────────────────────────────────────────

program
  .command('stop-pipeline')
  .description('停止指定运行中的流水线')
  .argument('<pipelineId>', '流水线 ID（如 pipe-xxx）')
  .action(async (pipelineId: string) => {
    try {
      const result = await exec.stopPipeline(pipelineId);
      if (result.data?.cancelled) {
        printSuccess(`流水线 ${pipelineId} 已取消`);
      } else {
        console.warn(`流水线 ${pipelineId} 不存在或已结束`);
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('list-pipelines')
  .description('列出所有运行中的流水线')
  .action(async () => {
    try {
      const pipelines = await exec.listPipelines();
      if (pipelines.length === 0) {
        console.log('(无运行中的流水线)');
      } else {
        pipelines.forEach((id: string) => console.log(`  ${id}`));
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
  .description('⚠ DEPRECATED: 请使用 daily-summary-v2 替代（v1 因 prompt 过长始终 400）')
  .argument('[date]', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (date?: string) => {
    console.warn('\n⚠ [DEPRECATED] daily-summary v1 已废弃，因 MAX_INPUT_TOKENS=3000 限制始终返回 400 错误。');
    console.warn('  请使用 daily-summary-v2 替代:\n    fi-pool daily-summary-v2 [date]\n');
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
  .option('--verbose', '输出详细的诊断信息（各池覆盖率、分数分布等）')
  .action(async (date?: string, options?: { verbose?: boolean }) => {
    try {
      const result = await dailySummaryV2Service.generateDailySummaryV2(date, options?.verbose);
      dailySummaryV2Service.printDailySummaryV2(result);
    } catch (err) {
      printError((err as Error).message);
    }
  });

// ─── Diagnostic Commands (v0.4.0) ────────────────────────────────────

program
  .command('check-data')
  .description('检查某日期的数据完成度——各池的 final_report 覆盖情况')
  .argument('[date]', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (date?: string) => {
    try {
      const report = await query.checkDataCompleteness(date);
      console.log(`\n  📊 数据完成度检查 — ${report.date}`);
      console.log(`  ${'─'.repeat(40)}`);
      console.log(`  总池股票: ${report.totalStocksInPools}`);
      console.log(`  Final Report: ${report.totalFinalReports}`);
      console.log(`  异常分数分布: min=${report.scoreDistribution.min}, max=${report.scoreDistribution.max}, avg=${report.scoreDistribution.avg}, >2.5阈值=${report.scoreDistribution.aboveThreshold}`);
      console.log();
      for (const p of report.pools) {
        const status = p.withReport === p.totalStocks ? '✓' : p.withReport > 0 ? '◐' : '○';
        console.log(`  ${status} 池 #${p.poolId} ${p.poolName}: ${p.withReport}/${p.totalStocks}`);
        if (p.withoutReport > 0 && p.pendingStocks.length <= 5) {
          console.log(`     未完成: ${p.pendingStocks.join(', ')}`);
        } else if (p.withoutReport > 0) {
          console.log(`     未完成: ${p.pendingStocks.length} 只`);
        }
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('pool-status')
  .description('查看指定股池的分析进度——各股票在指定日期的 final_report 状态')
  .argument('<poolId>', '股池 ID')
  .option('--date <date>', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (poolId: string, options: { date?: string }) => {
    try {
      const status = await query.getPoolAnalysisStatus(parseInt(poolId, 10), options.date);
      console.log(`\n  📋 股池分析状态 — ${status.poolName} (${status.date})`);
      console.log(`  ${'─'.repeat(40)}`);
      console.log(`  总股票: ${status.totalStocks}`);
      console.log(`  已完成: ${status.completedStocks}`);
      console.log(`  待完成: ${status.pendingStocks}`);
      console.log();
      for (const s of status.stocks) {
        const icon = s.hasReport ? '✓' : '○';
        const score = s.anomalyScore !== null ? ` 异常分: ${s.anomalyScore.toFixed(1)}` : '';
        console.log(`  ${icon} ${s.code} ${s.name}${score}`);
      }
    } catch (err) {
      printError((err as Error).message);
    }
  });

program
  .command('summary-status')
  .description('查看某日 daily-summary 的执行状态')
  .argument('[date]', '目标日期 yyyy-MM-dd（默认今天）')
  .action(async (date?: string) => {
    try {
      const status = await query.getDailySummaryStatus(date);
      console.log(`\n  📋 每日综述状态 — ${status.date}`);
      console.log(`  ${'─'.repeat(40)}`);
      if (status.hasSummary) {
        console.log(`  ✓ 综述已生成`);
        console.log(`  异常股票: ${status.summaryRecord!.anomalyCount}`);
        console.log(`  涉及总股票: ${status.summaryRecord!.totalStocks}`);
        console.log(`  模型: ${status.summaryRecord!.modelUsed || '默认'}`);
        console.log(`  概述长度: ${status.summaryRecord!.overviewLength} 字符`);
        console.log(`  创建时间: ${status.summaryRecord!.createdAt}`);
      } else {
        console.log(`  ○ 综述未生成`);
      }
      console.log(`  维度分析条目: ${status.detailCount}`);
      console.log(`  涉及异常股票: ${status.stockCountInDetail}`);
      if (Object.keys(status.byDimension).length > 0) {
        console.log(`  按维度分布:`);
        for (const [dim, count] of Object.entries(status.byDimension)) {
          console.log(`    ${dim}: ${count} 条`);
        }
      }
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
