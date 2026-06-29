#!/usr/bin/env node

/**
 * @fi-pool/cli
 * Fi-Pool-Manager CLI 命令行入口
 *
 * 基于 Commander.js 实现。
 * 所有命令调用 @fi-pool/server 的核心逻辑。
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('fi-pool')
  .description('A股股池管理服务端')
  .version('0.1.0');

program.parse(process.argv);
