import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  evaluatePolicy,
  formatLicenseStatus,
  formatReportAsHtml,
  formatReportAsJson,
  formatReportAsMarkdown,
  formatReportAsSarif,
  formatReportAsText,
  getProFeatureMessage,
  hasProFeature,
  installLicenseToken,
  listPolicyPresets,
  removeInstalledLicense,
  resolveLicense,
  scanWorkspace,
  type PolicyEvaluation,
  type PolicyPreset,
  type ResolvedLicense,
  type ScanOptions,
  type ScanReport
} from "@mcp-preflight/core";

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
    case "ci":
      await runCiCommand(args.slice(1));
      return;
    case "hooks":
      await runHooksCommand(args.slice(1));
      return;
    case "policy":
      await runPolicyCommand(args.slice(1));
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
    assertProFeature(license, "reports");
  }

  if (config.scanOptions.suppressionsFilePath || config.scanOptions.includeSuppressedFindings) {
    assertProFeature(license, "suppressions");
  }

  const report = await scanWorkspace(config.workspacePath, config.scanOptions);
  const output = renderReport(report, config.format);

  if (config.outputPath) {
    await writeOutputFile(config.outputPath, output);
    process.stdout.write(`Wrote ${config.format} report to ${config.outputPath}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  process.exitCode = report.summary.errors > 0 ? 1 : 0;
}

async function runLicenseCommand(args: string[]): Promise<void> {
  const [subcommand = "status"] = args;

  switch (subcommand) {
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

async function runCiCommand(args: string[]): Promise<void> {
  const config = parseCiArguments(args);

  if (config.help) {
    printCiUsage();
    return;
  }

  const license = await resolveLicense(config.scanOptions);
  assertProFeature(license, "ci");

  if (config.policy !== "balanced") {
    assertProFeature(license, "policy-presets");
  }

  if (config.scanOptions.suppressionsFilePath || config.scanOptions.includeSuppressedFindings) {
    assertProFeature(license, "suppressions");
  }

  const report = await scanWorkspace(config.workspacePath, config.scanOptions);
  const evaluation = evaluatePolicy(report, config.policy);
  const output = renderCiOutput(report, evaluation, config.format);

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

  const license = await installLicenseToken(token, {
    licenseFilePath
  });

  process.stdout.write(`${formatLicenseStatus(license)}\n`);
  if (license.installPath) {
    process.stdout.write(`Installed at: ${license.installPath}\n`);
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

  process.stdout.write(`Removed local license file at ${removedPath}\n`);
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

  assertProFeature(license, "hooks");

  if (policy !== "balanced") {
    assertProFeature(license, "policy-presets");
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
  format: Format;
  outputPath?: string;
  workspacePath: string;
  scanOptions: Partial<ScanOptions>;
} {
  let help = false;
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

function assertProFeature(license: ResolvedLicense, feature: Parameters<typeof getProFeatureMessage>[0]): void {
  const message = getProFeatureMessage(feature, license);

  if (!hasProFeature(license, feature)) {
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

function printGlobalUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight scan [path] [options]",
      "  mcp-preflight license <status|install|remove> [options]",
      "  mcp-preflight ci [path] [options]",
      "  mcp-preflight hooks install [path] [options]",
      "  mcp-preflight policy list",
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
      "  mcp-preflight license status [--license-file path]",
      "  mcp-preflight license install --token token [--license-file path]",
      "  mcp-preflight license install --from-file path [--license-file path]",
      "  mcp-preflight license remove [--license-file path]"
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

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mcp-preflight: ${message}\n`);
  process.exitCode = 1;
});
