# MCP Preflight

MCP Preflight helps you catch risky MCP configs before you run them.

The point is simple: scan first, trust later. The extension is local-first, fast to run, and written for people who want a clear answer instead of a dashboard.

## What you get
- scan the current workspace
- scan the current file
- Problems panel diagnostics
- fix guidance in plain language
- no required login for the Lite scan flow
- a local Pro license command when you want to unlock export and workflow features

## Commands
- `MCP Preflight: Scan Workspace`
- `MCP Preflight: Scan Current File`
- `MCP Preflight: Show Fix Recipes`
- `MCP Preflight: Install Pro License`
- `MCP Preflight: Show License Status`

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

## Upgrade
- Buy MCP Preflight Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Pro stays local after purchase: install the signed license token on the machine instead of logging into a hosted MCP Preflight account

## Read more
- [Privacy note](https://github.com/TimesAndPlaces/mcp-preflight/blob/main/PRIVACY.md)
- [Rule overview](https://github.com/TimesAndPlaces/mcp-preflight/blob/main/RULES.md)
- [Sample report](https://github.com/TimesAndPlaces/mcp-preflight/blob/main/SAMPLE_REPORT.md)
- [Audit notes](https://github.com/TimesAndPlaces/mcp-preflight/blob/main/AUDITS.md)
- [Security reporting](https://github.com/TimesAndPlaces/mcp-preflight/blob/main/SECURITY.md)
