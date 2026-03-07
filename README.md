# MCP Preflight

MCP Preflight is a local-first security preflight scanner for MCP servers, agent configs, prompts, and repo manifests. This repo is a TypeScript monorepo with a shared scanner core, a CLI, and a VS Code extension.

This public repository intentionally excludes internal planning, maintainer-only release automation, and private operating materials.

## Workspace
- `packages/core`: scanner engine, rules, types, formatters
- `packages/cli`: CLI entrypoint
- `apps/vscode-extension`: VS Code integration

## Commands
- `npm install`
- `npm run build`
- `npm run typecheck`
- `node packages/cli/dist/index.js scan /path/to/workspace`
- `npm run scan -- /path/to/workspace`

## Current Scanner Surface
- Deterministic Lite findings for secret exposure, risky MCP config patterns, prompt/tool poisoning indicators, and supply-chain drift.
- Stable finding fingerprints for report correlation and suppressions.
- Local suppression file support via `.mcp-preflight-ignore.json`.
- Text, JSON, Markdown, HTML, and SARIF report outputs.
- Nested MCP config findings now use JSON-path-aware locations instead of broad string-search fallbacks.
