# 配置与部署

> 阶段：详细设计 — 环境配置与服务器部署指南。

## 环境配置 (.env)

### 完整配置项

```env
# === 数据库 ===
# SQLite 数据库文件路径
# 不存在时自动初始化，存在时直接连接
DB_PATH=/data/fi-pool/fi-pool.db

# === LLM 推理 ===
# LM Studio 服务地址
LLM_BASE_URL=http://localhost:1234
# LLM 模型名称
LLM_MODEL=local-model
# LLM 上下文窗口大小（token）
LLM_CONTEXT_LIMIT=4096

# === 向量嵌入 ===
# OpenAI 兼容的 Embedding API
EMBEDDING_API_URL=https://api.openai.com/v1/embeddings
EMBEDDING_API_KEY=sk-your-key-here
EMBEDDING_MODEL=text-embedding-3-small

# === 行情数据 ===
# 腾讯财经接口请求间隔（毫秒）
# 不可低于 1000ms，否则有封 IP 风险
DATA_FETCH_INTERVAL_MS=1200

# === 搜索/舆情 ===
# 搜索 API 配置
SEARCH_API_URL=
SEARCH_API_KEY=

# === 服务 ===
# 服务监听端口（预留）
PORT=3000

# === 日志 ===
# 日志级别: debug | info | warn | error
LOG_LEVEL=info
```

### 环境优先级

```
.env 文件（项目根目录） → 环境变量（process.env）
```

`.env` 不纳入版本控制。提供 `.env.example` 作为模板。

## 部署结构

### 目录布局

```
/opt/fi-pool-manager/
├── packages/
│   ├── server/          # 核心服务
│   ├── cli/             # CLI 入口
│   └── plugin/          # OpenClaw 插件
├── .env                 # 环境配置
└── package.json

/data/fi-pool/           # 数据目录（与代码分离）
├── db/
│   └── fi-pool.db       # SQLite 数据库
└── logs/
    └── app.log
```

### 启动方式

#### 开发模式

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev
```

#### 生产模式

```bash
# 构建
npm run build

# 启动服务
npm start
```

#### CLI 模式

```bash
# 直接调用命令
node packages/cli/dist/index.js list-pools

# 或安装为全局命令后
fi-pool list-pools
```

#### OpenClaw 插件模式

插件注册到 OpenClaw 配置后，由 OpenClaw 平台自动加载。
详见 [OpenClaw 插件文档](https://docs.openclaw.ai/zh-CN/plugins/manifest)。

## 系统要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| OS | Ubuntu 20.04+ | Ubuntu 22.04+ |
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 20 GB | 50 GB |
| Node.js | 18.x | 20.x LTS |
| LM Studio | 已安装运行 | 已安装运行 |

## 依赖的外部服务

| 服务 | 必须 | 说明 |
|------|------|------|
| LM Studio（本地） | ✅ | 本地 LLM 推理 |
| 腾讯财经接口 | ✅ | 行情数据获取 |
| Embedding API | ✅ | 报告向量化 |
| 搜索/舆情 API | ❌ | 舆情获取，缺失时跳过 Stage 3 |
