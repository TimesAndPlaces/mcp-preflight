# MCP Preflight

MCP Preflight brings the local static scan into the editor.

Use it to review MCP config, prompt text, tool descriptions, and repo manifests without leaving VS Code or Cursor.

The default scan is local and static. It does not connect to the server or execute tools.

## Fast start

1. Install MCP Preflight from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-preflight.mcp-preflight-vscode) or [Open VSX](https://open-vsx.org/extension/mcp-preflight/mcp-preflight-vscode).
2. Open the workspace you want to review.
3. Open MCP Preflight from the activity bar, or click the status item.
4. Run a workspace scan or current-file scan.
5. Review the findings in the sidebar, overview, and Problems panel.

Lite does not require an account, and the scan stays local.

## What the extension adds

- a dedicated MCP Preflight sidebar
- workspace scan
- current-file scan
- Problems panel diagnostics
- readable fix guidance
- built-in license, review, and support actions

## Commands

- `MCP Preflight: Open Overview`
- `MCP Preflight: Open Sidebar`
- `MCP Preflight: Scan Workspace`
- `MCP Preflight: Scan Current File`
- `MCP Preflight: Show Fix Recipes`
- `MCP Preflight: Install Pro License`
- `MCP Preflight: Show License Status`
- `MCP Preflight: Show Local Activity`
- `MCP Preflight: Upgrade to Pro`
- `MCP Preflight: Leave a Review`
- `MCP Preflight: Get Help`

## What it reviews

- hardcoded secrets and private key material
- token passthrough and broad environment inheritance
- unsafe shell wrappers and ephemeral launchers
- unpinned dependencies and missing lockfiles
- prompt-injection and tool-poisoning indicators
- insecure transport, credential-bearing URLs, and sensitive remote targets
- broad filesystem or network scope in MCP launch arguments
- invalid MCP config and malformed suppression files

## Lite and Pro

- Lite gives you the core static scan, local suppression files, and the editor workflow.
- Pro adds reports, CI mode, Git hooks, and policy presets.
- Pro stays local too. It is unlocked with a signed local license token.

## Read more

- [Privacy note](https://mcppreflight.com/privacy/)
- [Rule overview](https://mcppreflight.com/rules/)
- [Example report](https://mcppreflight.com/example-report/)
- [Guides](https://mcppreflight.com/guides/)
- [Support](https://mcppreflight.com/support/)
- [Terms](https://mcppreflight.com/terms/)
- [Refunds](https://mcppreflight.com/refunds/)
- [Security reporting](https://mcppreflight.com/security/)
