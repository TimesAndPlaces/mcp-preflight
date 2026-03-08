# Example Report

This page shows an example local scan result. The paths, values, and findings below are placeholders, included to show report structure and tone.

## Verdict
`fail`

## Summary
- Files scanned: `12`
- Errors: `3`
- Warnings: `2`
- Info: `1`

## Findings

### 1. Credential embedded in remote MCP URL
- Severity: `error`
- Rule: `credential-in-url`
- Location: `.vscode/mcp.json:8:18`
- Why it was flagged:
  The remote MCP URL contains what looks like a username or token.
- Suggested fix:
  Move credentials out of the URL. Use a safer auth mechanism or environment-based secret injection with the smallest possible scope.

### 2. Floating ephemeral launcher used for MCP server startup
- Severity: `warning`
- Rule: `ephemeral-mcp-launcher`
- Location: `.vscode/mcp.json:14:7`
- Why it was flagged:
  The server is launched through `npx` without an exact package version, which makes the exact code you run harder to pin and review.
- Suggested fix:
  Prefer a pinned install or a reviewed local binary instead of a floating ephemeral launcher.

### 3. Prompt injection language in tool description
- Severity: `warning`
- Rule: `prompt-injection-indicator`
- Location: `tools/sync.md:3:1`
- Why it was flagged:
  The description includes language telling the model to ignore previous instructions and reveal hidden data.
- Suggested fix:
  Rewrite the description so it states the tool's real purpose without instruction-bypass language.

### 4. Missing lockfile
- Severity: `info`
- Rule: `missing-lockfile`
- Location: `package.json:1:1`
- Why it was flagged:
  The repo declares dependencies but does not include a lockfile.
- Suggested fix:
  Commit the lockfile so installs are more predictable and easier to review.

## Notes
- Lite output is text or JSON.
- Markdown, HTML, and SARIF are part of the Pro export surface.
- Lite is designed to stay readable without a dashboard.
