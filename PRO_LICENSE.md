# MCP Preflight Pro

MCP Preflight Pro is a one-time purchase that unlocks the local export and workflow features without turning MCP Preflight into a hosted account product.

## What you get
- Markdown, HTML, and SARIF reports
- suppression files
- CI mode
- Git hooks
- policy presets
- 12 months of update entitlement from the purchase date

## Buy once
- Buy MCP Preflight Pro: [Stripe checkout](https://buy.stripe.com/5kQ9AT6eX75v8p605PfIs00)
- Use the email address where you want the signed license token sent

## What arrives after purchase
- a signed local `license.token` file
- the license works locally on your machine
- MCP Preflight does not need a hosted account just to decide whether Pro is active

## Install from the CLI
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
4. Run `MCP Preflight: Show License Status` to confirm the machine is unlocked.

## Reissue and recovery
- Keep the `license.token` file somewhere you can find again.
- If you lose it or move to another machine, contact license support with the same checkout email or Stripe payment reference and the token can be reissued.

## License and payment help
- `igorsv199@gmail.com`
