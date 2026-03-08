# MCP Preflight

MCP Preflight is a local, static scanner for Model Context Protocol setups.

It checks the files that define how an MCP server is installed, scoped, and described, then flags risky patterns before you trust the setup or ship an agent workflow.

The default scan stays on disk. It does not connect to the server or execute tools.

This is a narrow product on purpose. It is built for MCP setup and workflow review, not for live server testing, runtime enforcement, or broad AppSec coverage.

Website: [mcppreflight.com](https://mcppreflight.com)

## Install

| Surface | Status | Best for | Install |
| --- | --- | --- | --- |
| VS Code extension | Live | Editor workflow | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode) |
| npm CLI | Live | Terminal workflow | `npm install -g mcp-preflight` |
| GitHub Release CLI | Live | Single-file bundle | Download `mcp-preflight.js` from [GitHub Releases](https://github.com/TimesAndPlaces/mcp-preflight/releases) |

## Get started

Pick the path that matches how you want to try it.

### 1. VS Code extension

This is the fastest way to see the scanner in a real project.

1. Install MCP Preflight from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode).
2. Open the workspace you want to review.
3. Open the MCP Preflight sidebar from the activity bar, or click the MCP Preflight status item.
4. Run `MCP Preflight: Scan Workspace`.
5. Review the result in the sidebar, overview, and Problems panel.

### 2. CLI from npm

Install once and run it anywhere.

```bash
npm install -g mcp-preflight
mcp-preflight scan /path/to/workspace
```

If you want to try it without a global install:

```bash
npx mcp-preflight scan /path/to/workspace
```

For command help:

```bash
mcp-preflight --help
```

### 3. Standalone CLI from GitHub Releases

Use this if you want a single downloaded file instead of a global install.

```bash
node mcp-preflight.js scan /path/to/workspace
```

### 4. Run from this repository

Use this if you want to inspect the code, try the bundled example workspace, or work on the project itself.

1. Clone the repository.
2. Run `npm install`.
3. Run `npm run quickstart`.
4. Run `npm run scan -- /path/to/your/workspace`.

`npm run quickstart` scans the bundled example workspace in [`demo/example-findings-workspace`](demo/example-findings-workspace) so you can see a representative finding set before scanning your own project.

## What it reviews

- `.vscode/mcp.json` and other common MCP config locations
- tool descriptions and prompt resources
- repo manifests and dependency signals
- obvious secret-bearing files such as `.env`
- risky patterns such as credential exposure, token passthrough, floating ephemeral launchers, insecure remote targets, prompt injection, tool poisoning, and over-broad scope

## Why people use it

- It gives you a local review step before first trust.
- Lite works without an account.
- Findings explain what looked risky and what to change next.
- Lite includes local suppression files, so you can tune the signal without paying to recover from noise.
- It stays focused on MCP review instead of trying to be a general security platform.

## Lite and Pro

- Lite gives you the core local scan, text and JSON output, workspace and current-file scans, and local suppression files.
- Pro adds reports, CI mode, Git hooks, and policy presets around that scan.
- Pro is unlocked with a signed local license token. It does not require an MCP Preflight account.
- Buy Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Activation and install: [Pro guide](https://mcppreflight.com/pro/)

## What MCP Preflight does not do

- It does not run a hosted scan by default.
- It does not act as an agent runtime or runtime gateway.
- It does not claim live server testing in the default scan.
- It does not try to be a complete AppSec suite.

## Local activity

MCP Preflight can keep a small local activity log so you can see how often you scan, whether you have hit a Pro gate, and whether a local Pro token is already installed on the machine.

That log stays local. It does not include workspace contents, and MCP Preflight does not upload it to a hosted backend.

- Disable it with `MCP_PREFLIGHT_DISABLE_ACTIVITY=1`
- Change the file path with `MCP_PREFLIGHT_ACTIVITY_FILE=/path/to/activity-log.jsonl`

## CLI commands

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

## Read next

- [Privacy](PRIVACY.md)
- [Pro guide](https://mcppreflight.com/pro/)
- [Support](SUPPORT.md)
- [Terms](TERMS.md)
- [Refunds](REFUNDS.md)
- [Rule overview](RULES.md)
- [Example report](EXAMPLE_REPORT.md)
- [Guides](guides/)
- [Security reporting](SECURITY.md)

## Repository layout

- `packages/core`: shared scanning engine
- `packages/cli`: command-line entrypoint
- `apps/vscode-extension`: VS Code integration

## Support

- Product questions and feature requests: [GitHub Discussions](https://github.com/TimesAndPlaces/mcp-preflight/discussions)
- Bug reports: [GitHub Issues](https://github.com/TimesAndPlaces/mcp-preflight/issues)
- License, payment, and reissue help: [Support](https://mcppreflight.com/support/)
