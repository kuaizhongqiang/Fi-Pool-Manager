# @fi-pool/plugin

Fi-Pool-Manager OpenClaw plugin. Exposes the full server capability as 36 MCP tools for AI agents (Claude, Cursor, etc.) via the OpenClaw MCP protocol.

## Tools

### Management (6)
- `create_pool`, `delete_pool`, `update_pool`
- `add_stocks`, `remove_stocks`, `set_pool_signal`

### Query (12)
- `list_pools`, `get_pool_stocks`, `get_stock_info`
- `get_daily_info`, `get_analysis_report`, `get_final_report`
- `get_system_status`, `check_data_completeness`
- `get_pool_analysis_status`, `get_daily_summary_status`
- `list_pipeline_runs`, `get_pipeline_run_detail`

### Command (5)
- `output_analysis_report`, `output_final_report`, `output_pool_report`
- `semantic_search`, `session_manage`

### Execute (5)
- `run_local_analysis`, `run_full_pipeline`
- `run_pool_analysis`, `run_pool_full_pipeline` (supports `force` and `missing`)
- `refresh_data`

### Auxiliary (8)
- `help`, `list_resources`, `show_state`, `show_version`
- `get_config`, `set_config`
- `generate_daily_summary_v2` (recommended)
- `generate_daily_summary` (deprecated v1)

## Development

```bash
# Build
npm run build

# The plugin is private — not published to npm.
# Download the release zip from GitHub Releases.
```

## References

- [OpenClaw Manifest Spec](https://docs.openclaw.ai/en/plugins/manifest)
- [Building Plugins](https://docs.openclaw.ai/en/plugins/building-plugins)
- [Tool Plugins](https://docs.openclaw.ai/en/plugins/tool-plugins)
