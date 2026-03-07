# MCP Preflight

MCP Preflight is a local-first security preflight scanner for Model Context Protocol setups. It helps you review `mcp.json`, prompt resources, repo manifests, and obvious secret exposures before you trust a new MCP server or agent workflow.

## Why use it
- Local by default. No hosted scanner required.
- Deterministic findings with fix guidance.
- Problems-panel diagnostics for risky MCP config patterns.
- Fast audit export paths through JSON, Markdown, HTML, and SARIF from the CLI.

## Commands
- `MCP Preflight: Scan Workspace`
- `MCP Preflight: Scan Current File`
- `MCP Preflight: Show Fix Recipes`

## Current checks
- Secret and private key exposure
- Token passthrough and overbroad environment inheritance
- Unsafe shell wrappers and bootstrap launchers
- Unpinned dependencies and missing lockfiles
- Prompt injection and tool poisoning indicators
- Insecure transport, credential-bearing URLs, and sensitive remote MCP targets
- Overbroad filesystem or network scope in MCP launch args
- Invalid MCP config and malformed suppression files

## Privacy
Scans run locally by default. MCP Preflight does not require login and does not send your workspace to a hosted backend.
