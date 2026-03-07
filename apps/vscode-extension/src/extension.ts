import * as vscode from "vscode";

import type { Finding, ScanReport } from "@mcp-preflight/core";
import { scanWorkspace } from "@mcp-preflight/core";

let latestReport: ScanReport | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("mcp-preflight");
  const output = vscode.window.createOutputChannel("MCP Preflight");

  context.subscriptions.push(diagnostics, output);
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpPreflight.scanWorkspace", async () => {
      await runWorkspaceScan(diagnostics, output);
    }),
    vscode.commands.registerCommand("mcpPreflight.scanCurrentFile", async () => {
      await runCurrentFileScan(diagnostics, output);
    }),
    vscode.commands.registerCommand("mcpPreflight.showFixRecipes", async () => {
      showFixRecipes();
    })
  );
}

export function deactivate(): void {}

async function runWorkspaceScan(
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  const folder = getActiveWorkspaceFolder();

  if (!folder) {
    void vscode.window.showErrorMessage("MCP Preflight needs an open workspace folder to scan.");
    return;
  }

  const report = await scanWorkspace(folder.uri.fsPath);
  latestReport = report;
  publishDiagnostics(report, diagnostics);
  renderOutput(report, output);

  void vscode.window.showInformationMessage(
    `MCP Preflight scanned ${report.summary.filesScanned} files: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.suppressed} suppressed.`
  );
}

async function runCurrentFileScan(
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const folder = editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : getActiveWorkspaceFolder();

  if (!editor || !folder) {
    void vscode.window.showErrorMessage("Open a file inside a workspace folder to run a file-focused scan.");
    return;
  }

  const report = await scanWorkspace(folder.uri.fsPath);
  latestReport = report;
  publishDiagnostics(report, diagnostics, editor.document.uri.fsPath);
  renderOutput(report, output, editor.document.uri.fsPath);

  const fileFindings = report.findings.filter(
    (finding) => finding.location?.filePath === editor.document.uri.fsPath
  );

  void vscode.window.showInformationMessage(
    `MCP Preflight found ${fileFindings.length} findings for ${editor.document.fileName.split(/[\\/]/).at(-1)}.`
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
      Math.max(1, finding.location.column + 80)
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
  output.appendLine(
    `Files scanned: ${report.summary.filesScanned} | Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info} | Suppressed: ${report.summary.suppressed}`
  );
  if (report.suppressionFilePath) {
    output.appendLine(`Suppressions file: ${report.suppressionFilePath}`);
  }
  output.appendLine("");

  const findings = onlyFilePath
    ? report.findings.filter((finding) => finding.location?.filePath === onlyFilePath)
    : report.findings;

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
