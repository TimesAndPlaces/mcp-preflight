# MCP Preflight

MCP Preflight helps you catch risky MCP configs before you run them.

The point is simple: scan first, trust later. The extension is local-first, fast to run, and written for people who want a clear answer instead of a dashboard.

## Fast start
1. Install MCP Preflight from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode).
2. Open the repo or workspace you want to review.
3. Click the MCP Preflight status item or run `MCP Preflight: Open Overview`.
4. From the overview, run a workspace scan or current-file scan.
5. If you want to see example findings first, open the bundled example workspace in the public repo and scan that.

You do not need an MCP Preflight account for Lite. The scan runs locally.

## What you get
- scan the current workspace
- scan the current file
- Problems panel diagnostics
- fix guidance in plain language
- no required login for the Lite scan flow
- a local Pro license command when you want to unlock export and workflow features

## Commands
- `MCP Preflight: Open Overview`
- `MCP Preflight: Scan Workspace`
- `MCP Preflight: Scan Current File`
- `MCP Preflight: Show Fix Recipes`
- `MCP Preflight: Install Pro License`
- `MCP Preflight: Show License Status`
- `MCP Preflight: Show Local Activity`
- `MCP Preflight: Upgrade to Pro`
- `MCP Preflight: Leave a Review`
- `MCP Preflight: Get Help`

If you are reviewing one config file instead of a whole repo, run `MCP Preflight: Scan Current File`.

The overview panel keeps the latest scan result, local activity summary, license state, and upgrade/review/help links in one place.

## What it checks today
- hardcoded secrets and private key material
- token passthrough and broad environment inheritance
- unsafe shell wrappers and ephemeral launchers
- unpinned dependencies and missing lockfiles
- prompt-injection and tool-poisoning indicators
- insecure transport, credential-bearing URLs, and sensitive remote targets
- broad filesystem or network scope in MCP launch arguments
- invalid MCP config and malformed suppression files

## Why people use it
- local scan by default
- no hosted MCP Preflight account required for the Lite scan
- Pro unlock stays local too, through a signed license token on the machine
- MCP-specific checks instead of a broad platform surface
- findings that explain what looked risky and what to fix next
- local activity is visible in the editor instead of being hidden behind a web dashboard

## Upgrade
- Buy MCP Preflight Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Pro stays local after purchase: install the signed license token on the machine instead of logging into a hosted MCP Preflight account
- Install and recovery steps: [Pro license guide](https://mcppreflight.com/pro/)

## Local activity
The extension keeps a small local activity log for scan runs, local license actions, blocked Pro surfaces, and the product links you open from the command palette.

That log stays on the machine unless you choose to export or share it yourself.

## Read more
- [Privacy note](https://mcppreflight.com/privacy/)
- [Rule overview](https://mcppreflight.com/rules/)
- [Sample report](https://mcppreflight.com/sample-report/)
- [Audit notes](https://mcppreflight.com/audits/)
- [Security reporting](https://mcppreflight.com/security/)
