#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  exportActivitySnapshot,
  formatActivitySummary,
  getActivitySummary,
  evaluatePolicy,
  formatLicenseStatus,
  formatProLicenseGuide,
  formatReportAsHtml,
  formatReportAsJson,
  formatReportAsMarkdown,
  formatReportAsSarif,
  formatReportAsText,
  getProFeatureMessage,
  hasProFeature,
  installLicenseToken,
  listPolicyPresets,
  PRODUCT_URLS,
  recordActivity,
  removeInstalledLicense,
  resetActivityLog,
  resolveLicense,
  scanWorkspace,
  type PolicyEvaluation,
  type PolicyPreset,
  type ResolvedLicense,
  type ScanOptions,
  type ScanReport
} from "mcp-preflight-core";

type Format = "text" | "json" | "markdown" | "sarif" | "html";
type CiFormat = "text" | "json";
type HookName = "pre-commit" | "pre-push";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command = "scan"] = args;

  if ((command === "--help" || command === "-h") && args.length === 1) {
    printGlobalUsage();
    return;
  }

  switch (command) {
    case "scan":
      await runScanCommand(command === "scan" ? args.slice(1) : args);
      return;
    case "license":
      await runLicenseCommand(args.slice(1));
      return;
    case "activity":
      await runActivityCommand(args.slice(1));
      return;
    case "ci":
      await runCiCommand(args.slice(1));
      return;
    case "hooks":
      await runHooksCommand(args.slice(1));
      return;
    case "policy":
      await runPolicyCommand(args.slice(1));
      return;
    case "upgrade":
      await openProductSurface("upgrade", PRODUCT_URLS.upgrade);
      return;
    case "review":
      await runReviewCommand(args.slice(1));
      return;
    case "support":
      await runSupportCommand(args.slice(1));
      return;
    default:
      if (command.startsWith("-")) {
        await runScanCommand(args);
        return;
      }

      await runScanCommand(args);
  }
}

async function runScanCommand(args: string[]): Promise<void> {
  const config = parseScanArguments(args);

  if (config.help) {
    printScanUsage();
    return;
  }

  const license = await resolveLicense(config.scanOptions);

  if (requiresProReports(config.format)) {
    await assertProFeature(license, "reports");
  }

  const startedAt = Date.now();
  const report = await scanWorkspace(config.workspacePath, config.scanOptions);
  const output = renderReport(report, config.format);
  await recordActivity({
    type: "scan-completed",
    surface: "cli",
    scanMode: "workspace",
    verdict: report.verdict,
    durationMs: Date.now() - startedAt,
    filesScanned: report.summary.filesScanned,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    info: report.summary.info,
    suppressed: report.summary.suppressed,
    licenseStatus: license.status
  });

  if (config.outputPath) {
    await writeOutputFile(config.outputPath, output);
    process.stdout.write(`Wrote ${config.format} report to ${config.outputPath}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  process.exitCode = config.failOnFindings && report.summary.errors > 0 ? 1 : 0;
}

async function runLicenseCommand(args: string[]): Promise<void> {
  const [subcommand = "status"] = args;

  switch (subcommand) {
    case "guide":
      showLicenseGuide();
      return;
    case "status":
      await showLicenseStatus(args.slice(1));
      return;
    case "install":
      await installLicense(args.slice(1));
      return;
    case "remove":
      await removeLicense(args.slice(1));
      return;
    case "--help":
    case "-h":
      printLicenseUsage();
      return;
    default:
      throw new Error(`Unknown license command: ${subcommand}`);
  }
}

async function runActivityCommand(args: string[]): Promise<void> {
  const [subcommand = "status"] = args;

  switch (subcommand) {
    case "status":
      await showActivityStatus(args.slice(1));
      return;
    case "export":
      await exportActivity(args.slice(1));
      return;
    case "reset":
      await resetActivity(args.slice(1));
      return;
    case "--help":
    case "-h":
      printActivityUsage();
      return;
    default:
      throw new Error(`Unknown activity command: ${subcommand}`);
  }
}

async function runCiCommand(args: string[]): Promise<void> {
  const config = parseCiArguments(args);

  if (config.help) {
    printCiUsage();
    return;
  }

  const license = await resolveLicense(config.scanOptions);
  await assertProFeature(license, "ci");

  if (config.policy !== "balanced") {
    await assertProFeature(license, "policy-presets");
  }

  const startedAt = Date.now();
  const report = await scanWorkspace(config.workspacePath, config.scanOptions);
  const evaluation = evaluatePolicy(report, config.policy);
  const output = renderCiOutput(report, evaluation, config.format);
  await recordActivity({
    type: "scan-completed",
    surface: "cli",
    scanMode: "ci",
    verdict: report.verdict,
    durationMs: Date.now() - startedAt,
    filesScanned: report.summary.filesScanned,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    info: report.summary.info,
    suppressed: report.summary.suppressed,
    licenseStatus: license.status
  });

  if (config.outputPath) {
    await writeOutputFile(config.outputPath, output);
    process.stdout.write(`Wrote ${config.format} CI result to ${config.outputPath}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  process.exitCode = evaluation.passed ? 0 : 1;
}

async function runHooksCommand(args: string[]): Promise<void> {
  const [subcommand = "install"] = args;

  switch (subcommand) {
    case "install":
      await installHook(args.slice(1));
      return;
    case "--help":
    case "-h":
      printHooksUsage();
      return;
    default:
      throw new Error(`Unknown hooks command: ${subcommand}`);
  }
}

async function runReviewCommand(args: string[]): Promise<void> {
  let destination: "marketplace" | "openvsx" = "marketplace";

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printReviewUsage();
      return;
    }

    if (current === "--channel") {
      const next = requireValue(args.shift(), "Expected `marketplace` or `openvsx` after --channel.");
      if (next === "openvsx") {
        destination = "openvsx";
        continue;
      }

      if (next === "marketplace") {
        destination = "marketplace";
        continue;
      }

      throw new Error("Expected `marketplace` or `openvsx` after --channel.");
    }

    throw new Error(`Unknown option: ${current}`);
  }

  await openProductSurface(
    destination,
    destination === "openvsx" ? PRODUCT_URLS.openvsx : PRODUCT_URLS.marketplace,
    "review-opened"
  );
}

async function runSupportCommand(args: string[]): Promise<void> {
  let destination: "discussions" | "issues" = "discussions";

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printSupportUsage();
      return;
    }

    if (current === "--channel") {
      const next = requireValue(args.shift(), "Expected `discussions` or `issues` after --channel.");
      if (next === "issues") {
        destination = "issues";
        continue;
      }

      if (next === "discussions") {
        destination = "discussions";
        continue;
      }

      throw new Error("Expected `discussions` or `issues` after --channel.");
    }

    throw new Error(`Unknown option: ${current}`);
  }

  await openProductSurface(
    destination,
    destination === "issues" ? PRODUCT_URLS.issues : PRODUCT_URLS.discussions,
    "support-opened"
  );
}

async function runPolicyCommand(args: string[]): Promise<void> {
  const [subcommand = "list"] = args;

  switch (subcommand) {
    case "list":
      if (args.slice(1).some((argument) => argument === "--help" || argument === "-h")) {
        printPolicyUsage();
        return;
      }

      for (const policy of listPolicyPresets()) {
        process.stdout.write(`${policy.name}: ${policy.description}\n`);
      }

      return;
    case "--help":
    case "-h":
      printPolicyUsage();
      return;
    default:
      throw new Error(`Unknown policy command: ${subcommand}`);
  }
}

async function showLicenseStatus(args: string[]): Promise<void> {
  const { licenseFilePath, help } = parseLicensePathArguments(args);

  if (help) {
    printLicenseUsage();
    return;
  }

  const license = await resolveLicense({ licenseFilePath });
  await recordActivity({
    type: "license-status-checked",
    surface: "cli",
    licenseStatus: license.status
  });
  const lines = [formatLicenseStatus(license)];

  if (license.source) {
    lines.push(`Source: ${license.source}`);
  }

  if (license.installPath) {
    lines.push(`Path: ${license.installPath}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function installLicense(args: string[]): Promise<void> {
  let token: string | undefined;
  let tokenFilePath: string | undefined;
  let licenseFilePath: string | undefined;

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printLicenseUsage();
      return;
    }

    if (current === "--token") {
      token = requireValue(args.shift(), "Expected a token after --token.");
      continue;
    }

    if (current === "--from-file") {
      tokenFilePath = path.resolve(requireValue(args.shift(), "Expected a file path after --from-file."));
      continue;
    }

    if (current === "--license-file") {
      licenseFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --license-file.")
      );
      continue;
    }

    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }

    token ??= current;
  }

  if (!token && tokenFilePath) {
    token = (await readFile(tokenFilePath, "utf8")).trim();
  }

  if (!token) {
    throw new Error("Provide a license token with --token, --from-file, or a positional token value.");
  }

  try {
    const license = await installLicenseToken(token, {
      licenseFilePath
    });
    await recordActivity({
      type: "license-installed",
      surface: "cli",
      licenseStatus: license.status
    });

    process.stdout.write(`${formatLicenseStatus(license)}\n`);
    if (license.installPath) {
      process.stdout.write(`Installed at: ${license.installPath}\n`);
    }
  } catch (error) {
    await recordActivity({
      type: "license-install-failed",
      surface: "cli",
      licenseStatus: "invalid"
    });
    throw error;
  }
}

async function removeLicense(args: string[]): Promise<void> {
  const { licenseFilePath, help } = parseLicensePathArguments(args);

  if (help) {
    printLicenseUsage();
    return;
  }

  const removedPath = await removeInstalledLicense({ licenseFilePath });

  if (!removedPath) {
    process.stdout.write("No local MCP Preflight Pro license file was found.\n");
    return;
  }

  await recordActivity({
    type: "license-removed",
    surface: "cli",
    licenseStatus: "missing"
  });
  process.stdout.write(`Removed local license file at ${removedPath}\n`);
}

function showLicenseGuide(): void {
  process.stdout.write(`${formatProLicenseGuide()}\n`);
}

async function showActivityStatus(args: string[]): Promise<void> {
  const { activityFilePath, help } = parseActivityPathArguments(args);

  if (help) {
    printActivityUsage();
    return;
  }

  const summary = await getActivitySummary(activityFilePath);
  process.stdout.write(`${formatActivitySummary(summary)}\n`);
}

async function exportActivity(args: string[]): Promise<void> {
  let format: "text" | "json" = "json";
  let outputPath: string | undefined;
  let activityFilePath: string | undefined;

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printActivityUsage();
      return;
    }

    if (current === "--format") {
      const next = requireValue(args.shift(), "Expected `text` or `json` after --format.");
      if (next !== "text" && next !== "json") {
        throw new Error("Expected `text` or `json` after --format.");
      }

      format = next;
      continue;
    }

    if (current === "--output") {
      outputPath = path.resolve(requireValue(args.shift(), "Expected a file path after --output."));
      continue;
    }

    if (current === "--activity-file") {
      activityFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --activity-file.")
      );
      continue;
    }

    throw new Error(`Unknown option: ${current}`);
  }

  const snapshot = await exportActivitySnapshot(activityFilePath);
  const output =
    format === "json"
      ? JSON.stringify(snapshot, null, 2)
      : formatActivitySummary(snapshot.summary);

  if (outputPath) {
    await writeOutputFile(outputPath, output);
    process.stdout.write(`Wrote ${format} activity export to ${outputPath}\n`);
    return;
  }

  process.stdout.write(`${output}\n`);
}

async function resetActivity(args: string[]): Promise<void> {
  const { activityFilePath, help } = parseActivityPathArguments(args);

  if (help) {
    printActivityUsage();
    return;
  }

  const removed = await resetActivityLog(activityFilePath);

  if (!removed) {
    process.stdout.write("No local activity log was found.\n");
    return;
  }

  process.stdout.write("Reset the local activity log.\n");
}

async function installHook(args: string[]): Promise<void> {
  let hookName: HookName = "pre-push";
  let policy: PolicyPreset = "balanced";
  let targetPath = process.cwd();
  let licenseFilePath: string | undefined;
  let licenseToken: string | undefined;

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printHooksUsage();
      return;
    }

    if (current === "--hook") {
      const next = requireValue(args.shift(), "Expected `pre-commit` or `pre-push` after --hook.");

      if (next !== "pre-commit" && next !== "pre-push") {
        throw new Error("Expected `pre-commit` or `pre-push` after --hook.");
      }

      hookName = next;
      continue;
    }

    if (current === "--policy") {
      policy = parsePolicyPreset(requireValue(args.shift(), "Expected `balanced` or `strict` after --policy."));
      continue;
    }

    if (current === "--license-file") {
      licenseFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --license-file.")
      );
      continue;
    }

    if (current === "--license-token") {
      licenseToken = requireValue(args.shift(), "Expected a token after --license-token.");
      continue;
    }

    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }

    targetPath = path.resolve(current);
  }

  const license = await resolveLicense({
    licenseFilePath,
    licenseToken
  });

  await assertProFeature(license, "hooks");

  if (policy !== "balanced") {
    await assertProFeature(license, "policy-presets");
  }

  const repoRoot = getGitRepoRoot(targetPath);

  if (!repoRoot) {
    throw new Error("Git hook installation needs a Git repository. Run it inside a repo or pass a repo path.");
  }

  const hookPath = path.join(repoRoot, ".git", "hooks", hookName);
  const hookScript = [
    "#!/bin/sh",
    "# Generated by MCP Preflight",
    "",
    `npx mcp-preflight ci --policy ${policy}`
  ].join("\n");

  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `${hookScript}\n`, "utf8");
  await chmod(hookPath, 0o755);

  process.stdout.write(`Installed ${hookName} hook at ${hookPath}\n`);
}

function parseScanArguments(args: string[]): {
  help: boolean;
  failOnFindings: boolean;
  format: Format;
  outputPath?: string;
  workspacePath: string;
  scanOptions: Partial<ScanOptions>;
} {
  let help = false;
  let failOnFindings = true;
  let format: Format = "text";
  let outputPath: string | undefined;
  let workspacePath = process.cwd();
  const scanOptions: Partial<ScanOptions> = {};

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }

    if (current === "--json") {
      format = "json";
      continue;
    }

    if (current === "--no-exit-code") {
      failOnFindings = false;
      continue;
    }

    if (current === "--no-suppressions") {
      scanOptions.useSuppressions = false;
      continue;
    }

    if (current === "--include-suppressed") {
      scanOptions.includeSuppressedFindings = true;
      continue;
    }

    if (current === "--format") {
      format = parseFormat(requireValue(args.shift(), "Expected a format after --format."));
      continue;
    }

    if (current === "--output") {
      outputPath = path.resolve(requireValue(args.shift(), "Expected a file path after --output."));
      continue;
    }

    if (current === "--suppressions-file") {
      scanOptions.suppressionsFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --suppressions-file.")
      );
      continue;
    }

    if (current === "--license-file") {
      scanOptions.licenseFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --license-file.")
      );
      continue;
    }

    if (current === "--license-token") {
      scanOptions.licenseToken = requireValue(args.shift(), "Expected a token after --license-token.");
      continue;
    }

    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }

    workspacePath = path.resolve(current);
  }

  return {
    help,
    failOnFindings,
    format,
    outputPath,
    workspacePath,
    scanOptions
  };
}

function parseCiArguments(args: string[]): {
  help: boolean;
  format: CiFormat;
  outputPath?: string;
  policy: PolicyPreset;
  workspacePath: string;
  scanOptions: Partial<ScanOptions>;
} {
  let help = false;
  let format: CiFormat = "text";
  let outputPath: string | undefined;
  let policy: PolicyPreset = "balanced";
  let workspacePath = process.cwd();
  const scanOptions: Partial<ScanOptions> = {};

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }

    if (current === "--format") {
      format = parseCiFormat(requireValue(args.shift(), "Expected `text` or `json` after --format."));
      continue;
    }

    if (current === "--output") {
      outputPath = path.resolve(requireValue(args.shift(), "Expected a file path after --output."));
      continue;
    }

    if (current === "--policy") {
      policy = parsePolicyPreset(requireValue(args.shift(), "Expected `balanced` or `strict` after --policy."));
      continue;
    }

    if (current === "--no-suppressions") {
      scanOptions.useSuppressions = false;
      continue;
    }

    if (current === "--include-suppressed") {
      scanOptions.includeSuppressedFindings = true;
      continue;
    }

    if (current === "--suppressions-file") {
      scanOptions.suppressionsFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --suppressions-file.")
      );
      continue;
    }

    if (current === "--license-file") {
      scanOptions.licenseFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --license-file.")
      );
      continue;
    }

    if (current === "--license-token") {
      scanOptions.licenseToken = requireValue(args.shift(), "Expected a token after --license-token.");
      continue;
    }

    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }

    workspacePath = path.resolve(current);
  }

  return {
    help,
    format,
    outputPath,
    policy,
    workspacePath,
    scanOptions
  };
}

function parseLicensePathArguments(args: string[]): {
  help: boolean;
  licenseFilePath?: string;
} {
  let help = false;
  let licenseFilePath: string | undefined;

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }

    if (current === "--license-file") {
      licenseFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --license-file.")
      );
      continue;
    }

    throw new Error(`Unknown option: ${current}`);
  }

  return {
    help,
    licenseFilePath
  };
}

function parseActivityPathArguments(args: string[]): {
  help: boolean;
  activityFilePath?: string;
} {
  let help = false;
  let activityFilePath: string | undefined;

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }

    if (current === "--activity-file") {
      activityFilePath = path.resolve(
        requireValue(args.shift(), "Expected a file path after --activity-file.")
      );
      continue;
    }

    throw new Error(`Unknown option: ${current}`);
  }

  return {
    help,
    activityFilePath
  };
}

function renderReport(report: ScanReport, format: Format): string {
  switch (format) {
    case "json":
      return formatReportAsJson(report);
    case "markdown":
      return formatReportAsMarkdown(report);
    case "sarif":
      return formatReportAsSarif(report);
    case "html":
      return formatReportAsHtml(report);
    default:
      return formatReportAsText(report);
  }
}

function renderCiOutput(report: ScanReport, evaluation: PolicyEvaluation, format: CiFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        policy: evaluation,
        report
      },
      null,
      2
    );
  }

  return [
    `MCP Preflight CI verdict: ${evaluation.passed ? "PASS" : "FAIL"}`,
    `Policy: ${evaluation.preset}`,
    `Reason: ${evaluation.message}`,
    "",
    formatReportAsText(report)
  ].join("\n");
}

function requiresProReports(format: Format): boolean {
  return format === "markdown" || format === "sarif" || format === "html";
}

function parseFormat(value: string): Format {
  if (
    value !== "text" &&
    value !== "json" &&
    value !== "markdown" &&
    value !== "sarif" &&
    value !== "html"
  ) {
    throw new Error("Expected `text`, `json`, `markdown`, `sarif`, or `html` after --format.");
  }

  return value;
}

function parseCiFormat(value: string): CiFormat {
  if (value !== "text" && value !== "json") {
    throw new Error("Expected `text` or `json` after --format.");
  }

  return value;
}

function parsePolicyPreset(value: string): PolicyPreset {
  if (value !== "balanced" && value !== "strict") {
    throw new Error("Expected `balanced` or `strict`.");
  }

  return value;
}

async function assertProFeature(
  license: ResolvedLicense,
  feature: Parameters<typeof getProFeatureMessage>[0]
): Promise<void> {
  const message = getProFeatureMessage(feature, license);

  if (!hasProFeature(license, feature)) {
    await recordActivity({
      type: "pro-feature-blocked",
      surface: "cli",
      feature,
      licenseStatus: license.status
    });
    throw new Error(message);
  }
}

function requireValue(value: string | undefined, errorMessage: string): string {
  if (!value) {
    throw new Error(errorMessage);
  }

  return value;
}

async function writeOutputFile(outputPath: string, output: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}

function getGitRepoRoot(targetPath: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: targetPath,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim() || undefined;
}

async function openProductSurface(
  destination: "upgrade" | "marketplace" | "openvsx" | "discussions" | "issues",
  url: string,
  eventType: "upgrade-opened" | "review-opened" | "support-opened" = "upgrade-opened"
): Promise<void> {
  openUrl(url);
  await recordActivity({
    type: eventType,
    surface: "cli",
    destination
  });
  process.stdout.write(`Opened ${url}\n`);
}

function openUrl(url: string): void {
  const platform = process.platform;

  const result =
    platform === "win32"
      ? spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore", windowsHide: true })
      : platform === "darwin"
        ? spawnSync("open", [url], { stdio: "ignore" })
        : spawnSync("xdg-open", [url], { stdio: "ignore" });

  if (result.status !== 0) {
    throw new Error(`Could not open ${url} in the default browser.`);
  }
}

function printGlobalUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight scan [path] [options]",
      "  mcp-preflight license <status|install|remove> [options]",
      "  mcp-preflight activity <status|export|reset> [options]",
      "  mcp-preflight ci [path] [options]",
      "  mcp-preflight hooks install [path] [options]",
      "  mcp-preflight policy list",
      "  mcp-preflight upgrade",
      "  mcp-preflight review [--channel marketplace|openvsx]",
      "  mcp-preflight support [--channel discussions|issues]",
      "",
      "Run `mcp-preflight <command> --help` for command-specific options."
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printScanUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight scan [path] [--format text|json|markdown|sarif|html]",
      "  mcp-preflight scan [path] [--output report.out]",
      "  mcp-preflight scan [path] [--no-exit-code]",
      "  mcp-preflight scan [path] [--suppressions-file path]",
      "  mcp-preflight scan [path] [--no-suppressions]",
      "  mcp-preflight scan [path] [--include-suppressed]",
      "  mcp-preflight scan [path] [--license-file path]",
      "  mcp-preflight scan [path] [--license-token token]",
      "  mcp-preflight scan [path] --json"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printLicenseUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight license guide",
      "  mcp-preflight license status [--license-file path]",
      "  mcp-preflight license install --token token [--license-file path]",
      "  mcp-preflight license install --from-file path [--license-file path]",
      "  mcp-preflight license remove [--license-file path]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printActivityUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight activity status [--activity-file path]",
      "  mcp-preflight activity export [--format text|json] [--output path] [--activity-file path]",
      "  mcp-preflight activity reset [--activity-file path]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printCiUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight ci [path] [--policy balanced|strict]",
      "  mcp-preflight ci [path] [--format text|json]",
      "  mcp-preflight ci [path] [--output ci-report.out]",
      "  mcp-preflight ci [path] [--license-file path]",
      "  mcp-preflight ci [path] [--license-token token]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printHooksUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight hooks install [path] [--hook pre-commit|pre-push]",
      "  mcp-preflight hooks install [path] [--policy balanced|strict]",
      "  mcp-preflight hooks install [path] [--license-file path]",
      "  mcp-preflight hooks install [path] [--license-token token]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printPolicyUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight policy list"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printReviewUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight review [--channel marketplace|openvsx]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function printSupportUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight support [--channel discussions|issues]"
    ].join("\n")
  );
  process.stdout.write("\n");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mcp-preflight: ${message}\n`);
  process.exitCode = 1;
});
