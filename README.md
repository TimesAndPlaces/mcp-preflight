# MCP Preflight

MCP Preflight is the fast local check you run before you trust a new MCP server or ship an agent workflow.

It reads common MCP config files, tool descriptions, prompt resources, and repo manifests, then explains risky patterns in plain language so you can fix them before they become a bigger problem.

Website: [mcppreflight.com](https://mcppreflight.com)

This repo contains the Lite product code, public docs, and release paths people need to evaluate MCP Preflight. Internal planning and maintainer admin work are kept private.

## What it checks
- `.vscode/mcp.json` and other common MCP config locations
- tool descriptions and prompt resources
- repo manifests and dependency signals
- obvious secret-bearing files such as `.env`
- risky patterns such as embedded credentials, token passthrough, unsafe launchers, insecure remote targets, prompt injection, and tool poisoning

## Fast start
If you want to see MCP Preflight work before you point it at your own repo:

1. `npm install`
2. `npm run quickstart`
3. `npm run scan -- /path/to/your/workspace`

`npm run quickstart` scans the bundled example workspace in [`demo/example-findings-workspace`](demo/example-findings-workspace). It is there to show a representative finding set on a small self-contained config before you point MCP Preflight at your own repo.

If you would rather use the editor flow, install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode), open the MCP Preflight overview from the status bar, then run a workspace scan or current-file scan from there.

## Why people use it
- It runs locally by default
- The Lite scan does not require an account
- It is built for MCP preflight review, not a broad security platform
- Findings are written to be readable by developers, not just auditors
- The activity log stays local too, so you can inspect usage without sending workspace data to a backend

## Lite and Pro
- Lite is the fast local scan: text and JSON output, workspace scan, file scan, and the core MCP checks
- Pro unlocks the export and workflow surfaces: Markdown, HTML, and SARIF reports, suppression files, CI mode, Git hooks, and policy presets
- Pro is unlocked with a local signed license token, not a hosted MCP Preflight account
- The scanner does not need to phone home just to decide whether Pro is active on your machine
- Buy Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Activation and install: [Pro license guide](https://mcppreflight.com/pro/)

## What it is not
- Not a hosted scanner
- Not an agent runtime
- Not a SIEM
- Not a general AppSec platform

## Read this next
- [Privacy](PRIVACY.md)
- [Pro license guide](https://mcppreflight.com/pro/)
- [Rule overview](RULES.md)
- [Sample report](SAMPLE_REPORT.md)
- [Audit notes](AUDITS.md)
- [Security reporting](SECURITY.md)

## Commands
- `npm install` compiles the CLI and extension in this repo
- `npm run quickstart` shows a real scan against the bundled example workspace
- `npm run scan -- /path/to/workspace` scans your own workspace
- `node packages/cli/dist/index.js scan /path/to/workspace --no-exit-code` prints findings without returning a failing exit code
- `node packages/cli/dist/index.js activity status` shows local activity counts
- `node packages/cli/dist/index.js license guide` explains Pro delivery and install
- `node packages/cli/dist/index.js license status` checks whether this machine has Pro unlocked
- `node packages/cli/dist/index.js license install --from-file /path/to/license.token` installs a signed Pro token
- `node packages/cli/dist/index.js ci /path/to/workspace --policy balanced` runs the Pro CI gate
- `node packages/cli/dist/index.js hooks install /path/to/repo --hook pre-push` installs the Pro Git hook
- `node packages/cli/dist/index.js upgrade` opens Pro checkout
- `node packages/cli/dist/index.js review --channel marketplace` opens the review page
- `node packages/cli/dist/index.js support --channel discussions` opens Discussions

## Local activity
MCP Preflight keeps a small local activity log so you can answer practical questions like:
- how many scans have I actually run
- how often have I hit a Pro gate
- did I already install a local Pro license on this machine

That log is local-only. It does not include workspace contents, and MCP Preflight does not upload it to a hosted service.

If you do not want the log, set `MCP_PREFLIGHT_DISABLE_ACTIVITY=1`.

If you want to store it somewhere else, set `MCP_PREFLIGHT_ACTIVITY_FILE=/path/to/activity-log.jsonl`.

## Releases
- [GitHub Releases](https://github.com/TimesAndPlaces/mcp-preflight/releases) for `.vsix` files, CLI bundles, and release notes
- Install the extension directly from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode)

## Repository layout
- `packages/core`: shared scanning engine
- `packages/cli`: command-line entrypoint
- `apps/vscode-extension`: VS Code integration

## Support
- Questions and feature requests: [GitHub Discussions](https://github.com/TimesAndPlaces/mcp-preflight/discussions)
- Bugs: [GitHub Issues](https://github.com/TimesAndPlaces/mcp-preflight/issues)
- License and payment help: `igorsv199@gmail.com`
- Leave a review: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode)
