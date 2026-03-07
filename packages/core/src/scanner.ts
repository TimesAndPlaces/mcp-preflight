import { access } from "node:fs/promises";
import path from "node:path";

import { hasProFeature, resolveLicense } from "./license";
import { runAllRules } from "./rules";
import type { ScanOptions, ScanReport, ScanSummary, Verdict } from "./types";
import { applySuppressions, loadSuppressions } from "./suppressions";
import { loadWorkspace } from "./workspace";

const DEFAULT_OPTIONS: ScanOptions = {
  maxFileSizeBytes: 256_000,
  maxFiles: 500,
  useSuppressions: true,
  includeSuppressedFindings: false,
  suppressionsFileName: ".mcp-preflight-ignore.json"
};

export async function scanWorkspace(
  workspacePath: string,
  partialOptions: Partial<ScanOptions> = {}
): Promise<ScanReport> {
  const options = { ...DEFAULT_OPTIONS, ...partialOptions };
  const workspace = await loadWorkspace(workspacePath, options);
  const license = await resolveLicense(options);
  const rawFindings = runAllRules(workspace);
  const notices: ScanReport["notices"] = [];
  const suppressionsEnabled = options.useSuppressions && hasProFeature(license, "suppressions");
  const suppressionFilePath = resolveSuppressionFilePath(workspace.workspacePath, options);
  const loadedSuppressions = suppressionsEnabled
    ? await loadSuppressions(workspace.workspacePath, options)
    : {
        suppressions: [],
        diagnosticFindings: []
      };

  if (!suppressionsEnabled && options.useSuppressions && (await shouldShowSuppressionNotice(options, suppressionFilePath))) {
    notices.push({
      code: "pro-suppressions-required",
      severity: "info",
      message:
        license.status === "missing"
          ? "Lite mode ignored local suppression rules because suppression files are a Pro feature."
          : "The local Pro license could not unlock suppression files, so suppression rules were ignored.",
      suggestion: "Install a valid MCP Preflight Pro license to apply suppression files locally."
    });
  }

  const { findings: unsuppressedFindings, suppressedFindings } = applySuppressions(
    rawFindings,
    loadedSuppressions,
    options.includeSuppressedFindings
  );
  const findings = [...unsuppressedFindings, ...loadedSuppressions.diagnosticFindings];
  const summary: ScanSummary = {
    filesScanned: workspace.files.length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    suppressed: suppressedFindings.length
  };

  return {
    productName: "MCP Preflight",
    workspacePath: workspace.workspacePath,
    generatedAt: new Date().toISOString(),
    verdict: deriveVerdict(summary),
    summary,
    findings,
    suppressedFindings,
    suppressionFilePath: suppressionsEnabled ? loadedSuppressions.filePath : undefined,
    notices
  };
}

function deriveVerdict(summary: ScanSummary): Verdict {
  if (summary.errors > 0) {
    return "fail";
  }

  if (summary.warnings > 0 || summary.info > 0) {
    return "warning";
  }

  return "pass";
}

function resolveSuppressionFilePath(
  workspacePath: string,
  options: Pick<ScanOptions, "suppressionsFileName" | "suppressionsFilePath">
): string {
  return options.suppressionsFilePath
    ? path.resolve(options.suppressionsFilePath)
    : path.join(workspacePath, options.suppressionsFileName);
}

async function shouldShowSuppressionNotice(
  options: Pick<ScanOptions, "includeSuppressedFindings" | "suppressionsFilePath">,
  suppressionFilePath: string
): Promise<boolean> {
  if (options.includeSuppressedFindings || options.suppressionsFilePath) {
    return true;
  }

  try {
    await access(suppressionFilePath);
    return true;
  } catch {
    return false;
  }
}
