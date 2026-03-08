# Privacy

MCP Preflight is built to review MCP setups locally.

This page explains what the scanner reads, what it stores on disk, and what it does not send anywhere else.

## Short version

- Lite runs locally and does not require an account.
- The default scan does not upload your workspace to an MCP Preflight backend.
- Pro is also unlocked locally with a signed license token.

## What the scanner reads

MCP Preflight reads local files that help it understand how an MCP setup is wired together.

That includes files such as:

- `.vscode/mcp.json` and other common MCP config locations
- `package.json`, `pyproject.toml`, and lockfile presence
- tool descriptions and prompt resources
- obvious secret-bearing files such as `.env`

## What stays local

The default scan is static and local. It does not send your source code, prompts, or config files to an MCP Preflight service.

The current Pro unlock path is local too. A signed license token can be stored on disk and verified on the machine without requiring an MCP Preflight account.

## Local activity

MCP Preflight can keep a small local activity log so you can answer practical questions like:

- how many scans have I run
- have I already installed a Pro token on this machine
- how often have I hit a Pro-only workflow feature

That log stays on the machine. It does not store workspace contents.

Controls:

- Disable activity logging with `MCP_PREFLIGHT_DISABLE_ACTIVITY=1`
- Change the activity file path with `MCP_PREFLIGHT_ACTIVITY_FILE=/path/to/activity-log.jsonl`

## Important limits

- Your editor, extension marketplace, operating system, or package manager may still have their own telemetry or network behavior.
- Third-party MCP servers you choose to run are outside this privacy note.
- If future update delivery changes this behavior, the change should be documented clearly.
