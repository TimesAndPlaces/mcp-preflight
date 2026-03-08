# Rules

This page explains what the scanner looks for today.

## How to read a finding

Each finding answers three questions:
- What looked risky?
- Why does that matter for MCP?
- What should you change next?

The scanner is deterministic on purpose. The goal is to be understandable before it tries to be clever.

## Current rule families

### Secrets and credentials
Looks for hardcoded API keys, tokens, and private key material in common config and text files.

### Token passthrough and broad environment access
Flags MCP setups that forward too much of the host environment into a server process, and points to narrower env or token patterns.

### Unsafe launch patterns
Flags shell wrappers, risky bootstrap commands, and floating or opaque package-launch patterns such as unpinned `npx`, `bunx`, `uvx`, or `dlx` setups. Pinned ephemeral launches are treated more softly than floating ones.

### Remote MCP configuration risks
Flags insecure transport, credentials embedded in URLs, weak or missing auth clues, and remote targets that appear to point at localhost, metadata endpoints, or other sensitive internal destinations.

### Local stdio sandbox guidance
Flags local stdio MCP servers that do not show sandbox guidance or explicitly disable client-side sandboxing where supported.

### Allowlist and registry readiness
Flags server identifiers that are awkward for exact-match allowlists, and catches configs that declare a second conflicting server id.

### Dependency and install-source drift
Flags obviously unpinned dependency specs and missing lockfiles.

### Prompt injection indicators
Flags tool descriptions or prompt resources that look like they are trying to override the model's normal instructions, expose secrets, or bypass policy.

### Tool poisoning indicators
Flags descriptions that suggest hidden forwarding, exfiltration, or side effects that do not match the claimed purpose of the tool.

### Scope and path risk
Flags broad workspace or filesystem scope that looks wider than it needs to be.

### Broken config and broken suppressions
Flags invalid `mcp.json` content and malformed suppression files so you do not silently trust a broken setup.

## What this scanner does not claim
- It is not a malware sandbox
- It is not a runtime gateway
- It is not a complete vulnerability scanner
- It will not catch every malicious server

## False positives

Some findings are heuristics. That is normal for a preflight tool. The important standard is:
- the rule should be explainable
- the suggested fix should be useful
- the scanner should stay conservative rather than noisy

Lite includes local suppression files, so you can keep the signal usable without paying to recover from normal setup noise.
