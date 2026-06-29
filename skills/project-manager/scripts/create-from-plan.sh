#!/bin/bash
# create-from-plan.sh — 从计划文件创建里程碑和 Issue
# Usage:
#   bash create-from-plan.sh                    # 从预设列表创建里程碑
#   bash create-from-plan.sh <plan.json>        # 从 JSON 计划文件创建里程碑和 Issue
#
# JSON 格式:
# {
#   "milestones": [
#     {
#       "title": "Phase 1",
#       "description": "基础功能",
#       "due_date": "2026-07-15",
#       "issues": [
#         { "title": "实现 X", "label": "feature", "body": "..." },
#         { "title": "修复 Y", "label": "bug", "body": "..." }
#       ]
#     }
#   ]
# }

set -euo pipefail

OWNER="${OWNER:-$(gh repo view --json owner --jq '.owner.login')}"
REPO="${REPO:-$(gh repo view --json name --jq '.name')}"

create_milestone() {
  local title="$1"
  local desc="${2:-}"
  local due="${3:-}"

  echo "Creating milestone: $title ..."
  local args=("--title" "$title" "--description" "$desc")
  if [ -n "$due" ]; then
    args+=("--due-date" "$due")
  fi
  gh api "repos/$OWNER/$REPO/milestones" \
    --method POST \
    --field title="$title" \
    --field description="$desc" \
    ${due:+--field due_on="${due}T23:59:59Z"} \
    --jq '.number'
}

create_issue() {
  local title="$1"
  local label="${2:-}"
  local body="${3:-}"
  local milestone_number="${4:-}"

  echo "  Creating issue: $title ..."
  local args=("--title" "$title")
  if [ -n "$body" ]; then
    args+=("--body" "$body")
  fi
  if [ -n "$label" ]; then
    args+=("--label" "$label")
  fi
  if [ -n "$milestone_number" ]; then
    args+=("--milestone" "$milestone_number")
  fi
  gh issue create "${args[@]}" --repo "$OWNER/$REPO"
}

handle_json_plan() {
  local plan_file="$1"
  if [ ! -f "$plan_file" ]; then
    echo "Error: File not found: $plan_file" >&2
    exit 1
  fi

  local milestones
  milestones=$(jq -c '.milestones[]' "$plan_file")

  echo "=== Creating milestones and issues from: $plan_file ==="
  echo ""

  local milestone_count=0
  local issue_count=0

  while IFS= read -r milestone; do
    local title desc due issues
    title=$(echo "$milestone" | jq -r '.title')
    desc=$(echo "$milestone" | jq -r '.description // ""')
    due=$(echo "$milestone" | jq -r '.due_date // ""')

    local milestone_num
    milestone_num=$(create_milestone "$title" "$desc" "$due")
    milestone_count=$((milestone_count + 1))

    issues=$(echo "$milestone" | jq -c '.issues[]? // []')
    if [ -z "$issues" ] || [ "$issues" = "[]" ]; then
      echo "  (no issues for this milestone)"
      continue
    fi

    while IFS= read -r issue; do
      local issue_title issue_label issue_body
      issue_title=$(echo "$issue" | jq -r '.title')
      issue_label=$(echo "$issue" | jq -r '.label // ""')
      issue_body=$(echo "$issue" | jq -r '.body // ""')
      create_issue "$issue_title" "$issue_label" "$issue_body" "$milestone_num"
      issue_count=$((issue_count + 1))
    done <<< "$issues"
  done <<< "$milestones"

  echo ""
  echo "=== Summary ==="
  echo "Milestones created: $milestone_count"
  echo "Issues created:     $issue_count"
}

handle_default_milestones() {
  echo "=== Creating default milestones ==="

  local milestones_json='[
    {"title": "Phase 0: 项目启动与基础设施", "desc": "开发环境搭建、CI/CD 配置、数据库初始化"},
    {"title": "Phase 1: 核心数据服务",       "desc": "日行情数据获取、存储与查询接口"},
    {"title": "Phase 2: 技术分析引擎",       "desc": "技术指标计算与信号生成"},
    {"title": "Phase 3: LLM 分析流水线",    "desc": "多角色 LLM 分析与报告生成"},
    {"title": "Phase 4: CLI 与插件集成",    "desc": "Commander.js CLI 与 OpenClaw 插件"},
    {"title": "Phase 5: 优化与文档",        "desc": "性能优化、测试覆盖与文档完善"}
  ]'

  local count=0
  for row in $(echo "$milestones_json" | jq -c '.[]'); do
    local title desc
    title=$(echo "$row" | jq -r '.title')
    desc=$(echo "$row" | jq -r '.desc')
    create_milestone "$title" "$desc"
    count=$((count + 1))
  done

  echo ""
  echo "=== Summary ==="
  echo "Milestones created: $count"
}

# --- Main ---
if [ $# -ge 1 ]; then
  handle_json_plan "$1"
else
  handle_default_milestones
fi
