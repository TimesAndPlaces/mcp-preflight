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
  const rawFindings = runAllRules(workspace);
  const loadedSuppressions = await loadSuppressions(workspace.workspacePath, options);
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
    suppressionFilePath: loadedSuppressions.filePath
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
