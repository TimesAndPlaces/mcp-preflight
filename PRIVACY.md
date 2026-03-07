# Privacy

This is the plain-language version of how `MCP Preflight` is meant to behave.

## Short version
- The Lite product is designed to run locally.
- It does not require an account.
- It does not require a hosted MCP Preflight service.
- It scans files in the workspace you point it at.

## What it reads
The scanner looks at local files that help it answer one question: "Is this MCP setup safe enough to trust?"

That includes things like:
- `.vscode/mcp.json`
- common MCP config files
- `package.json`
- `pyproject.toml`
- lockfile presence
- tool descriptions
- prompt resources
- obvious secret-bearing files such as `.env`

## What it sends
MCP Preflight itself is intended to work without sending your workspace to a hosted MCP Preflight backend.

In the Lite product, local scanning should work without any MCP Preflight account or remote upload step.

The current Pro unlock path is also local. A signed license token can be stored on disk and verified on the machine without an MCP Preflight login flow.

MCP Preflight now also keeps a small local activity log by default. That log is meant to help you inspect scan counts, blocked Pro features, and local license actions on your own machine.

The activity log is local-only. It is not uploaded to an MCP Preflight service.

It is designed to record product events such as:
- scan completions
- local license installs and status checks
- blocked Pro workflow surfaces
- upgrade, review, and support links opened from the product

It is not meant to store workspace contents.

## Important limits
- Your editor, extension marketplace, operating system, or package manager may still have their own telemetry or network behavior
- Third-party MCP servers you choose to run are outside this privacy note
- If future paid update delivery changes this behavior, it should be described clearly and separately

## Design stance
The goal is conservative behavior:
- local by default
- no hidden cloud scan
- clear outputs
- no surprise account requirement for the free scan flow
- local activity is inspectable and optional

## Local activity controls
- Disable local activity logging with `MCP_PREFLIGHT_DISABLE_ACTIVITY=1`
- Change the local activity file path with `MCP_PREFLIGHT_ACTIVITY_FILE=/path/to/activity-log.jsonl`
