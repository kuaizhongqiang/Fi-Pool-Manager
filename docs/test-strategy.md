# 测试策略

> 阶段：详细设计 — 测试框架与策略。
> 适用：packages/server, packages/cli, packages/plugin

## 测试框架

| 层 | 框架 | 说明 |
|----|------|------|
| 单元测试 | Vitest | 与 Vite/TypeScript 原生集成，速度快 |
| 数据库测试 | Vitest + better-sqlite3 | 使用内存 SQLite 数据库，测试隔离 |
| LLM 调用测试 | Vitest (mock) | Mock LLM 接口，不依赖实际 LM Studio |

## 测试范围

### 单元测试（server）

| 模块 | 测试内容 |
|------|---------|
| 数据获取 | 腾讯财经接口调用、频率限制、数据解析 |
| 本地分析 | 技术指标计算（MA、MACD、RSI 等）结果正确性 |
| LLM 调用 | Prompt 构建、字数控制、响应解析 |
| 向量检索 | Embedding 调用、相似度搜索 |
| 数据库访问 | CRUD 操作、事务、唯一约束 |

### 集成测试（server）

- 完整流水线：模拟数据输入 → 验证各阶段输出
- 数据库迁移：初始化 → 迁移 → 回滚

### CLI 测试

- 命令注册与参数解析
- 各命令返回格式（full/overview）验证

## 测试命令

```bash
# 运行所有测试
npm test

# 运行指定模块测试
npm test -- --filter data
npm test -- --filter analysis

# 测试覆盖率
npm run test:coverage
```

## 测试文件组织

```
packages/server/src/
├── data/
│   └── __tests__/
│       └── fetcher.test.ts
├── analysis/
│   └── __tests__/
│       ├── indicators.test.ts
│       └── signals.test.ts
├── llm/
│   └── __tests__/
│       ├── prompt.test.ts
│       └── word-limit.test.ts
├── vector/
│   └── __tests__/
│       └── search.test.ts
└── db/
    └── __tests__/
        ├── crud.test.ts
        └── migration.test.ts
```

## 环境变量

测试环境通过 `.env.test` 配置，使用独立的测试数据库，不干扰开发/生产数据。
