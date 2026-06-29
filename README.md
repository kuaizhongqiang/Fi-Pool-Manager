# Fi-Pool-Manager

A 股股池管理服务端。管理自定义股票池、获取日行情数据、进行技术分析，并通过多角色 LLM 分析产出投资建议报告。

## 功能

- **股池管理** — 创建、管理自定义股票池
- **行情数据** — 腾讯财经接口获取日线 OHLCV 数据
- **技术分析** — 本地计算 MA、MACD、RSI、KDJ、布林带等指标
- **多角色 LLM 分析** — 技术分析师、基本面分析师、舆情分析师、风控官依次分析并辩论
- **向量检索** — 语义搜索历史分析报告
- **CLI + OpenClaw 插件** — 两种交互方式

## 技术栈

TypeScript / Node.js · SQLite (sqlite-vec) · Drizzle ORM · Commander.js · OpenClaw Plugin SDK · LM Studio

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境配置
cp .env.example .env
# 编辑 .env 填入配置项

# 开发模式
npm run dev

# 构建
npm run build
```

## 文档

详见 [docs/index.md](docs/index.md)。

| 文档 | 说明 |
|------|------|
| [项目综述](docs/overview.md) | 架构总览 |
| [API 设计](docs/api-design.md) | 工具入参与返回值 |
| [数据库 Schema](docs/database-schema.md) | 表结构与索引 |
| [流水线实现](docs/pipeline-implementation.md) | 分析流程与 Prompt |
| [配置与部署](docs/deployment.md) | 运维指南 |

## 许可

MIT
