# MCP Preflight Pro

MCP Preflight Pro keeps the core scan the same. It adds the parts people need when the scan moves from local review to handoff and gating.

It is a one-time purchase. The unlock stays local and does not turn MCP Preflight into a hosted account product.

## What Pro adds

- Markdown, HTML, and SARIF reports
- CI mode
- Git hooks
- policy presets
- 12 months of update entitlement from the purchase date

## Buy Pro

- Buy MCP Preflight Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Use the email address where you want the signed license token sent

## What arrives after purchase

- a signed local `license.token` file
- a local Pro unlock on the machine where you install it
- no MCP Preflight account requirement just to use Pro

## Install from the CLI

If you installed the published CLI from npm:

```bash
mcp-preflight license install --from-file /path/to/license.token
mcp-preflight license status
```

If you are running from the source checkout:

```bash
node packages/cli/dist/index.js license install --from-file /path/to/license.token
node packages/cli/dist/index.js license status
```

If you are using the standalone CLI bundle from GitHub Releases:

```bash
node mcp-preflight.js license install --from-file /path/to/license.token
node mcp-preflight.js license status
```

## Install from the VS Code extension

1. Open the Command Palette.
2. Run `MCP Preflight: Install Pro License`.
3. Paste the token contents.
4. Run `MCP Preflight: Show License Status` to confirm that the machine is unlocked.

## Reissue and recovery

- Keep the `license.token` file somewhere you can find again.
- If you lose it or move to another machine, contact support with the checkout email or Stripe payment reference.

## Commercial pages

- Support: [mcppreflight.com/support/](https://mcppreflight.com/support/)
- Terms: [mcppreflight.com/terms/](https://mcppreflight.com/terms/)
- Refunds: [mcppreflight.com/refunds/](https://mcppreflight.com/refunds/)
