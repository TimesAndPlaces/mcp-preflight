import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  formatReportAsHtml,
  formatReportAsJson,
  formatReportAsMarkdown,
  formatReportAsSarif,
  formatReportAsText,
  scanWorkspace
} from "@mcp-preflight/core";

type Format = "text" | "json" | "markdown" | "sarif" | "html";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  let command = "scan";
  let format: Format = "text";
  let workspacePath = process.cwd();
  let outputPath: string | undefined;
  const scanOptions: Parameters<typeof scanWorkspace>[1] = {};

  if (args[0] && !args[0].startsWith("-")) {
    command = args.shift() ?? "scan";
  }

  if (command !== "scan") {
    throw new Error(`Unknown command: ${command}`);
  }

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
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
      const next = args.shift();

      if (
        next !== "text" &&
        next !== "json" &&
        next !== "markdown" &&
        next !== "sarif" &&
        next !== "html"
      ) {
        throw new Error("Expected `text`, `json`, `markdown`, `sarif`, or `html` after --format.");
      }

      format = next;
      continue;
    }

    if (current === "--output") {
      const next = args.shift();

      if (!next) {
        throw new Error("Expected a file path after --output.");
      }

      outputPath = path.resolve(next);
      continue;
    }

    if (current === "--suppressions-file") {
      const next = args.shift();

      if (!next) {
        throw new Error("Expected a file path after --suppressions-file.");
      }

      scanOptions.suppressionsFilePath = path.resolve(next);
      continue;
    }

    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }

    workspacePath = path.resolve(current);
  }

  const report = await scanWorkspace(workspacePath, scanOptions);
  const output = renderReport(report, format);

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    process.stdout.write(`Wrote ${format} report to ${outputPath}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  process.exitCode = report.summary.errors > 0 ? 1 : 0;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  mcp-preflight scan [path] [--format text|json|markdown|sarif|html]",
      "  mcp-preflight scan [path] [--output report.out]",
      "  mcp-preflight scan [path] [--suppressions-file path]",
      "  mcp-preflight scan [path] [--no-suppressions]",
      "  mcp-preflight scan [path] [--include-suppressed]",
      "  mcp-preflight scan [path] --json"
    ].join("\n")
  );
  process.stdout.write("\n");
}

function renderReport(report: Awaited<ReturnType<typeof scanWorkspace>>, format: Format): string {
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

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mcp-preflight: ${message}\n`);
  process.exitCode = 1;
});
