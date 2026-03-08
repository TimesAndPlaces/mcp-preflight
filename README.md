# MCP Preflight

MCP Preflight is the fast local check you run before you trust a new MCP server or ship an agent workflow.

It reads common MCP config files, tool descriptions, prompt resources, and repo manifests, then explains risky patterns in plain language so you can fix them before they become a bigger problem.

Website: [mcppreflight.com](https://mcppreflight.com)

This repo contains the Lite product code, public docs, and release paths people need to evaluate MCP Preflight. Internal planning and maintainer admin work are kept private.

## Get started
Choose the path that matches how you want to try MCP Preflight.

### 1. VS Code extension
This is the fastest way to try it.

1. Install MCP Preflight from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode).
2. Open the repo or workspace you want to review.
3. Run `MCP Preflight: Scan Workspace`.
4. Read the findings in the overview and Problems panel.

### 2. Standalone CLI from GitHub Releases
Use this if you want the CLI without building the repo first.

1. Download `mcp-preflight.js` from the latest [GitHub Release](https://github.com/TimesAndPlaces/mcp-preflight/releases).
2. Run:

```bash
node mcp-preflight.js scan /path/to/workspace
```

3. If you want help, run:

```bash
node mcp-preflight.js --help
```

### 3. Run from this repository
Use this path if you want to inspect the code, try the bundled example workspace, or work on the project itself.

1. Clone the repository.
2. Run `npm install`.
3. Run `npm run quickstart`.
4. Run `npm run scan -- /path/to/your/workspace`.

`npm run quickstart` scans the bundled example workspace in [`demo/example-findings-workspace`](demo/example-findings-workspace) so you can see a representative finding set before scanning your own project.

### Important note about npm
MCP Preflight is not currently published as a global npm package.

That means these are **not** the right install paths today:
- `npx mcp-preflight`
- `npm install -g mcp-preflight`

Use the VS Code extension, the standalone CLI from GitHub Releases, or this repository checkout.

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
- Findings are written to be readable by developers, not just auditors
- The activity log stays local too, so you can inspect usage without sending workspace data to a backend

## Lite and Pro
- Lite is the fast local scan: text and JSON output, workspace scan, file scan, and the core MCP checks
- Pro unlocks the export and workflow surfaces: Markdown, HTML, and SARIF reports, suppression files, CI mode, Git hooks, and policy presets
- Pro is unlocked with a local signed license token, not a hosted MCP Preflight account
- The scanner does not need to phone home just to decide whether Pro is active on your machine
- Buy Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Activation and install: [Pro guide](https://mcppreflight.com/pro/)

## What it is not
- Not a hosted scanner
- Not an agent runtime
- Not a SIEM
- Not a general AppSec platform

## Read this next
- [Privacy](PRIVACY.md)
- [Pro guide](https://mcppreflight.com/pro/)
- [Rule overview](RULES.md)
- [Example report](EXAMPLE_REPORT.md)
- [Guides](guides/)
- [Security reporting](SECURITY.md)

## CLI commands
If you are running from this repository:
- `npm run quickstart` shows a real scan against the bundled example workspace
- `npm run scan -- /path/to/workspace` scans your own workspace

If you are using the built CLI directly:
- `node mcp-preflight.js scan /path/to/workspace`
- `node mcp-preflight.js scan /path/to/workspace --format json`
- `node mcp-preflight.js scan /path/to/workspace --no-exit-code`
- `node mcp-preflight.js --help`

Pro-only CLI surfaces:
- `node mcp-preflight.js license guide`
- `node mcp-preflight.js license status`
- `node mcp-preflight.js license install --from-file /path/to/license.token`
- `node mcp-preflight.js ci /path/to/workspace --policy balanced`
- `node mcp-preflight.js hooks install /path/to/repo --hook pre-push`

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
