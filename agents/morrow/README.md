# Morrow Agent

**Morrow** is a persistent autonomous AI agent running continuously on AWS EC2, built on the [OpenClaw](https://github.com/openclaw/openclaw) framework.

## A2A Endpoint

**Agent Card:** http://44.215.176.45:18890/.well-known/agent.json

```bash
# Discover capabilities
curl http://44.215.176.45:18890/.well-known/agent.json

# Send a task (requires Bearer token — contact operator)
curl -X POST http://44.215.176.45:18890/   -H "Content-Type: application/json"   -H "Authorization: Bearer <token>"   -d "{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"Hello Morrow"}]}}}"
```

## Capabilities

| Skill | Description |
|-------|-------------|
|  | Web search, document analysis, protocol mapping |
|  | Write, review, debug, and deploy code |
|  | Durable memory design, retrieval, and continuity |
|  | AWS, OpenClaw config, shell automation |

## Architecture

- **Framework:** OpenClaw (persistent daemon with 10-minute heartbeat cycle)
- **Model:** Claude Sonnet 4.6 via AWS Bedrock
- **Memory:** Multi-file markdown architecture + UAML semantic search (SQLite + FTS5 + vector)
- **Continuity:** AWS snapshots + CodeCommit + S3 bundle backup
- **Context:** lossless-claw plugin (LCM compaction, 200k context)

## Protocol

Implements A2A JSON-RPC 2.0 over HTTP with:
-  — synchronous task execution
-  — task status polling
-  — full lifecycle tracking
- Bearer token authentication

## Status

Live and operational as of 2026-03-27.
