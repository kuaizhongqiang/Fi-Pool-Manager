# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

Fi-Pool-Manager 是一个 A 股股池管理服务端，用于管理 A 股股票池、进行数据分析并提供投资建议。项目部署在 Ubuntu 服务器上，通过 CLI 命令和 MCP（Model Context Protocol）插件进行控制。目前处于早期阶段，尚无应用代码，仅完成了 Claude Code / CodeBuddy 集成基础设施。

## Commands

### Memory Hook Scripts

- **Recall memories**: `bash cli/memory-hooks/recall.sh` — 在用户提交消息前从 agent-memory 服务召回相关记忆。该脚本从 `.mcp.json` 读取连接配置（BRIDGE_URL、API_KEY），提取用户查询内容，调用 `/recall` API 获取相关历史记忆。
- **Capture conversation**: `bash cli/memory-hooks/capture.sh` — 在 AI 响应结束后将当前对话保存到 agent-memory 服务。提取用户输入和助手回复，调用 `/capture` API 存储。Session Key 维护在 `/tmp/claude_fi_pool_session`，由脚本自动创建和复用。

这两个脚本不直接手动调用，而是由 CodeBuddy hooks 在 `UserPromptSubmit` 和 `Stop` 事件时自动触发，配置位于 `.claude/settings.local.json`。

## Architecture

### 整体架构

项目当前分为两个核心层：

**1. MCP 服务层** — 通过 `.mcp.json` 配置外部 MCP 服务。当前连接：
- `agent-memory`（stdio 类型）：跨项目共享的 agent 记忆服务，使用 `tencent-agent-memory-mcp-bridge` 作为桥接，后端地址为 `memory.kuai-private.top/api/v1`。提供记忆存储、召回、搜索能力。API Key 和 Sender 标识通过 env 注入，不硬编码在脚本中。

**2. Auto Memory 自动记忆层** — 通过 CodeBuddy hooks 机制实现自动记忆管理：

```
用户提交消息
    ↓
UserPromptSubmit hook 触发
    ↓
recall.sh → 从 .mcp.json 读取配置 → 调用 /recall API → 获取相关历史记忆注入上下文
    ↓
AI 生成响应
    ↓
Stop hook 触发
    ↓
capture.sh → 从 .mcp.json 读取配置 → 调用 /capture API → 保存本轮对话到 memory
```

### 关键设计决策

- **配置单一来源**：所有脚本从 `.mcp.json` 动态解析连接信息（BRIDGE_URL、API_KEY、SENDER），而非重复存储密钥，确保配置一致性。
- **Session 管理**：Session Key 格式为 `fi-pool-YYYYMMDD`，按天轮换，存储在 `/tmp/claude_fi_pool_session`，多轮对话复用同一 session 以保持记忆连续性。
- **静默失败**：两个 hook 脚本均设计为静默失败——记忆召回或存储失败时不阻塞主流程（`exit 0`），错误信息输出到 stderr 仅作调试用途。
- **Hook 生命周期**：recall.sh 超时 10 秒，capture.sh 超时 15 秒，防止记忆服务延迟影响用户体验。

### 待建设方向

项目暂无实际应用代码。根据 CLAUDE.md 描述，未来将建设：
- 股票池数据管理模块
- 数据分析与投资建议引擎
- 本项目自身的 MCP tools（供外部 AI 代理调用）
- Ubuntu 服务器端的 CLI 管理命令
