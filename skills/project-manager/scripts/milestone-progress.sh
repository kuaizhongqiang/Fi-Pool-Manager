#!/bin/bash
# milestone-progress.sh — 显示里程碑进度
set -euo pipefail

echo "| Milestone | Total | Open | Closed | Progress |"
echo "|-----------|-------|------|--------|----------|"

gh api repos/:owner/:repo/milestones --jq '.[] |
  "| \(.title) | \(.open_issues + .closed_issues) | \(.open_issues) | \(.closed_issues) | \(if .open_issues + .closed_issues > 0 then ((.closed_issues / (.open_issues + .closed_issues) * 100) | floor | tostring) + "%" else "N/A" end) |"'
