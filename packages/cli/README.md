# MCP Preflight CLI

`mcp-preflight` is the local-first CLI for static MCP setup review before first trust.

It scans `mcp.json`, prompt/tool descriptions, and repo manifests locally. The default scan does not connect to the server or exercise tools.

## Install

```bash
npm install -g mcp-preflight
```

## Use

```bash
mcp-preflight scan .
mcp-preflight scan . --format json
mcp-preflight scan . --format markdown
```

## What it checks

- risky MCP server transport and auth patterns
- prompt injection and tool-poisoning language
- credential exposure and broad env passthrough
- unsafe install sources and floating ephemeral launchers
- repo and config issues that are easy to miss before first run

## More

- Website: https://mcppreflight.com
- Docs and source: https://github.com/TimesAndPlaces/mcp-preflight
