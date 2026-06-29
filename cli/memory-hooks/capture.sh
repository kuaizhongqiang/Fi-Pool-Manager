#!/bin/bash
# ============================================================
# capture.sh — Stop Hook
# 每次 Claude 响应结束后，将对话保存到 memory 服务
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

# 写入临时调试日志（方便排查 hook 问题）
echo "$HOOK_INPUT" > /tmp/claude_capture_last.json 2>/dev/null || true

# 从上下文中提取对话内容
USER_CONTENT=$(echo "$HOOK_INPUT" | grep -o '"user_content":"[^"]*"' | head -1 | sed 's/"user_content":"//;s/"//' 2>/dev/null)
ASSISTANT_CONTENT=$(echo "$HOOK_INPUT" | grep -o '"assistant_content":"[^"]*"' | head -1 | sed 's/"assistant_content":"//;s/"//' 2>/dev/null)
SUMMARY=$(echo "$HOOK_INPUT" | grep -o '"text":"[^"]*"' | tail -1 | sed 's/"text":"//;s/"//' 2>/dev/null)

# 如果提取不到具体内容，用 hook 上下文本身的前 200 字作为摘要
USER_CONTENT="${USER_CONTENT:-$(echo "$HOOK_INPUT" | head -c 200)}"
ASSISTANT_CONTENT="${ASSISTANT_CONTENT:-$(echo "$HOOK_INPUT" | head -c 200)}"

# 读取或初始化 session key
SESSION_KEY=""
if [ -f "$SESSION_FILE" ]; then
  SESSION_KEY=$(cat "$SESSION_FILE")
else
  # 生成新的 session key（项目名+日期）
  SESSION_KEY="fi-pool-$(date +%Y%m%d)"
  echo "$SESSION_KEY" > "$SESSION_FILE"
fi

# 调用 capture API
CAPTURE_RESULT=$(curl -s -m 5 -X POST "$BRIDGE_URL/capture" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-sender: $SENDER" \
  -d "{
    \"user_content\":\"${USER_CONTENT:-}\",
    \"assistant_content\":\"${ASSISTANT_CONTENT:-}\",
    \"session_key\":\"${SESSION_KEY}\"
  }" 2>/dev/null || echo "")

# 检查 capture 是否成功
if echo "$CAPTURE_RESULT" | grep -q '"l0_recorded"'; then
  echo "💾 对话记忆已保存" >&2
else
  # 静默失败 — 不阻塞主流程
  :
fi

exit 0
