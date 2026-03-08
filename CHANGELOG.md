# Changelog

## Unreleased

## 0.1.12 - 2026-03-08
- Rebuilt the public site around a denser monochrome visual system with tighter spacing, hairline borders, and a more developer-first layout.
- Reworked the extension overview and sidebar to use a flatter, more compact UI instead of the previous glossy dashboard treatment.
- Tightened the shared visual language across the homepage, Pro page, guide pages, and support pages so the public surface feels more consistent and serious.

## 0.1.11 - 2026-03-08
- Tightened the public homepage and GitHub docs so the product reads more like a practical developer tool and less like a careful product brief.
- Simplified the root README install matrix and the extension/CLI package READMEs.
- Shortened the extension UI copy across onboarding, progress messages, empty states, verdicts, and sidebar headings.

## 0.1.10 - 2026-03-08
- Rewrote the public repo and website copy so the install flow, scope, privacy stance, and commercial pages read more clearly and consistently.
- Rewrote the npm package READMEs so the CLI and core package surfaces match the main product voice and install truth.
- Refined the VS Code extension microcopy across onboarding, progress states, results, license prompts, and the overview sidebar.

## 0.1.9 - 2026-03-08
- Removed the Pro gate from local suppression files so Lite users can calibrate noisy findings without paying first.
- Recalibrated ephemeral launcher findings to distinguish unpinned quickstart-style launchers from exact-version pinned launchers.
- Tightened the public promise around static MCP setup and workflow review instead of overselling dynamic server inspection.
- Added a canonical install matrix plus clearer support, terms, and refund surfaces across the repo and website.
- Moved the published guide content onto `mcppreflight.com` so the domain can carry more of the trust and SEO surface directly.

## 0.1.8 - 2026-03-08
- Added a dedicated MCP Preflight activity-bar sidebar so the extension has a visible, branded surface in VS Code and Cursor.
- Added a richer Lite or Pro overview with visible trust cues, local activity, quick actions, and a one-time onboarding prompt.
- Made the sidebar the default surface from the status bar and post-scan prompts while keeping the wider overview panel available.

## 0.1.7 - 2026-03-08
- Removed the extension `galleryBanner` metadata so dark marketplace surfaces stop framing the transparent logo with the old banner treatment.

## 0.1.6 - 2026-03-08
- Removed the dark outer field from the MCP Preflight logo and promoted the circle-only mark across the extension and public site.

## 0.1.5 - 2026-03-08
- Promoted the new blue trust-first braces logo to the main MCP Preflight mark across the VS Code extension and public website.
- Replaced the site favicon and header badge so the public web surface matches the extension identity.

## 0.1.4 - 2026-03-08
- Replaced the malformed extension icon with a cleaner marketplace-ready mark that stays legible at small sizes.

## 0.1.3 - 2026-03-08
- Added a VS Code overview panel that puts the latest scan, local activity, license state, and upgrade/review/help actions in one editor surface.
- Changed the VS Code status item to open the overview instead of only triggering another scan.
- Added a bundled quickstart workspace so first-time users can see real MCP findings before scanning their own repo.
- Added a `npm run quickstart` path and simplified the public install instructions around the fastest first scan.
- Added a non-failing local scan option so demo and exploratory scans can print findings without looking like a broken command.
- Added a public Pro activation guide so buyers can see the local install, status, and reissue flow in one place.
- Added CLI `license guide` output and clearer Pro-gated messages that point to activation help instead of only checkout.
- Added the public `mcppreflight.com` trust/docs site and switched public homepage links to the canonical domain.

## 0.1.2 - 2026-03-08
- Added a local-only activity log with CLI and VS Code surfaces to inspect scan counts, blocked Pro features, and local license actions without a hosted backend.
- Added CLI `activity`, `upgrade`, `review`, and `support` commands plus matching VS Code commands for review/help/upgrade flows.
- Added a clearer public privacy note around local activity logging and opt-out controls.

## 0.1.1 - 2026-03-07
- Added local MCP Preflight Pro license install and status flows for the CLI and VS Code extension.
- Added gated Pro workflow surfaces for Markdown/HTML/SARIF reports, suppression files, CI mode, Git hooks, and policy presets.
- Added scan notices so Lite users can see when a local suppression file was intentionally ignored.
- Added broader MCP config discovery, focused scans, and tighter false-positive control for Lite.
- Added the first public preflight note to support the weekly acquisition content loop.
- Added the live Stripe checkout path for MCP Preflight Pro and wired the product surfaces to the real purchase URL.

## 0.1.0 - 2026-03-07
- Initial public release of MCP Preflight.
- Local-first scanner for MCP configs, prompts, repo manifests, and obvious secret locations.
- CLI outputs for text, JSON, Markdown, HTML, and SARIF.
- VS Code extension alpha with workspace scan, file-focused scan, Problems integration, and fix recipes.
- Suppression support via `.mcp-preflight-ignore.json`.
- MCP-specific checks for unsafe launchers, token passthrough, sensitive remote targets, credential-bearing URLs, scope risks, and config integrity issues.
