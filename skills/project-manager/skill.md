---
name: project-manager
description: GitHub 项目管理 — Milestone / Issue / PR 全生命周期管理
model: sonnet
trigger: |
  /milestone|/issue|/pr|/sprint|项目进度|迭代报告|创建里程碑|创建 issue|进度报告
---

# Project Manager Skill

GitHub 项目自动化管理 Skill，基于 `gh` CLI 操作。

## 可用命令

### `/milestone` — 里程碑管理

- `list` — 列出所有里程碑及进度
- `create <name> <desc>` — 创建新里程碑
- `close <number>` — 关闭里程碑
- `progress` — 显示各里程碑完成进度条

### `/issue` — Issue 管理

- `list [milestone] [label]` — 按条件列出 issues
- `create <title>` — 批量创建 issue（支持 `docs/project-plan.md` 结构）
- `status` — 按 milestone/label 聚合统计

### `/pr` — PR 管理

- `create <branch> <title>` — 创建 PR 并关联 issue
- `merge <number>` — 合并 PR

### `/sprint` — 迭代报告

- `report` — 生成当前迭代进度报告（Markdown 表格）
- `burndown` — 生成燃尽图 JSON 数据

## 工作流程

### 从计划文档创建里程碑和 Issue

1. 读取 `docs/project-plan.md` 或 `docs/*.md`
2. 解析各 Phase 的标题和子任务
3. 调用 `gh api` 批量创建里程碑
4. 为每个子任务创建 Issue，分配里程碑和标签
5. 返回创建的统计摘要

### 生成进度报告

1. 查询所有里程碑
2. 对每个里程碑查询其 issues（open/closed）
3. 计算完成百分比
4. 输出 Markdown 表格

## 依赖

- `gh` CLI（已验证可用）
- GitHub CLI 认证（`gh auth status`）
