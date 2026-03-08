# MCP Preflight CLI

`mcp-preflight` is the published CLI for MCP Preflight.

Use it to review MCP config, prompt text, tool descriptions, and repo manifests before you trust a setup or ship an agent workflow.

The default scan is static and local. It does not connect to the server or execute tools.

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

## What it reviews

- risky MCP transport and auth patterns
- prompt injection and tool-poisoning language
- credential exposure and broad env passthrough
- unsafe install sources and floating ephemeral launchers
- repo and config issues that are easy to miss before first run

## More

- Website: https://mcppreflight.com
- Docs and source: https://github.com/TimesAndPlaces/mcp-preflight
