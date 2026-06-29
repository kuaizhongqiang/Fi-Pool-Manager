#!/bin/bash
# ============================================================
# recall.sh — UserPromptSubmit Hook
# 每次用户提交消息前，从 memory 服务召回相关记忆
# 从 .mcp.json 读取连接信息，避免密钥分散存放
# ============================================================
set -e

MCP_JSON=".mcp.json"
SESSION_FILE="/tmp/claude_fi_pool_session"

# 从 .mcp.json 提取 bridge 配置
BRIDGE_URL=$(grep -o '"BRIDGE_URL": *"[^"]*"' "$MCP_JSON" 2>/dev/null | sed 's/.*"BRIDGE_URL": *"\([^"]*\)".*/\1/')
API_KEY=$(grep -o '"API_KEY": *"[^"]*"' "$MCP_JSON" 2>/dev/null | sed 's/.*"API_KEY": *"\([^"]*\)".*/\1/')
SENDER=$(grep -o '"SENDER": *"[^"]*"' "$MCP_JSON" 2>/dev/null | sed 's/.*"SENDER": *"\([^"]*\)".*/\1/')
SENDER=${SENDER:-claude-code}

if [ -z "$BRIDGE_URL" ] || [ -z "$API_KEY" ]; then
  echo "⚠️  memory-hooks: 无法从 .mcp.json 读取配置" >&2
  exit 0
fi

# 读取 hook 上下文（stdin）
HOOK_INPUT=$(cat)

# 提取用户消息（兼容不同 hook 上下文格式）
USER_QUERY=$(echo "$HOOK_INPUT" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"//' 2>/dev/null)
USER_QUERY=${USER_QUERY:-$(echo "$HOOK_INPUT" | head -c 200)}

# 读取 session key
SESSION_KEY=""
if [ -f "$SESSION_FILE" ]; then
  SESSION_KEY=$(cat "$SESSION_FILE")
fi

# 调用 recall API
RECALL_RESULT=$(curl -s -m 5 -X POST "$BRIDGE_URL/recall" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-sender: $SENDER" \
  -d "{\"query\":\"${USER_QUERY:-}\",\"session_key\":\"${SESSION_KEY:-}\"}" 2>/dev/null || echo "")

# 有关联记忆时输出提示
if [ -n "$RECALL_RESULT" ] && [ "$RECALL_RESULT" != "{}" ] && [ "$RECALL_RESULT" != "[]" ]; then
  echo "🧠 已召回相关记忆" >&2
fi

exit 0
