#!/usr/bin/env node
/**
 * HTTP 服务入口 — 用于 Docker 部署
 *
 * 启动一个 HTTP 服务器，暴露系统状态检查端点。
 * 主要用途是让 Docker 容器有一个可监听的守护进程。
 *
 * 实际功能通过 CLI 或 OpenClaw 插件调用，HTTP 仅提供健康检查和状态。
 */

import { ensureDatabase } from './db/migrate.js';
import { getDatabase } from './db/index.js';
import * as queryTools from './tools/query.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const PORT = parseInt(process.env.PORT || '3000', 10);

// 获取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let VERSION = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
  VERSION = pkg.version || VERSION;
} catch { /* ignore */ }

// 初始化数据库
ensureDatabase();

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    switch (url.pathname) {
      case '/': {
        res.end(JSON.stringify({ service: 'fi-pool-manager', version: VERSION, status: 'running' }));
        break;
      }
      case '/health': {
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        break;
      }
      case '/status': {
        const status = await queryTools.getSystemStatus();
        res.end(JSON.stringify(status, null, 2));
        break;
      }
      default: {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found', path: url.pathname }));
      }
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Error', message: (err as Error).message }));
  }
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`[server] fi-pool-manager v${VERSION} HTTP server listening on port ${PORT}`);
  console.log(`[server] health: http://localhost:${PORT}/health`);
  console.log(`[server] status: http://localhost:${PORT}/status`);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
