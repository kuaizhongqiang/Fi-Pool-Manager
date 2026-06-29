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
