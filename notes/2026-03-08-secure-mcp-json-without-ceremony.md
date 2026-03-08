# How to secure `mcp.json` without turning it into ceremony

This is a practical preflight read of the current `mcp.json` model in VS Code and the MCP security guidance around it.

It is not a vulnerability claim. The point is simpler than that: most bad MCP setups are not dramatic exploits. They are small convenience choices that quietly widen trust.

## Source material
- [VS Code: Add and manage MCP servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [VS Code: MCP configuration reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)
- [Model Context Protocol: Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [Model Context Protocol: Understanding Authorization in MCP](https://modelcontextprotocol.io/docs/tutorials/security/authorization)

## The common mistake

A rushed `mcp.json` usually goes wrong in one of three ways:

- it puts secrets directly in the file
- it makes a local server broader than it needs to be
- it treats a quick-start example as if it were a production-ready daily setup

None of those look dramatic when you are trying to get tools working. They matter later, when the config sticks around and starts feeling "normal."

## What a low-ceremony safe setup looks like

### 1. Put the server in the right place

VS Code supports `mcp.json` in your workspace and in your user profile.

That is not just an organizational choice. It changes where the server runs and who inherits it.

- Workspace config is the right place for team-shared server definitions that really belong with the repo
- User-profile config is better for personal or machine-specific servers that should not quietly follow the repo around

One detail is easy to miss: VS Code says MCP servers run wherever they are configured. A user-profile server runs locally. If you are connected to a remote machine and want the server there, you should define it in workspace or remote user configuration instead.

**Preflight take:** if a server is personal, host-specific, or secret-heavy, do not drop it into shared workspace config just because that is the first file you found.

### 2. Keep secrets out of the file

VS Code is very direct about this: avoid hardcoding sensitive information like API keys. Use input variables or environment files instead.

That gives you a much cleaner boundary:

- `inputs` for things you want VS Code to prompt for and store securely
- `envFile` for environment-based local setup
- `headers` or `env` values that reference `${input:...}` instead of embedding raw credentials

The pattern to avoid is the one developers reach for when they are in a hurry:

- API keys in plain text
- bearer tokens inside URLs
- copied personal credentials inside a repo-tracked `.vscode/mcp.json`

**Preflight take:** if a token appears directly in `mcp.json`, the config is already too trusting.

### 3. Keep local servers narrow

The MCP security guidance treats local servers as a serious trust boundary because they run on the same machine as the client and can have direct access to the local system.

That is why "it only runs locally" is not a safety argument by itself.

In practice, narrow means:

- small path scope instead of whole-home-directory access
- explicit environment variables instead of broad forwarding
- reviewed commands instead of opaque wrapper chains
- only the network access the server actually needs

If you are on macOS or Linux, VS Code now supports `sandboxEnabled` plus filesystem and network rules in `mcp.json`. That is one of the easiest high-value hardening moves available today.

If you are on Windows, that specific sandbox is not available, so the command, args, paths, and auth choices matter even more.

**Preflight take:** the safest local MCP config is the one that feels slightly constrained, not the one that can touch everything.

### 4. Keep remote auth explicit

The MCP docs are equally clear on the remote side:

- token passthrough is a forbidden anti-pattern
- MCP servers must not accept tokens that were not explicitly issued for the MCP server
- authorization endpoints must be served over HTTPS

For everyday `mcp.json` review, that translates into very plain checks:

- prefer `https://` for remote servers unless you are intentionally using localhost
- keep auth in explicit headers, not buried in URLs
- do not assume "it already has a token" means the trust model is fine

If a remote config hides authentication details in a way you cannot explain in one sentence, it is not a clean setup yet.

**Preflight take:** remote MCP auth should look boring and explicit. If it looks clever, review it again.

### 5. Treat trust prompts as real review points

VS Code asks you to trust a server when you add or change one in workspace configuration and start it for the first time.

That is useful, but it is not a substitute for reading the config. VS Code also notes an important exception: if you start the MCP server directly from the `mcp.json` file, you will not be prompted to trust the configuration.

So the review moment is still yours to use well or waste.

**Preflight take:** read the command, args, URL, headers, and scope before the first start. Do not outsource that judgment to the existence of a dialog box.

## What MCP Preflight would usually flag in a rushed `mcp.json`

The most common findings are not exotic:

- raw credentials or secrets in config
- token passthrough or auth-review patterns on remote servers
- insecure `http://` remote URLs that are not obviously local
- ephemeral launchers like `npx` in day-to-day setups
- broad environment inheritance
- local servers with write or network scope that is much wider than the task
- missing sandboxing where a constrained local setup would be possible

That is the point of preflight: catch the boring mistakes before they become trusted defaults.

## A short checklist

Before you trust a new `mcp.json`, ask:

- should this server live in workspace config or only in my user profile?
- did I keep secrets out of the file?
- is the command pinned and understandable?
- is the local path and network scope narrower than "whatever works"?
- is remote auth explicit and HTTPS-based where it should be?
- am I actually reading the config, or just clicking through startup?

That is enough ceremony for most teams.

The next action is simple: open your current `mcp.json` and read it like a permission grant, not like a convenience file.
