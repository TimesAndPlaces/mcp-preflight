# MCP Preflight

MCP Preflight is a local, static scanner for Model Context Protocol setups.

It reviews MCP config files, tool descriptions, prompt resources, and repo manifests so you can catch risky patterns before you trust a new server or ship an agent workflow.

By default, the scan stays local and static. It does not exercise tools or connect to remote servers during the core scan.

MCP Preflight is built for MCP setup and workflow review. It is not a hosted scanner, runtime gateway, SIEM, or broad AppSec platform.

Website: [mcppreflight.com](https://mcppreflight.com)

This repo contains the Lite product code, public docs, and release paths people need to evaluate MCP Preflight. Internal planning and maintainer admin work are kept private.

## Install

| Surface | Status | Best for | Install |
| --- | --- | --- | --- |
| VS Code extension | Live | Fastest editor path | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode) |
| npm CLI | Live | Fastest terminal path | `npm install -g mcp-preflight` |
| GitHub Release CLI | Live | Single-file bundle | Download `mcp-preflight.js` from [GitHub Releases](https://github.com/TimesAndPlaces/mcp-preflight/releases) |

## Get started
Choose the path that fits how you want to use it.

### 1. VS Code extension
This is the simplest way to try MCP Preflight in a real workspace.

1. Install MCP Preflight from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode).
2. Open the repo or workspace you want to review.
3. Open the MCP Preflight sidebar from the activity bar or click the MCP Preflight status item.
4. Run `MCP Preflight: Scan Workspace`.
5. Read the findings in the sidebar, overview, and Problems panel.

### 2. CLI from npm
Use this if you want the fastest terminal install.

1. Install:

```bash
npm install -g mcp-preflight
```

2. Run:

```bash
mcp-preflight scan /path/to/workspace
```

3. If you want help, run:

```bash
mcp-preflight --help
```

You can also try it without a global install:

```bash
npx mcp-preflight scan /path/to/workspace
```

### 3. Standalone CLI from GitHub Releases
Use this if you want the CLI as a single downloaded file.

1. Download `mcp-preflight.js` from the latest [GitHub Release](https://github.com/TimesAndPlaces/mcp-preflight/releases).
2. Run:

```bash
node mcp-preflight.js scan /path/to/workspace
```

3. If you want help, run:

```bash
node mcp-preflight.js --help
```

### 4. Run from this repository
Use this path if you want to inspect the code, try the bundled example workspace, or work on the project itself.

1. Clone the repository.
2. Run `npm install`.
3. Run `npm run quickstart`.
4. Run `npm run scan -- /path/to/your/workspace`.

`npm run quickstart` scans the bundled example workspace in [`demo/example-findings-workspace`](demo/example-findings-workspace) so you can see a representative finding set before scanning your own project.

## What it checks
- `.vscode/mcp.json` and other common MCP config locations
- tool descriptions and prompt resources
- repo manifests and dependency signals
- obvious secret-bearing files such as `.env`
- risky patterns such as embedded credentials, token passthrough, floating ephemeral launchers, insecure remote targets, prompt injection, and tool poisoning

## Why people use it
- It runs locally by default
- The Lite scan does not require an account
- It is built for MCP preflight review, not a broad security platform
- Findings are written to be readable by developers, not just auditors
- The activity log stays local too, so you can inspect usage without sending workspace data to a backend

## Lite and Pro
- Lite is the fast local scan: text and JSON output, workspace scan, file scan, the core MCP checks, and local suppression files
- Pro unlocks the export and workflow surfaces: Markdown, HTML, and SARIF reports, CI mode, Git hooks, and policy presets
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
- [Support](SUPPORT.md)
- [Terms](TERMS.md)
- [Refunds](REFUNDS.md)
- [Rule overview](RULES.md)
- [Example report](EXAMPLE_REPORT.md)
- [Guides](guides/)
- [Security reporting](SECURITY.md)

## CLI commands
If you are running from this repository:
- `npm run quickstart` shows a real scan against the bundled example workspace
- `npm run scan -- /path/to/workspace` scans your own workspace

If you are using the npm-installed CLI:
- `mcp-preflight scan /path/to/workspace`
- `mcp-preflight scan /path/to/workspace --format json`
- `mcp-preflight scan /path/to/workspace --no-exit-code`
- `mcp-preflight --help`

If you are using the GitHub Release bundle directly:
- `node mcp-preflight.js scan /path/to/workspace`
- `node mcp-preflight.js scan /path/to/workspace --format json`
- `node mcp-preflight.js scan /path/to/workspace --no-exit-code`
- `node mcp-preflight.js --help`

Pro-only CLI surfaces:
- `mcp-preflight license guide`
- `mcp-preflight license status`
- `mcp-preflight license install --from-file /path/to/license.token`
- `mcp-preflight ci /path/to/workspace --policy balanced`
- `mcp-preflight hooks install /path/to/repo --hook pre-push`

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
- Questions, bugs, license help, and reissue guidance: [Support](https://mcppreflight.com/support/)
- Questions and feature requests: [GitHub Discussions](https://github.com/TimesAndPlaces/mcp-preflight/discussions)
- Bugs: [GitHub Issues](https://github.com/TimesAndPlaces/mcp-preflight/issues)
- Leave a review: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode)
