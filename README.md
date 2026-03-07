# MCP Preflight

MCP Preflight is the fast local check you run before you trust a new MCP server or ship an agent workflow.

It reads common MCP config files, tool descriptions, prompt resources, and repo manifests, then explains risky patterns in plain language so you can fix them before they become a bigger problem.

This public repository stays intentionally narrow. It contains the Lite product code and the user-facing materials people need to evaluate it. Internal planning, private operating notes, and maintainer admin work stay out of the public repo on purpose.

## What it checks
- `.vscode/mcp.json` and other common MCP config locations
- tool descriptions and prompt resources
- repo manifests and dependency signals
- obvious secret-bearing files such as `.env`
- risky patterns such as embedded credentials, token passthrough, unsafe launchers, insecure remote targets, prompt injection, and tool poisoning

## Why people use it
- It runs locally by default
- The Lite scan does not require an account
- It is built for MCP preflight review, not a broad security platform
- Findings are meant to be readable by developers, not just auditors

## What it is not
- Not a hosted scanner
- Not an agent runtime
- Not a SIEM
- Not a general AppSec platform

## Read this next
- [Privacy](PRIVACY.md)
- [Rule overview](RULES.md)
- [Sample report](SAMPLE_REPORT.md)
- [Security reporting](SECURITY.md)

## Commands
- `npm install`
- `npm run build`
- `npm run typecheck`
- `node packages/cli/dist/index.js scan /path/to/workspace`
- `npm run scan -- /path/to/workspace`

## Repository layout
- `packages/core`: shared scanning engine
- `packages/cli`: command-line entrypoint
- `apps/vscode-extension`: VS Code integration

## Support
- Questions and feature requests: [GitHub Discussions](https://github.com/TimesAndPlaces/mcp-preflight/discussions)
- Bugs: [GitHub Issues](https://github.com/TimesAndPlaces/mcp-preflight/issues)
