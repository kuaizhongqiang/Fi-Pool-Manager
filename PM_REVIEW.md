# PM 审核报告 — Fi-Pool-Manager Paperwork

> 审核人：CodeBuddy（PM）
> 审核日期：2026-06-29（第二轮）
> 审核范围：CLAUDE.md、CODEBUDDY.md、README.md、docs/ (全部)、packages/ (全部)、PM_REVIEW.md

---

## 一、总体评价

Claude 完成了一套**结构完整、分层清晰**的设计文档产出。从概念定义（concepts/）到详细设计（docs/）再到骨架代码（packages/），三个阶段的推进逻辑合理。29 个工具、10 张数据表、6 阶段流水线的设计覆盖了"股池管理 + 数据分析 + LLM 推理"的核心场景。

**第二轮设计质量评分：A-**
- 优点：7/9 个首轮问题已修复，文档一致性显著提升，Drizzle 迁移机制已搭建
- 缺陷：仍有 2 个遗留问题 + 3 个新发现问题，骨架代码与文档仍部分脱节

---

## 二、首轮问题修复跟踪

| # | 问题 | 状态 | 说明 |
|---|------|------|------|
| 1 | CODEBUDDY.md 严重过期 | ✅ 已修复 | 已重写，反映设计文档、技术栈、项目结构、核心流程 |
| 2 | README vs LICENSE 矛盾 | ✅ 已修复 | README 已改为 Apache-2.0 |
| 3 | 舆情数据源未决 | ✅ 已收敛 | concepts #13 明确为"可选阶段"，与 deployment.md 一致，不再阻塞主流程 |
| 4 | Drizzle 迁移机制缺失 | ✅ 已搭建 | drizzle.config.ts + db:generate/db:migrate/db:studio scripts |
| 5 | 测试策略空白 | ❌ 未修复 | 仍无测试框架 |
| 6 | 多角色定义不一致 | ✅ 已修复 | "宏观/策略师" → "舆情分析师" |
| 7 | 三包源码 skeleton | ⚠️ 部分进展 | 新增 drizzle.config.ts + schema.ts 骨架，但 schema.ts 无表定义 |
| 8 | 索引命名不一致 | ✅ 已修复 | pool_signal 索引 SQL 正确 |
| 9 | tsconfig references | ✅ 已修复 | 已添加三包子包引用 |

**修复率：7/9（78%）**

---

## 三、第二轮新发现问题

### 🟡 中等

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| N1 | **schema.ts 空骨架** | `packages/server/src/db/schema.ts` | 只有 import 和 `// TODO: 实现各表定义`。drizzle.config.ts 和 db:generate 已就绪，但无法产生产出迁移文件。这是数据库初始化的阻塞项。 |
| N2 | **CLI README 与源码脱节** | `packages/cli/` | README 列出 5 类命令（create-pool, delete-pool, add-stocks, report 等），但 `src/index.ts` 只有空 Commander 骨架，零命令注册。AI 代理阅读 README 后会误以为 CLI 可用。 |
| N3 | **测试策略空白（遗留）** | 根 `package.json` | 仍无测试框架、测试目录、测试脚本。流水线涉及 LLM、向量、外部 API。 |

### 🟢 轻微

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| N4 | **database-schema.md 索引汇总表残留 `signal`** | `docs/database-schema.md` L268 | SQL 部分已修正为 `pool_signal`，但底部索引汇总表仍写 `pool \| signal`（应为 `pool_signal`），不一致。 |

---

## 四、设计亮点（值得保留）

1. **数据库分离设计** — DB_PATH 可配置，代码与数据分离，覆盖式部署不丢数据
2. **Full/Overview 双模式** — 贯穿所有报告接口，适配不同使用场景
3. **字数控制机制** — 针对本地 LM Studio 上下文限制，每个角色每轮有精确字数上限
4. **静默失败策略** — Memory hooks 和 embedding 失败不阻塞主流程
5. **Monorepo 包间依赖清晰** — cli/plugin 均依赖 server，server 不依赖任一方
6. **API 错误码体系** — 6 种标准错误码（NOT_FOUND / INVALID_PARAM / RATE_LIMIT / LLM_ERROR / DB_ERROR / INTERNAL）
7. **三包 README 齐全** — server/cli/plugin 各有独立 README 说明职责和用法

---

## 五、当前优先级修复顺序

```
P0: schema.ts 实现 10 张表定义（阻塞 db:generate）
P1: 测试框架选型与配置
P1: CLI 源码实现（不要让 CLI README 成为虚假文档）
P2: database-schema.md 索引汇总表字段名修正
```

---

## 六、结论

Claude 在第二轮中**快速修复了 7/9 个问题**，从 B+ 提升到 A-，效率很好。当前核心阻塞项仅剩 1 个：**schema.ts 表定义**——Drizzle 迁移基础设施已就绪，就差填入 10 张表的 Drizzle 定义即可生成初始迁移。测试策略和 CLI 实现应在编码阶段同步推进。

---

## 第三轮：全量代码审计

> 审核日期：2026-06-29
> 审核范围：全部 packages/ 源码（24 src 文件 + 8 test 文件）、所有配置文件
> 代码量：~5,800 行 src + ~1,800 行 test

### 总体评价

server 核心已**全部实现**—10 张表、29 个工具、9 个 service、5 阶段流水线完整可运行。CLI 和 Plugin 骨架代码已补全。测试已有 8 个文件覆盖 indicators/signals/word-count/session/stock/e2e pipeline。**代码质量评分：A-**

### 🔴 严重问题

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| C1 | **迁移失败静默吞错** | `db/migrate.ts:38` | `catch(err)` 仅 `console.warn`，迁移失败后仍返回 db 实例。数据库可能处于不一致状态，所有后续操作将基于损坏的 schema 执行。 |
| C2 | **.env 配置项声明但未使用** | `.env.example` | `PORT`、`LOG_LEVEL`、`DATA_FETCH_INTERVAL_MS` 在 .env.example 中声明，但源码中从未被读取。属于死配置，开发者配置后无效果。 |
| C3 | **getSqlite 导出但无人使用** | `embedding.ts` | embedding 服务 import 了 `getSqlite` 但实际使用的是 Drizzle ORM 的 `db` 实例。死导入。 |

### 🟡 中等问题

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| M1 | **唯一约束检测依赖字符串匹配** | `tools/manager.ts:50,125` | `message.includes('UNIQUE')` 检测重复股池/股票。SQLite 不同版本/驱动的错误消息格式可能变化，导致误判。应改为 `SELECT` 预检。 |
| M2 | **VERSION 硬编码不同步** | `server/src/index.ts:66` | `export const VERSION = '0.1.0'` 是字面量，与 `package.json` 不同步。semantic-release 更新 package.json 后此值不变。 |
| M3 | **Pipeline 函数过长** | `services/pipeline.ts` | `runFullPipeline` 约 300+ 行，承担了 5 个 Stage 的全部编排逻辑。违反单一职责原则，难以测试和维护。 |
| M4 | **Config 表与 .env 无同步机制** | `services/` + `tools/auxiliary.ts` | `setConfig` 写入数据库但不同步 `.env` 文件。`getConfig` 从数据库读取但系统启动时从 `.env` 取值。两套配置源可能不一致。 |
| M5 | **目录创建无错误处理** | `db/index.ts:28` | `mkdirSync` 无 try-catch，权限不足或路径非法时直接崩溃。 |
| M6 | **daily-info 频率限制不可配** | `services/daily-info.ts` | `maxConcurrency = 3` 硬编码，腾讯财经接口限制变更时需改代码。 |
| M7 | **services/analysis.ts 被测函数内联在 test 中** | `tests/unit/indicators.test.ts` | MA/RSI/signals 测试文件中有完整的内联重写版本（~410行），与 src 不同步。任何 src 修改导致测试失效或测试覆盖假象。 |

### 🟢 轻微问题

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| L1 | **datetime('now') 嵌套引号风险** | `db/schema.ts` | Drizzle 生成迁移 SQL 时 `datetime('now')` 可能变成 `datetime(''now'')`，测试 fixture 已发现此问题 |
| L2 | **错误类型断言不安全** | `db/migrate.ts:39` | `(err as Error)` 如果 throw 的不是 Error 实例（如 string），静默失败 |
| L3 | **缺少 OpenClaw 插件清单文件** | `packages/plugin/` | 有 613 行工具注册代码，但无 `openclaw.json` manifest |
| L4 | **getSystemStatus sql 泛型类型不精确** | `tools/query.ts:179` | `sql<number>` / `sql<string>` 运行时可能返回 null |
| L5 | **embedding.ts 大量 any 类型** | `services/embedding.ts` | 多处 `(err: any)` 错误处理 |

### 已修复的首轮/次轮问题跟踪

| # | 问题 | 状态 |
|---|------|------|
| P1 || schema.ts 表定义 | ✅ 已实现 |
| P1 || Drizzle 迁移 | ✅ 已生成 |
| P1 || Vitest 配置 | ✅ 已配置，8 个测试文件 |
| P3 || CLI 命令 | ✅ CLI 583 行完整实现 |
| P5 || LM Studio 对接 | ✅ 已实现 |
| P6 || 完整流水线 | ✅ 1125 行 pipeline.ts |
| P7 || 插件工具注册 | ✅ 613 行 plugin/src/index.ts |

### 代码质量亮点

1. **JSDoc 覆盖率极高** — 几乎所有公开 API 有 `@param`/`@returns`/`@example`
2. **统一错误码体系** — NOT_FOUND / INVALID_PARAM / RATE_LIMIT / LLM_ERROR / DB_ERROR / INTERNAL 六种标准码
3. **静默失败策略一致** — embedding 失败、舆情 API 不可用时均优雅降级
4. **数据库单例 + WAL 模式** — 连接管理规范
5. **工具层 / 服务层分离清晰** — tools/ 负责参数校验和错误包装，services/ 负责业务逻辑
6. **测试已在覆盖** — 8 个测试文件覆盖 unit/integration/e2e 三层

### 当前优先级

```
P0: 修复迁移静默吞错 (C1) + 死配置清理 (C2)
P1: VERSION 硬编码修复 (M2) + 唯一约束检测改为预检 (M1)
P2: Pipeline 拆分 (M3) + Config 同步机制 (M4)
P3: 内联测试函数改为 import 自 src (M7)
P4: 错误处理加固 (M5 + L2) + OpenClaw manifest (L3)
```
