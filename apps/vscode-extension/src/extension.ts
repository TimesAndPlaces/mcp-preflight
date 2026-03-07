import * as vscode from "vscode";

import type { Finding, ResolvedLicense, ScanReport } from "@mcp-preflight/core";
import { formatLicenseStatus, installLicenseToken, resolveLicense, scanWorkspace } from "@mcp-preflight/core";

let latestReport: ScanReport | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("mcp-preflight");
  const output = vscode.window.createOutputChannel("MCP Preflight");
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  statusBar.name = "MCP Preflight";
  statusBar.command = "mcpPreflight.scanWorkspace";
  updateStatusBar(statusBar);
  statusBar.show();

  context.subscriptions.push(diagnostics, output, statusBar);
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpPreflight.scanWorkspace", async () => {
      await runWorkspaceScan(diagnostics, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.scanCurrentFile", async () => {
      await runCurrentFileScan(diagnostics, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.showFixRecipes", async () => {
      showFixRecipes();
    }),
    vscode.commands.registerCommand("mcpPreflight.installLicense", async () => {
      await promptForLicenseInstall(output);
    }),
    vscode.commands.registerCommand("mcpPreflight.showLicenseStatus", async () => {
      await showLicenseStatus(output);
    })
  );
}

export function deactivate(): void {}

async function runWorkspaceScan(
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const folder = getActiveWorkspaceFolder();

  if (!folder) {
    void vscode.window.showErrorMessage("MCP Preflight needs an open workspace folder to scan.");
    return;
  }

  const startedAt = Date.now();
  const report = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "MCP Preflight is scanning the workspace"
    },
    () => scanWorkspace(folder.uri.fsPath)
  );
  latestReport = report;
  publishDiagnostics(report, diagnostics);
  renderOutput(report, output);
  updateStatusBar(statusBar, report);
  const elapsedMs = Date.now() - startedAt;

  void vscode.window.showInformationMessage(
    `MCP Preflight scanned ${report.summary.filesScanned} files in ${formatDuration(elapsedMs)}: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.suppressed} suppressed.`
  );
}

async function runCurrentFileScan(
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const folder = editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : getActiveWorkspaceFolder();

  if (!editor || !folder) {
    void vscode.window.showErrorMessage("Open a file inside a workspace folder to run a file-focused scan.");
    return;
  }

  const startedAt = Date.now();
  const report = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "MCP Preflight is scanning the current file"
    },
    () =>
      scanWorkspace(folder.uri.fsPath, {
        focusFilePaths: [editor.document.uri.fsPath]
      })
  );
  latestReport = report;
  publishDiagnostics(report, diagnostics, editor.document.uri.fsPath);
  renderOutput(report, output, editor.document.uri.fsPath);
  updateStatusBar(statusBar, report);
  const elapsedMs = Date.now() - startedAt;

  const fileFindings = report.findings.filter(
    (finding) => finding.location?.filePath === editor.document.uri.fsPath
  );

  void vscode.window.showInformationMessage(
    `MCP Preflight found ${fileFindings.length} findings for ${editor.document.fileName.split(/[\\/]/).at(-1)} in ${formatDuration(elapsedMs)}.`
  );
}

function publishDiagnostics(
  report: ScanReport,
  diagnostics: vscode.DiagnosticCollection,
  onlyFilePath?: string
): void {
  diagnostics.clear();
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const finding of report.findings) {
    if (!finding.location) {
      continue;
    }

    if (onlyFilePath && finding.location.filePath !== onlyFilePath) {
      continue;
    }

    const range = new vscode.Range(
      Math.max(0, finding.location.line - 1),
      Math.max(0, finding.location.column - 1),
      Math.max(0, finding.location.line - 1),
      Math.max(1, finding.location.column + getHighlightLength(finding))
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `${finding.title} (${finding.ruleId})\n${finding.suggestion}`,
      toDiagnosticSeverity(finding)
    );
    diagnostic.source = "MCP Preflight";
    diagnostic.code = finding.ruleId;

    const existing = byFile.get(finding.location.filePath) ?? [];
    existing.push(diagnostic);
    byFile.set(finding.location.filePath, existing);
  }

  for (const [filePath, fileDiagnostics] of byFile) {
    diagnostics.set(vscode.Uri.file(filePath), fileDiagnostics);
  }
}

function renderOutput(report: ScanReport, output: vscode.OutputChannel, onlyFilePath?: string): void {
  output.clear();
  output.appendLine(`MCP Preflight verdict: ${report.verdict.toUpperCase()}`);
  output.appendLine(`Workspace: ${report.workspacePath}`);
  if (onlyFilePath) {
    output.appendLine(`Focused file: ${vscode.workspace.asRelativePath(onlyFilePath, false)}`);
  }
  output.appendLine(
    `Files scanned: ${report.summary.filesScanned} | Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info} | Suppressed: ${report.summary.suppressed}`
  );
  if (report.suppressionFilePath) {
    output.appendLine(`Suppressions file: ${report.suppressionFilePath}`);
  }
  if (report.notices.length > 0) {
    output.appendLine("Notices:");
    for (const notice of report.notices) {
      output.appendLine(`- ${notice.message}`);
      if (notice.suggestion) {
        output.appendLine(`  ${notice.suggestion}`);
      }
    }
  }
  output.appendLine("");

  const findings = onlyFilePath
    ? report.findings.filter((finding) => finding.location?.filePath === onlyFilePath)
    : report.findings;

  if (findings.length === 0) {
    output.appendLine(onlyFilePath ? "No findings for the current file." : "No findings.");
  }

  for (const finding of findings) {
    output.appendLine(formatFindingLine(finding));
  }

  output.show(true);
}

function showFixRecipes(): void {
  const panel = vscode.window.createWebviewPanel(
    "mcpPreflightFixRecipes",
    "MCP Preflight Fix Recipes",
    vscode.ViewColumn.Beside,
    {}
  );

  panel.webview.html = renderFixRecipeHtml(latestReport);
}

async function promptForLicenseInstall(output: vscode.OutputChannel): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: "Paste your MCP Preflight Pro license token.",
    placeHolder: "eyJwcm9kdWN0Ijoi...signature",
    ignoreFocusOut: true,
    password: true
  });

  if (!token) {
    return;
  }

  try {
    const license = await installLicenseToken(token);
    output.appendLine(formatLicenseDetails(license));
    output.show(true);
    void vscode.window.showInformationMessage("MCP Preflight Pro was activated on this machine.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MCP Preflight could not install the license: ${message}`);
  }
}

async function showLicenseStatus(output: vscode.OutputChannel): Promise<void> {
  const license = await resolveLicense();
  output.appendLine(formatLicenseDetails(license));
  output.show(true);
  void vscode.window.showInformationMessage(
    license.status === "valid" ? "MCP Preflight Pro is active." : "MCP Preflight is running in Lite mode."
  );
}

function renderFixRecipeHtml(report: ScanReport | undefined): string {
  if (!report) {
    return `
      <html>
        <body>
          <h2>No scan results yet</h2>
          <p>Run "MCP Preflight: Scan Workspace" first.</p>
        </body>
      </html>
    `;
  }

  const items = report.findings
    .map((finding) => {
      const location = finding.location
        ? `${finding.location.relativePath}:${finding.location.line}`
        : "workspace";
      return `
        <article style="margin-bottom:16px;padding:12px;border:1px solid #ddd;border-radius:8px;">
          <h3 style="margin:0 0 8px 0;">${escapeHtml(finding.title)}</h3>
          <p style="margin:0 0 8px 0;"><strong>${escapeHtml(location)}</strong></p>
          <p style="margin:0 0 8px 0;">${escapeHtml(finding.description)}</p>
          <p style="margin:0;"><strong>Fix:</strong> ${escapeHtml(finding.suggestion)}</p>
        </article>
      `;
    })
    .join("");

  return `
    <html>
      <body style="font-family: sans-serif; padding: 16px;">
        <h1>MCP Preflight Fix Recipes</h1>
        <p>${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info, ${report.summary.suppressed} suppressed.</p>
        ${items || "<p>No findings.</p>"}
      </body>
    </html>
  `;
}

function formatFindingLine(finding: Finding): string {
  const location = finding.location
    ? `${finding.location.relativePath}:${finding.location.line}:${finding.location.column}`
    : "workspace";
  return `[${finding.severity.toUpperCase()}] ${location} ${finding.title} (${finding.fingerprint}) -> ${finding.suggestion}`;
}

function toDiagnosticSeverity(finding: Finding): vscode.DiagnosticSeverity {
  switch (finding.severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) {
    return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
  }

  return vscode.workspace.workspaceFolders?.[0];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getHighlightLength(finding: Finding): number {
  if (!finding.evidence) {
    return 1;
  }

  return Math.max(1, Math.min(80, finding.evidence.length));
}

function formatDuration(durationMs: number): string {
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(1)}s`;
}

function updateStatusBar(statusBar: vscode.StatusBarItem, report?: ScanReport): void {
  if (!report) {
    statusBar.text = "$(shield) MCP Preflight";
    statusBar.tooltip = "Run MCP Preflight workspace scan";
    statusBar.backgroundColor = undefined;
    return;
  }

  const totalFindings = report.summary.errors + report.summary.warnings + report.summary.info;
  const verdictLabel = report.verdict === "fail" ? "Fail" : report.verdict === "warning" ? "Warn" : "Pass";

  statusBar.text = `$(shield) MCP ${verdictLabel} ${report.summary.errors}/${report.summary.warnings}/${report.summary.info}`;
  statusBar.tooltip = [
    "MCP Preflight latest scan",
    `Verdict: ${report.verdict.toUpperCase()}`,
    `Files scanned: ${report.summary.filesScanned}`,
    `Findings: ${totalFindings}`,
    `Suppressed: ${report.summary.suppressed}`,
    "",
    "Click to rescan the workspace."
  ].join("\n");
  statusBar.backgroundColor =
    report.verdict === "fail"
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : report.verdict === "warning"
        ? new vscode.ThemeColor("statusBarItem.warningBackground")
        : undefined;
}

function formatLicenseDetails(license: ResolvedLicense): string {
  const lines = [formatLicenseStatus(license)];

  if (license.source) {
    lines.push(`Source: ${license.source}`);
  }

  if (license.installPath) {
    lines.push(`Path: ${license.installPath}`);
  }

  return lines.join("\n");
}
