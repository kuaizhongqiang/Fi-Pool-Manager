# @fi-pool/plugin

Fi-Pool-Manager OpenClaw 插件。

将核心服务能力打包为 OpenClaw 插件，通过 MCP 协议将工具暴露给 AI 代理（Claude、Cursor 等）。

## 能力

此插件将与 `openclaw-mcp-server` 配合，向 AI 代理提供以下工具：

- 股池管理（创建、删除、修改、增删股票）
- 股票查询（信息、行情、报告）
- 分析报告输出（full/overview）
- 语义搜索
- 执行分析流水线

## 开发参考

- [OpenClaw 插件清单规范](https://docs.openclaw.ai/zh-CN/plugins/manifest)
- [构建插件](https://docs.openclaw.ai/zh-CN/plugins/building-plugins)
- [工具插件](https://docs.openclaw.ai/plugins/tool-plugins)
