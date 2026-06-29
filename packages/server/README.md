# @fi-pool/server

Fi-Pool-Manager 核心服务层。

## 职责

- **数据获取**：通过腾讯财经接口获取 A 股日行情数据
- **本地分析**：计算技术指标（MA、MACD、RSI、KDJ、布林带）
- **LLM 分析**：调用本地 LM Studio 进行多角色分析和报告生成
- **向量检索**：通过 sqlite-vec 进行语义搜索
- **舆情搜索**：获取股票相关市场信息
- **数据访问**：通过 Drizzle ORM 操作 SQLite 数据库

## 目录结构

```
src/
├── data/         # 数据获取模块
├── analysis/     # 本地分析引擎
├── llm/          # LLM 调用封装
├── vector/       # 向量检索
├── search/       # 舆情搜索
├── db/           # 数据库访问层
├── session/      # Session 管理
└── index.ts      # 入口
```
