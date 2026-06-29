# PM 审核报告 — Fi-Pool-Manager Paperwork

> 审核人：CodeBuddy（PM）
> 审核日期：2026-06-29
> 审核范围：CLAUDE.md、CODEBUDDY.md、README.md、docs/ (全部)、packages/ (全部)

---

## 一、总体评价

Claude 完成了一套**结构完整、分层清晰**的设计文档产出。从概念定义（concepts/）到详细设计（docs/）再到骨架代码（packages/），三个阶段的推进逻辑合理。29 个工具、10 张数据表、6 阶段流水线的设计覆盖了"股池管理 + 数据分析 + LLM 推理"的核心场景。

**设计质量评分：B+**
- 优点：文档体系完整，架构分层合理，API 和 DB Schema 到字段级别
- 缺陷：存在文档不一致、未决决策、骨架代码与设计文档脱节

---

## 二、发现的问题

### 🔴 严重

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **CODEBUDDY.md 严重过期** | `CODEBUDDY.md` | 该文件是我早期根据空项目状态生成，内容仅描述了 Memory Hooks。Claude 后续产出了 29 工具 API 设计、10 表 Schema、6 阶段流水线、monorepo 骨架代码等，CODEBUDDY.md 完全未反映这些内容。未来 CodeBuddy 实例将无法正确理解项目结构。 |

### 🟡 中等

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 2 | **README 与 LICENSE 矛盾** | `README.md` + `LICENSE` | README 末尾写 "MIT"，但 LICENSE 文件是 Apache License 2.0。需统一。 |
| 3 | **舆情数据源未决** | `concepts/concepts.md:#13` | 舆情数据源标注"待讨论确定"，`.env.example` 中 SEARCH_API_URL/KEY 为空。但流水线 Stage 3 依赖舆情获取，此决策阻塞开发。deployment.md 标注为"可选"与 pipeline 设计矛盾。 |
| 4 | **Drizzle 迁移机制缺失** | `packages/server/` | 文档反复提及"Drizzle 迁移脚本"但无 drizzle.config.ts、无 migration 目录、无 npm migration script。这是数据库初始化和版本升级的必要前置条件。 |
| 5 | **测试策略空白** | 根 `package.json` | 项目没有任何测试框架、测试目录或测试脚本。流水线涉及 LLM、向量、外部 API，无测试策略会导致质量失控。 |

### 🟢 轻微

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 6 | **多角色定义前后不一致** | `concepts/concepts.md` vs `pipeline-implementation.md` | 概念阶段第 4 角色为"宏观/策略师"，详细设计改为"舆情分析师"。concepts/concepts.md 需归档或更新。 |
| 7 | **三包源码均只有导出常量** | `packages/*/src/index.ts` | server 只有 `VERSION`，cli 只有空 Commander，plugin 只有 `PLUGIN_NAME`。骨架代码无调用路径，无法验证 package 间依赖是否正确。 |
| 8 | **数据库索引命名不一致** | `database-schema.md` | pool 表的索引使用 `idx_pool_signal` 但字段定义名为 `pool_signal`（非 `signal`），SQL 中引用的是正确的；但索引名暗示可能存在误解。实际 SQL 中 CREATE INDEX 用的是 `signal` 字段名——这与表定义中的 `pool_signal` 不一致。 |
| 9 | **遗漏 tsconfig 子包配置** | 根 `tsconfig.json` | 根 tsconfig 未配置 references/project references，workspace 编译依赖未声明。 |

---

## 三、设计亮点（值得保留）

1. **数据库分离设计** — DB_PATH 可配置，代码与数据分离，覆盖式部署不丢数据
2. **Full/Overview 双模式** — 贯穿所有报告接口，适配不同使用场景
3. **字数控制机制** — 针对本地 LM Studio 上下文限制，每个角色每轮有精确字数上限
4. **静默失败策略** — Memory hooks 和 embedding 失败不阻塞主流程
5. **Monorepo 包间依赖清晰** — cli/plugin 均依赖 server，server 不依赖任一方
6. **API 错误码体系** — 6 种标准错误码（NOT_FOUND / INVALID_PARAM / RATE_LIMIT / LLM_ERROR / DB_ERROR / INTERNAL）

---

## 四、建议的优先级修复顺序

```
P0: CODEBUDDY.md 更新（阻塞 AI 辅助开发）
P0: README License 修正
P1: 舆情数据源决策（阻塞 Stage 3 开发）
P1: Drizzle 迁移机制搭建（阻塞数据库初始化）
P2: 测试框架选型与配置
P2: concepts 文档归档/更新
P3: 骨架代码连调验证
P3: tsconfig references 配置
```

---

## 五、结论

Claude 产出的 paperwork **设计层面合格**，可以作为后续开发的基线。但存在 4 个阻塞项（严重+中等问题中影响实现路径的）需要在进入编码阶段前解决。核心风险是：**文档完备但未被代码引用**——29 个工具的接口定义详尽，但 CLI 和 Plugin 都没有串联到 server 的实现。
