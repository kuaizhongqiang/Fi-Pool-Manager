# 项目开发计划

> 阶段：详细设计 — 开发迭代计划。

## 迭代划分

### Phase 1：基础设施

搭建项目骨架，让代码能跑起来。

- 实现 `schema.ts` 全部 10 张表定义
- 生成初始 Drizzle 迁移文件
- 配置 Vitest 测试框架
- 验证 monorepo 包间依赖

### Phase 2：数据获取

打通数据源，实现数据入库。

- 腾讯财经接口对接（含频率限制）
- `daily_info` 表写入与更新
- 股票基础信息管理（`stock` 表 CRUD）
- 股池管理（`pool`、`pool_stock` 表 CRUD）

### Phase 3：CLI 基础命令

实现管理类和查询类命令，可交互操作。

- 股池管理命令：create-pool、delete-pool、add-stocks、remove-stocks
- 数据查询命令：list-pools、get-stock、get-daily、status
- 辅助命令：help、list、version、config

### Phase 4：本地分析引擎

实现不依赖 LLM 的技术指标计算。

- 技术指标算法（MA、MACD、RSI、KDJ、布林带）
- 信号检测（金叉、超买超卖、放量异动）
- `daily_analysis_report` 表写入
- 向量化与 `vec_embedding` 表写入

### Phase 5：LLM 集成

接入本地 LM Studio，实现 LLM 调用基础能力。

- LM Studio API 对接
- Session 管理（创建、切换、上下文控制）
- 字数控制机制
- 命令类命令：output-report、semantic-search

### Phase 6：分析流水线

串通完整分析流程，出第一份 FinalReport。

- 客观报告生成（Stage 2）
- 舆情获取（Stage 3，可选）
- 多角色分析（Stage 4，4 个角色轮次发言）
- 综合报告生成（Stage 5）
- 执行类命令：run-analysis、run-pipeline

### Phase 7：OpenClaw 插件

打包为 OpenClaw 插件，暴露 MCP 工具。

- 插件入口与清单文件
- MCP 工具注册
- 端到端测试

### Phase 8：收尾

部署与完善。

- 部署脚本与文档
- 测试补充与覆盖率
- 性能优化

## 依赖关系

```
Phase 1（基础设施）
   ↓
Phase 2（数据获取） ──→ Phase 3（CLI 基础）
   ↓                       ↓
Phase 4（分析引擎） ─────→ Phase 5（LLM 集成）
   ↓                       ↓
Phase 6（分析流水线）
   ↓
Phase 7（OpenClaw 插件）
   ↓
Phase 8（收尾）
```

## 交付物

| Phase | 交付 |
|-------|------|
| P1 | 可运行的数据库 + 测试框架 |
| P2 | 可抓取行情数据并存储 |
| P3 | 可交互操作股池和查询数据 |
| P4 | 可产出技术指标分析 |
| P5 | 可调用 LLM 输出分析报告 |
| P6 | 可执行完整分析流水线 |
| P7 | 可作为 OpenClaw 插件使用 |
| P8 | 可部署到生产环境 |
