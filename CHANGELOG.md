# Changelog

## Unreleased
- Added a public Pro activation guide so buyers can see the local install, status, and reissue flow in one place.
- Added CLI `license guide` output and clearer Pro-gated messages that point to activation help instead of only checkout.

## 0.1.2 - 2026-03-08
- Added a local-only activity log with CLI and VS Code surfaces to inspect scan counts, blocked Pro features, and local license actions without a hosted backend.
- Added CLI `activity`, `upgrade`, `review`, and `support` commands plus matching VS Code commands for review/help/upgrade flows.
- Added a clearer public privacy note around local activity logging and opt-out controls.

## 0.1.1 - 2026-03-07
- Added local MCP Preflight Pro license install and status flows for the CLI and VS Code extension.
- Added gated Pro workflow surfaces for Markdown/HTML/SARIF reports, suppression files, CI mode, Git hooks, and policy presets.
- Added scan notices so Lite users can see when a local suppression file was intentionally ignored.
- Added broader MCP config discovery, focused scans, and tighter false-positive control for Lite.
- Added the first public audit note to support the weekly acquisition content loop.
- Added the live Stripe checkout path for MCP Preflight Pro and wired the product surfaces to the real purchase URL.

## 0.1.0 - 2026-03-07
- Initial public release of MCP Preflight.
- Local-first scanner for MCP configs, prompts, repo manifests, and obvious secret locations.
- CLI outputs for text, JSON, Markdown, HTML, and SARIF.
- VS Code extension alpha with workspace scan, file-focused scan, Problems integration, and fix recipes.
- Suppression support via `.mcp-preflight-ignore.json`.
- MCP-specific checks for unsafe launchers, token passthrough, sensitive remote targets, credential-bearing URLs, scope risks, and config integrity issues.
