# CLI 使用指南

面向自动化 Agent 的完整操作手册。

## 典型工作流

### 完整流程（推荐顺序）

```bash
# 1. 检查数据就绪状态
fi-pool check-data                 # 查看各池数据完成度
fi-pool pool-status 1              # 查看池1各股票分析进度
fi-pool pool-status 2              # 查看池2各股票分析进度

# 2. 运行流水线（如有需要）
fi-pool run-pool-pipeline 1 2      # 支持断点重开，已完成的跳过

# 3. 每日综述
fi-pool daily-summary-v2           # 生成每日综述
fi-pool daily-summary-v2 --verbose # 带诊断信息的综述

# 4. 验证结果
fi-pool summary-status             # 查看综述状态
fi-pool check-data                 # 确认数据已覆盖
```

### 断点重开场景

```bash
# 场景：流水线执行到一半中断了
# 直接重新执行即可——已完成的自动跳过
fi-pool run-pool-pipeline --all

# 如果中途新增了股票，也会自动增量执行
```

### 故障排查场景

```bash
# 场景：daily-summary-v2 看起来只扫了部分股票
# 先用 --verbose 查看详情
fi-pool daily-summary-v2 --verbose

# 再用 check-data 确认各池 coverage
fi-pool check-data

# 然后确认各池股票是否都有 final_report
fi-pool pool-status 1
fi-pool pool-status 2

# 如果某个池缺数据，运行流水线补上
fi-pool run-pool-pipeline <poolId>
```

## 命令速查

### 执行前 — 系统状态了解

| 命令 | 作用 | 推荐场景 |
|------|------|----------|
| `status` | 查看版本、DB 大小、LLM 连接 | 首次连接 |
| `list-pools` | 列出所有股池及股票数 | 了解有哪些池 |
| `check-data [date]` | 各池数据完成度 + 分数分布 | **执行 daily-summary 前必查** |
| `pool-status <id>` | 池内各股票分析进度明细 | 排查某个池的问题 |
| `summary-status [date]` | 查看每日综述执行状态 | 确认 previous 综述已生成 |

### 执行中 — 流水线控制

| 命令 | 作用 | 推荐场景 |
|------|------|----------|
| `run-pool-pipeline <ids...>` | 池流水线（支持断点重开） | 全量/增量分析 |
| `run-pool-pipeline --all` | 所有池串行执行 | 快速一次性跑完 |
| `run-pool-pipeline --all --force` | 强制重新执行全部 | 需要覆盖重跑时 |
| `stop-pipeline <id>` | 停止运行中的流水线 | 误操作或超时 |
| `list-pipelines` | 列出运行中的流水线 | 查看当前执行状态 |

### 执行后 — 结果查看

| 命令 | 作用 | 推荐场景 |
|------|------|----------|
| `daily-summary-v2 [date]` | 生成每日综述 | 流水线完成后 |
| `daily-summary-v2 --verbose` | 带诊断的综述 | 排查数据问题时 |
| `summary-status [date]` | 查看综述执行状态 | 确认生成了没 |
| `check-data [date]` | 确认数据覆盖 | 验证所有池都被覆盖 |
| `get-analysis <code> <date>` | 查看个股客观分析 | 排查个股数据 |
| `get-final <code> <date>` | 查看个股最终报告 | 查看最终结论 |

## 常见问题

### Q: daily-summary-v2 的输出"共 X 只"少于预期

按照以下顺序排查：

```bash
# 1. 带 verbose 运行，看各池覆盖情况
fi-pool daily-summary-v2 --verbose

# 2. 检查各池数据完成度
fi-pool check-data

# 3. 看具体是哪个池缺数据，然后补跑
fi-pool pool-status 1
fi-pool run-pool-pipeline 1
```

常见原因：
- 某个池在这个日期还没跑过流水线（缺 final_report）
- 流水线被中断了（用 check-data + pool-status 确认）
- 分数分布偏低，都在 2.5 阈值以下（verbose 可见）

### Q: 流水线跑到一半断了怎么办？

直接重新执行，断点重开会自动跳过已完成的：

```bash
fi-pool run-pool-pipeline --all
# 输出示例：
# [runPoolFullPipeline] [1/26] 000XXX 已有 final_report, 跳过
# [runPoolFullPipeline] [2/26] 000XXX 开始执行...
```

### Q: 怎么知道所有股票都分析完了？

```bash
fi-pool check-data
# 如果每一行都显示 X/X，说明全部完成
# ✓ 池 #1 AI算力·电力基础设施: 26/26
# ✓ 池 #2 国防领域·卫星主题: 23/23
```
