# @fi-pool/cli

Fi-Pool-Manager CLI 命令行入口。

基于 Commander.js 实现，提供完整的股池管理、查询分析、报告输出等命令。

## 用法

```bash
# 查看帮助
npx fi-pool --help

# 列出股池
npx fi-pool list-pools

# 查看某股票分析报告
npx fi-pool report --code 600519 --mode overview
```

## 命令分类

- **管理类**：create-pool, delete-pool, add-stocks, remove-stocks, set-signal
- **查询类**：list-pools, get-stock, get-daily, get-report, status
- **命令类**：output-report, output-final, semantic-search, session
- **执行类**：run-analysis, run-pipeline, refresh-data
- **辅助类**：help, list, version, config
