import * as vscode from "vscode";

import type { ActivitySummary, Finding, ResolvedLicense, ScanReport } from "mcp-preflight-core";
import {
  formatActivitySummary,
  formatLicenseStatus,
  getActivitySummary,
  installLicenseToken,
  PRODUCT_URLS,
  recordActivity,
  resolveLicense,
  scanWorkspace
} from "mcp-preflight-core";

let latestReport: ScanReport | undefined;
let latestLicense: ResolvedLicense | undefined;
let overviewPanel: vscode.WebviewPanel | undefined;
let activeContext: vscode.ExtensionContext | undefined;
let activeOutput: vscode.OutputChannel | undefined;
let activeStatusBar: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("mcp-preflight");
  const output = vscode.window.createOutputChannel("MCP Preflight");
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  statusBar.name = "MCP Preflight";
  statusBar.command = "mcpPreflight.openOverview";
  updateStatusBar(statusBar);
  statusBar.show();

  context.subscriptions.push(diagnostics, output, statusBar);
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpPreflight.openOverview", async () => {
      await openOverviewPanel(context, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.scanWorkspace", async () => {
      await runWorkspaceScan(context, diagnostics, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.scanCurrentFile", async () => {
      await runCurrentFileScan(context, diagnostics, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.showFixRecipes", async () => {
      showFixRecipes();
    }),
    vscode.commands.registerCommand("mcpPreflight.installLicense", async () => {
      await promptForLicenseInstall(context, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.showLicenseStatus", async () => {
      await showLicenseStatus(context, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.showLocalActivity", async () => {
      await showLocalActivitySummary(context, output, statusBar);
    }),
    vscode.commands.registerCommand("mcpPreflight.upgradeToPro", async () => {
      await openProductPage(output, "upgrade", PRODUCT_URLS.upgrade, "upgrade-opened");
    }),
    vscode.commands.registerCommand("mcpPreflight.leaveReview", async () => {
      await leaveReview(output);
    }),
    vscode.commands.registerCommand("mcpPreflight.getHelp", async () => {
      await getHelp(output);
    })
  );
}

export function deactivate(): void {}

async function runWorkspaceScan(
  context: vscode.ExtensionContext,
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
  await recordActivity({
    type: "scan-completed",
    surface: "vscode-extension",
    scanMode: "workspace",
    verdict: report.verdict,
    durationMs: Date.now() - startedAt,
    filesScanned: report.summary.filesScanned,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    info: report.summary.info,
    suppressed: report.summary.suppressed
  });
  publishDiagnostics(report, diagnostics);
  renderOutput(report, output);
  updateStatusBar(statusBar, report);
  await refreshOverviewPanel(context, output, statusBar);
  const elapsedMs = Date.now() - startedAt;

  void vscode.window
    .showInformationMessage(
      `MCP Preflight scanned ${report.summary.filesScanned} files in ${formatDuration(elapsedMs)}: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.suppressed} suppressed.`,
      "Overview",
      "Fix Recipes"
    )
    .then((selection) => {
      if (selection === "Overview") {
        void openOverviewPanel(context, output, statusBar);
      } else if (selection === "Fix Recipes") {
        showFixRecipes();
      }
    });
}

async function runCurrentFileScan(
  context: vscode.ExtensionContext,
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
  await recordActivity({
    type: "scan-completed",
    surface: "vscode-extension",
    scanMode: "focused",
    verdict: report.verdict,
    durationMs: Date.now() - startedAt,
    filesScanned: report.summary.filesScanned,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    info: report.summary.info,
    suppressed: report.summary.suppressed
  });
  publishDiagnostics(report, diagnostics, editor.document.uri.fsPath);
  renderOutput(report, output, editor.document.uri.fsPath);
  updateStatusBar(statusBar, report);
  await refreshOverviewPanel(context, output, statusBar);
  const elapsedMs = Date.now() - startedAt;
  const fileFindings = report.findings.filter(
    (finding) => finding.location?.filePath === editor.document.uri.fsPath
  );

  void vscode.window
    .showInformationMessage(
      `MCP Preflight found ${fileFindings.length} findings for ${editor.document.fileName.split(/[\\/]/).at(-1)} in ${formatDuration(elapsedMs)}.`,
      "Overview",
      "Fix Recipes"
    )
    .then((selection) => {
      if (selection === "Overview") {
        void openOverviewPanel(context, output, statusBar);
      } else if (selection === "Fix Recipes") {
        showFixRecipes();
      }
    });
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

async function promptForLicenseInstall(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
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
    latestLicense = license;
    updateStatusBar(statusBar, latestReport);
    await recordActivity({
      type: "license-installed",
      surface: "vscode-extension",
      licenseStatus: license.status
    });
    output.clear();
    output.appendLine(formatLicenseDetails(license));
    output.show(true);
    await refreshOverviewPanel(context, output, statusBar);
    void vscode.window.showInformationMessage("MCP Preflight Pro was activated on this machine.", "Overview").then((selection) => {
      if (selection === "Overview") {
        void openOverviewPanel(context, output, statusBar);
      }
    });
  } catch (error) {
    await recordActivity({
      type: "license-install-failed",
      surface: "vscode-extension",
      licenseStatus: "invalid"
    });
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MCP Preflight could not install the license: ${message}`);
  }
}

async function showLicenseStatus(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const license = await resolveLicense();
  latestLicense = license;
  updateStatusBar(statusBar, latestReport);
  await recordActivity({
    type: "license-status-checked",
    surface: "vscode-extension",
    licenseStatus: license.status
  });
  output.clear();
  output.appendLine(formatLicenseDetails(license));
  output.show(true);
  await openOverviewPanel(context, output, statusBar);
}

async function showLocalActivitySummary(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const summary = await getActivitySummary();
  output.clear();
  output.appendLine(formatActivitySummary(summary));
  output.show(true);
  await openOverviewPanel(context, output, statusBar);
}

async function leaveReview(output: vscode.OutputChannel): Promise<void> {
  const selection = await vscode.window.showQuickPick(
    [
      {
        label: "VS Code Marketplace",
        url: PRODUCT_URLS.marketplace,
        destination: "marketplace" as const
      },
      {
        label: "Open VSX",
        url: PRODUCT_URLS.openvsx,
        destination: "openvsx" as const
      }
    ],
    {
      title: "Leave a review for MCP Preflight"
    }
  );

  if (!selection) {
    return;
  }

  await openProductPage(output, selection.destination, selection.url, "review-opened");
}

async function getHelp(output: vscode.OutputChannel): Promise<void> {
  const selection = await vscode.window.showQuickPick(
    [
      {
        label: "GitHub Discussions",
        description: "Questions, feedback, and feature requests",
        url: PRODUCT_URLS.discussions,
        destination: "discussions" as const
      },
      {
        label: "GitHub Issues",
        description: "Bug reports and reproducible defects",
        url: PRODUCT_URLS.issues,
        destination: "issues" as const
      }
    ],
    {
      title: "Get help with MCP Preflight"
    }
  );

  if (!selection) {
    return;
  }

  await openProductPage(output, selection.destination, selection.url, "support-opened");
}

async function openOverviewPanel(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  if (!overviewPanel) {
    overviewPanel = vscode.window.createWebviewPanel(
      "mcpPreflightOverview",
      "MCP Preflight Overview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true
      }
    );

    overviewPanel.onDidDispose(() => {
      overviewPanel = undefined;
    });

    overviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isOverviewMessage(message)) {
        return;
      }

      switch (message.command) {
        case "refresh":
          await refreshOverviewPanel(context, output, statusBar);
          return;
        case "scanWorkspace":
          await vscode.commands.executeCommand("mcpPreflight.scanWorkspace");
          return;
        case "scanCurrentFile":
          await vscode.commands.executeCommand("mcpPreflight.scanCurrentFile");
          return;
        case "showFixRecipes":
          await vscode.commands.executeCommand("mcpPreflight.showFixRecipes");
          return;
        case "installLicense":
          await vscode.commands.executeCommand("mcpPreflight.installLicense");
          return;
        case "showLicenseStatus":
          await vscode.commands.executeCommand("mcpPreflight.showLicenseStatus");
          return;
        case "showLocalActivity":
          await vscode.commands.executeCommand("mcpPreflight.showLocalActivity");
          return;
        case "upgradeToPro":
          await vscode.commands.executeCommand("mcpPreflight.upgradeToPro");
          return;
        case "leaveReview":
          await vscode.commands.executeCommand("mcpPreflight.leaveReview");
          return;
        case "getHelp":
          await vscode.commands.executeCommand("mcpPreflight.getHelp");
          return;
        default:
          return;
      }
    });
  } else {
    overviewPanel.reveal(vscode.ViewColumn.Beside, true);
  }

  await refreshOverviewPanel(context, output, statusBar);
}

async function refreshOverviewPanel(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  if (!overviewPanel) {
    return;
  }

  const [license, activity] = await Promise.all([resolveLicense(), getActivitySummary()]);
  latestLicense = license;
  updateStatusBar(statusBar, latestReport);
  overviewPanel.title = license.status === "valid" ? "MCP Preflight Overview - Pro" : "MCP Preflight Overview";
  overviewPanel.webview.html = renderOverviewHtml({
    license,
    activity,
    report: latestReport
  });
}

function renderOverviewHtml(params: {
  license: ResolvedLicense;
  activity: ActivitySummary;
  report?: ScanReport;
}): string {
  const { license, activity, report } = params;
  const reportSummary = getReportOverview(report);
  const licenseActions =
    license.status === "valid"
      ? `<button data-command="showLicenseStatus">Refresh license status</button>`
      : `<button data-command="installLicense">Install Pro license</button><button class="secondary" data-command="upgradeToPro">Upgrade to Pro</button>`;
  const activitySummary =
    activity.eventsRecorded === 0
      ? "No local activity has been recorded yet."
      : `${activity.scans.total} scans, ${activity.upgradesOpened} upgrade opens, ${activity.reviewsOpened} review opens, ${activity.supportOpens} help opens.`;

  return `
    <html>
      <body style="font-family: Segoe UI, sans-serif; padding: 20px; color: #f5f7fa; background: linear-gradient(180deg, #0f172a 0%, #111827 100%);">
        <style>
          body { margin: 0; }
          h1, h2, h3, p { margin: 0; }
          .layout { display: grid; gap: 16px; }
          .hero { padding: 20px; border-radius: 16px; background: rgba(20, 33, 61, 0.92); border: 1px solid rgba(255, 255, 255, 0.08); }
          .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
          .card { padding: 16px; border-radius: 14px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(255, 255, 255, 0.08); }
          .eyebrow { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd; margin-bottom: 8px; }
          .title { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
          .muted { color: #cbd5e1; line-height: 1.5; }
          .stat { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
          .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
          button {
            appearance: none;
            border: 0;
            border-radius: 999px;
            padding: 10px 14px;
            background: #fca311;
            color: #111827;
            font-weight: 600;
            cursor: pointer;
          }
          button.secondary { background: rgba(255, 255, 255, 0.1); color: #f5f7fa; }
          .meta { margin-top: 12px; font-size: 13px; color: #93a4b8; line-height: 1.5; }
          .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 999px;
            background: ${getVerdictBackground(report?.verdict)};
            color: ${getVerdictForeground(report?.verdict)};
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
        </style>
        <div class="layout">
          <section class="hero">
            <div class="eyebrow">MCP Preflight</div>
            <div class="title">Local-first MCP review, without the dashboard.</div>
            <p class="muted">Use this panel to see your latest scan, check whether Pro is active on this machine, review local activity, and jump to the next action without digging through separate commands.</p>
            <div class="actions">
              <button data-command="scanWorkspace">Scan workspace</button>
              <button class="secondary" data-command="scanCurrentFile">Scan current file</button>
              <button class="secondary" data-command="refresh">Refresh overview</button>
            </div>
          </section>
          <div class="cards">
            <section class="card">
              <div class="eyebrow">Latest scan</div>
              <div class="pill">${escapeHtml(report?.verdict ?? "idle")}</div>
              <div class="stat">${escapeHtml(reportSummary.title)}</div>
              <p class="muted">${escapeHtml(reportSummary.detail)}</p>
              <div class="actions">
                ${reportSummary.actions}
              </div>
              <div class="meta">${escapeHtml(reportSummary.meta)}</div>
            </section>
            <section class="card">
              <div class="eyebrow">License</div>
              <div class="stat">${escapeHtml(getLicenseCardTitle(license))}</div>
              <p class="muted">${escapeHtml(getLicenseOverviewText(license))}</p>
              <div class="actions">
                ${licenseActions}
              </div>
              <div class="meta">${escapeHtml(getLicenseMetaText(license))}</div>
            </section>
            <section class="card">
              <div class="eyebrow">Local activity</div>
              <div class="stat">${activity.scans.total}</div>
              <p class="muted">${escapeHtml(activitySummary)}</p>
              <div class="actions">
                <button data-command="showLocalActivity">Show local activity</button>
              </div>
              <div class="meta">${escapeHtml(getActivityMetaText(activity))}</div>
            </section>
            <section class="card">
              <div class="eyebrow">Quick links</div>
              <div class="stat">Next actions</div>
              <p class="muted">Open checkout, ask for help, or leave a review without leaving the editor flow.</p>
              <div class="actions">
                <button data-command="upgradeToPro">Upgrade</button>
                <button class="secondary" data-command="leaveReview">Review</button>
                <button class="secondary" data-command="getHelp">Help</button>
              </div>
              <div class="meta">Support stays async through GitHub Discussions and Issues. Lite stays local-first.</div>
            </section>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          for (const button of document.querySelectorAll("button[data-command]")) {
            button.addEventListener("click", () => {
              vscode.postMessage({ command: button.getAttribute("data-command") });
            });
          }
        </script>
      </body>
    </html>
  `;
}

function getReportOverview(report?: ScanReport): {
  title: string;
  detail: string;
  actions: string;
  meta: string;
} {
  if (!report) {
    return {
      title: "No scan results yet",
      detail: "Run a workspace scan or focused file scan to see the latest MCP Preflight verdict here.",
      actions:
        `<button data-command="scanWorkspace">Scan workspace</button>` +
        `<button class="secondary" data-command="scanCurrentFile">Scan current file</button>`,
      meta: "No editor scan has been recorded in this session yet."
    };
  }

  const title =
    report.verdict === "fail"
      ? "Latest scan needs review"
      : report.verdict === "warning"
        ? "Latest scan has warnings"
        : "Latest scan passed";
  const detail = `${report.summary.filesScanned} files scanned, ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info, ${report.summary.suppressed} suppressed.`;
  const actions =
    report.findings.length > 0
      ? `<button data-command="showFixRecipes">Fix recipes</button><button class="secondary" data-command="scanWorkspace">Rescan</button>`
      : `<button data-command="scanWorkspace">Run another scan</button>`;

  return {
    title,
    detail,
    actions,
    meta: `Workspace: ${report.workspacePath}`
  };
}

function getLicenseCardTitle(license: ResolvedLicense): string {
  if (license.status === "valid") {
    return "Pro active";
  }

  if (license.status === "missing") {
    return "Lite mode";
  }

  return "License needs review";
}

function getLicenseOverviewText(license: ResolvedLicense): string {
  if (license.status === "valid") {
    return `This machine can use ${license.featureSet.join(", ")}.`;
  }

  if (license.status === "missing") {
    return "No local Pro token is installed, so MCP Preflight is running in Lite mode.";
  }

  return license.reason ?? "The local license could not be used.";
}

function getLicenseMetaText(license: ResolvedLicense): string {
  const details: string[] = [];

  if (license.licenseId) {
    details.push(`License ${license.licenseId}`);
  }

  if (license.updatesUntil) {
    details.push(`updates until ${license.updatesUntil}`);
  }

  if (license.installPath) {
    details.push(license.installPath);
  }

  return details.length > 0 ? details.join(" | ") : `Guide: ${PRODUCT_URLS.proLicenseGuide}`;
}

function getActivityMetaText(activity: ActivitySummary): string {
  const blockedFeatures = Object.entries(activity.blockedFeatures)
    .filter(([, count]) => count > 0)
    .map(([feature, count]) => `${feature}: ${count}`)
    .join(", ");

  const details: string[] = [];

  if (typeof activity.scans.avgDurationMs === "number") {
    details.push(`Average scan ${formatDuration(activity.scans.avgDurationMs)}`);
  }

  details.push(
    blockedFeatures.length > 0 ? `Blocked Pro surfaces: ${blockedFeatures}` : "No blocked Pro surfaces recorded yet."
  );

  return details.join(" | ");
}

function getVerdictBackground(verdict: ScanReport["verdict"] | undefined): string {
  if (verdict === "fail") {
    return "rgba(239, 68, 68, 0.18)";
  }

  if (verdict === "warning") {
    return "rgba(245, 158, 11, 0.18)";
  }

  return "rgba(16, 185, 129, 0.18)";
}

function getVerdictForeground(verdict: ScanReport["verdict"] | undefined): string {
  if (verdict === "fail") {
    return "#fecaca";
  }

  if (verdict === "warning") {
    return "#fde68a";
  }

  return "#bbf7d0";
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
  const licenseLabel = latestLicense?.status === "valid" ? " | Pro" : "";

  if (!report) {
    statusBar.text = `$(shield) MCP Preflight${licenseLabel}`;
    statusBar.tooltip = "Open MCP Preflight overview";
    statusBar.backgroundColor = undefined;
    return;
  }

  const totalFindings = report.summary.errors + report.summary.warnings + report.summary.info;
  const verdictLabel = report.verdict === "fail" ? "Fail" : report.verdict === "warning" ? "Warn" : "Pass";

  statusBar.text = `$(shield) MCP ${verdictLabel} ${report.summary.errors}/${report.summary.warnings}/${report.summary.info}${licenseLabel}`;
  statusBar.tooltip = [
    "MCP Preflight latest scan",
    `Verdict: ${report.verdict.toUpperCase()}`,
    `Files scanned: ${report.summary.filesScanned}`,
    `Findings: ${totalFindings}`,
    `Suppressed: ${report.summary.suppressed}`,
    latestLicense ? `License: ${latestLicense.status.toUpperCase()}` : undefined,
    "",
    "Click to open the MCP Preflight overview."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
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

async function openProductPage(
  output: vscode.OutputChannel,
  destination: "upgrade" | "marketplace" | "openvsx" | "discussions" | "issues",
  url: string,
  eventType: "upgrade-opened" | "review-opened" | "support-opened"
): Promise<void> {
  const didOpen = await vscode.env.openExternal(vscode.Uri.parse(url));

  if (!didOpen) {
    void vscode.window.showErrorMessage(`MCP Preflight could not open ${url}.`);
    return;
  }

  await recordActivity({
    type: eventType,
    surface: "vscode-extension",
    destination
  });
  output.appendLine(`Opened ${url}`);
  output.show(true);

  if (activeContext && activeOutput && activeStatusBar) {
    await refreshOverviewPanel(activeContext, activeOutput, activeStatusBar);
  }
}

function isOverviewMessage(value: unknown): value is { command: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "command" in value &&
    typeof (value as { command: unknown }).command === "string"
  );
}
