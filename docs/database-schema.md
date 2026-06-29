# 数据库 Schema

> 阶段：详细设计 — 精确的字段类型、约束、索引。
> 数据库：SQLite + sqlite-vec

## 通用约定

- **主键**：所有表使用 `INTEGER PRIMARY KEY AUTOINCREMENT`
- **时间字段**：使用 `TEXT` 存储 ISO 8601 格式 (`yyyy-MM-dd HH:mm:ss`)
- **日期字段**：使用 `TEXT` 存储 `yyyy-MM-dd`
- **浮点数**：使用 `REAL`
- **禁用 `ON DELETE CASCADE`**：业务层处理关联数据，避免意外级联删除

## 迁移管理

使用 Drizzle Kit 管理数据库迁移。

```bash
# 生成迁移文件（修改 schema.ts 后运行）
npm run db:generate

# 执行迁移到目标数据库
npm run db:migrate
```

配置位于 `packages/server/drizzle.config.ts`，目标数据库路径从 `.env` 的 `DB_PATH` 读取。

---

## 表定义

### Pool — 股池

```sql
CREATE TABLE pool (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    desc        TEXT    NOT NULL DEFAULT '',
    pool_analysis TEXT  NOT NULL DEFAULT '',
    pool_signal INTEGER NOT NULL DEFAULT 0,  -- -1:看空, 0:中性, 1:看多
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pool_name ON pool(name);
CREATE INDEX idx_pool_signal ON pool(pool_signal);
```

### PoolStock — 股池与股票的关联（M:N）

```sql
CREATE TABLE pool_stock (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_id     INTEGER NOT NULL REFERENCES pool(id),
    stock_code  TEXT    NOT NULL REFERENCES stock(code),
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pool_id, stock_code)
);

CREATE INDEX idx_pool_stock_pool ON pool_stock(pool_id);
CREATE INDEX idx_pool_stock_stock ON pool_stock(stock_code);
```

### Stock — 股票基础信息

```sql
CREATE TABLE stock (
    code         TEXT    PRIMARY KEY,   -- 6位代码，如 '600519'
    name         TEXT    NOT NULL,
    current_price REAL   NOT NULL DEFAULT 0,
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stock_name ON stock(name);
```

### DailyInfo — 日行情数据

```sql
CREATE TABLE daily_info (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    code    TEXT    NOT NULL REFERENCES stock(code),
    date    TEXT    NOT NULL,            -- 'yyyy-MM-dd'
    open    REAL    NOT NULL,
    high    REAL    NOT NULL,
    low     REAL    NOT NULL,
    close   REAL    NOT NULL,
    volume  INTEGER NOT NULL,           -- 股数
    UNIQUE(code, date)
);

CREATE INDEX idx_daily_info_code ON daily_info(code);
CREATE INDEX idx_daily_info_date ON daily_info(date);
CREATE INDEX idx_daily_info_code_date ON daily_info(code, date);
```

### DailyAnalysisReport — 客观分析报告

```sql
CREATE TABLE daily_analysis_report (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL REFERENCES stock(code),
    date        TEXT    NOT NULL,       -- 'yyyy-MM-dd'
    summary     TEXT    NOT NULL DEFAULT '',   -- 文本摘要
    indicators  TEXT    NOT NULL DEFAULT '{}', -- JSON: 结构化指标数据
    signals     TEXT    NOT NULL DEFAULT '{}', -- JSON: 信号标记
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, date)
);

CREATE INDEX idx_dar_code ON daily_analysis_report(code);
CREATE INDEX idx_dar_date ON daily_analysis_report(date);
CREATE INDEX idx_dar_code_date ON daily_analysis_report(code, date);
```

`indicators` JSON 结构示例：
```json
{
  "priceChangePct": 2.35,
  "amplitude": 3.12,
  "ma": { "ma5": 185.2, "ma10": 182.6, "ma20": 180.1, "ma60": 175.3 },
  "macd": { "dif": 1.23, "dea": 0.98, "histogram": 0.25 },
  "rsi": { "rsi6": 62.5, "rsi14": 55.3 },
  "kdj": { "k": 70.2, "d": 65.8, "j": 79.0 },
  "bb": { "upper": 192.5, "mid": 180.1, "lower": 167.7 }
}
```

`signals` JSON 结构示例：
```json
{
  "goldenCross": false,
  "deadCross": false,
  "overbought": false,
  "oversold": false,
  "volumeSpike": true,
  "volumeRatio": 2.1
}
```

### SentimentReport — 舆情报告

```sql
CREATE TABLE sentiment_report (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL REFERENCES stock(code),
    date        TEXT    NOT NULL,       -- 'yyyy-MM-dd'
    report      TEXT    NOT NULL DEFAULT '',
    sources     TEXT    NOT NULL DEFAULT '[]', -- JSON: 来源列表
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, date)
);

CREATE INDEX idx_sr_code ON sentiment_report(code);
CREATE INDEX idx_sr_date ON sentiment_report(date);
CREATE INDEX idx_sr_code_date ON sentiment_report(code, date);
```

### AnalysisRoler — 多角色发言记录

```sql
CREATE TABLE analysis_roler (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL REFERENCES stock(code),
    date            TEXT    NOT NULL,       -- 'yyyy-MM-dd'
    role            TEXT    NOT NULL,       -- 角色名
    responsibility  TEXT    NOT NULL DEFAULT '',
    report          TEXT    NOT NULL DEFAULT '',
    round           INTEGER NOT NULL DEFAULT 1,  -- 第几轮
    word_count      INTEGER NOT NULL DEFAULT 0,  -- 实际字数
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ar_code_date ON analysis_roler(code, date);
CREATE INDEX idx_ar_role ON analysis_roler(role);
```

### FinalReport — 最终报告

```sql
CREATE TABLE final_report (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL REFERENCES stock(code),
    date          TEXT    NOT NULL,       -- 'yyyy-MM-dd'
    summary       TEXT    NOT NULL DEFAULT '',   -- overview 内容
    full_report   TEXT    NOT NULL DEFAULT '',   -- full 内容
    role_summary  TEXT    NOT NULL DEFAULT '[]', -- JSON: 各角色核心观点
    pipeline_id   TEXT    NOT NULL DEFAULT '',   -- 流水线运行 ID
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, date)
);

CREATE INDEX idx_fr_code ON final_report(code);
CREATE INDEX idx_fr_date ON final_report(date);
CREATE INDEX idx_fr_code_date ON final_report(code, date);
```

`role_summary` JSON 结构示例：
```json
[
  { "role": "技术分析师", "keyPoint": "短期均线多头排列，但RSI接近超买区" },
  { "role": "基本面分析师", "keyPoint": "PE处于历史中位，营收增速放缓" },
  { "role": "舆情分析师", "keyPoint": "近期无重大利空，市场情绪中性偏多" },
  { "role": "风控官", "keyPoint": "关注流动性和板块回调风险" }
]
```

### Config — 系统配置

```sql
CREATE TABLE config (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL DEFAULT '',
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

---

## 向量存储

向量数据存放在一个独立表中，通过 `sqlite-vec` 扩展操作。

### VecEmbedding — 向量数据

```sql
CREATE TABLE vec_embedding (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type    TEXT    NOT NULL,     -- 'analysis' | 'final'
    content_code    TEXT    NOT NULL,     -- 股票代码
    content_date    TEXT    NOT NULL,     -- 报告日期
    content_text    TEXT    NOT NULL,     -- 原始文本（用于溯源）
    embedding       BLOB,               -- 向量数据（sqlite-vec）
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ve_type ON vec_embedding(content_type);
CREATE INDEX idx_ve_code ON vec_embedding(content_code);
CREATE INDEX idx_ve_type_code_date ON vec_embedding(content_type, content_code, content_date);
```

---

## 表关系总图

```
pool ─── pool_stock ─── stock
                           │
                      daily_info
                           │
                  daily_analysis_report ◄── vec_embedding
                           │                 (content_type='analysis')
                  sentiment_report
                           │
                  analysis_roler
                           │
                     final_report ◄── vec_embedding
                                       (content_type='final')

config（独立表，键值存储）
```

## 索引汇总

| 表 | 索引 | 作用 |
|----|------|------|
| pool | name | 按名称查找 |
| pool | signal | 按信号筛选 |
| pool_stock | pool_id | 查池中股票 |
| pool_stock | stock_code | 查股票属于哪些池 |
| daily_info | code, date, code+date | 行情查询 |
| daily_analysis_report | code, date, code+date | 报告查询 |
| sentiment_report | code, date, code+date | 舆情查询 |
| analysis_roler | code+date, role | 发言记录查询 |
| final_report | code, date, code+date | 报告查询 |
| vec_embedding | type, code, type+code+date | 向量检索过滤 |
