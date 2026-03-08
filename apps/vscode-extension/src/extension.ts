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
let overviewSidebarView: vscode.WebviewView | undefined;
let activeContext: vscode.ExtensionContext | undefined;
let activeOutput: vscode.OutputChannel | undefined;
let activeStatusBar: vscode.StatusBarItem | undefined;

const SIDEBAR_VIEW_ID = "mcpPreflight.overviewView";
const SIDEBAR_CONTAINER_COMMAND = "workbench.view.extension.mcpPreflight";
const ONBOARDING_VERSION_KEY = "mcpPreflight.onboardingVersion";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("mcp-preflight");
  const output = vscode.window.createOutputChannel("MCP Preflight");
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  statusBar.name = "MCP Preflight";
  statusBar.command = "mcpPreflight.openSidebar";
  updateStatusBar(statusBar);
  statusBar.show();

  context.subscriptions.push(diagnostics, output, statusBar);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SIDEBAR_VIEW_ID,
      {
        resolveWebviewView(view) {
          overviewSidebarView = view;
          view.webview.options = {
            enableScripts: true
          };
          registerOverviewMessageBridge(view.webview, context, output, statusBar);
          view.onDidDispose(() => {
            if (overviewSidebarView === view) {
              overviewSidebarView = undefined;
            }
          });
          void refreshOverviewSurfaces(context, output, statusBar);
        }
      },
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpPreflight.openSidebar", async () => {
      await openSidebar(context, output, statusBar);
    }),
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

  void maybeShowOnboarding(context, output, statusBar);
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
    void vscode.window.showErrorMessage("Open a workspace to start scanning.");
    return;
  }

  const startedAt = Date.now();
  const report = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning workspace..."
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
  await refreshOverviewSurfaces(context, output, statusBar);
  const elapsedMs = Date.now() - startedAt;

  void vscode.window
    .showInformationMessage(
      `Done: ${pluralize(report.summary.filesScanned, "file")} in ${formatDuration(elapsedMs)}. ${pluralize(report.summary.errors, "error")}, ${pluralize(report.summary.warnings, "warning")}, ${report.summary.suppressed} suppressed.`,
      "Open Sidebar",
      "Fix Recipes"
    )
    .then((selection) => {
      if (selection === "Open Sidebar") {
        void openSidebar(context, output, statusBar);
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
    void vscode.window.showErrorMessage("Open a file in the workspace to scan it.");
    return;
  }

  const startedAt = Date.now();
  const report = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning file..."
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
  await refreshOverviewSurfaces(context, output, statusBar);
  const elapsedMs = Date.now() - startedAt;
  const fileFindings = report.findings.filter(
    (finding) => finding.location?.filePath === editor.document.uri.fsPath
  );

  void vscode.window
    .showInformationMessage(
      `Done: ${pluralize(fileFindings.length, "finding")} in ${editor.document.fileName.split(/[\\/]/).at(-1)} (${formatDuration(elapsedMs)}).`,
      "Open Sidebar",
      "Fix Recipes"
    )
    .then((selection) => {
      if (selection === "Open Sidebar") {
        void openSidebar(context, output, statusBar);
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
    prompt: "Paste your MCP Preflight Pro token.",
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
    await refreshOverviewSurfaces(context, output, statusBar);
    void vscode.window.showInformationMessage("MCP Preflight Pro is now active on this machine.", "Open Sidebar").then((selection) => {
      if (selection === "Open Sidebar") {
        void openSidebar(context, output, statusBar);
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
  await openSidebar(context, output, statusBar);
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
  await openSidebar(context, output, statusBar);
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
      title: "Choose a review page."
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
      title: "Choose a support path."
    }
  );

  if (!selection) {
    return;
  }

  await openProductPage(output, selection.destination, selection.url, "support-opened");
}

async function openSidebar(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  try {
    await vscode.commands.executeCommand(SIDEBAR_CONTAINER_COMMAND);
  } catch {
    await openOverviewPanel(context, output, statusBar);
    return;
  }

  await refreshOverviewSurfaces(context, output, statusBar);
}

async function maybeShowOnboarding(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const currentVersion = String(context.extension.packageJSON.version ?? "unknown");
  const lastShownVersion = context.globalState.get<string>(ONBOARDING_VERSION_KEY);

  if (lastShownVersion === currentVersion) {
    return;
  }

  await context.globalState.update(ONBOARDING_VERSION_KEY, currentVersion);

  const selection = await vscode.window.showInformationMessage(
    "Welcome. Open the sidebar to scan the workspace, check the latest result, or install a Pro token.",
    "Open Sidebar",
    "Scan Workspace"
  );

  if (selection === "Open Sidebar") {
    await openSidebar(context, output, statusBar);
    return;
  }

  if (selection === "Scan Workspace") {
    await vscode.commands.executeCommand("mcpPreflight.scanWorkspace");
  }
}

function registerOverviewMessageBridge(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): void {
  webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isOverviewMessage(message)) {
      return;
    }

    switch (message.command) {
      case "refresh":
        await refreshOverviewSurfaces(context, output, statusBar);
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
      case "openSidebar":
        await openSidebar(context, output, statusBar);
        return;
      default:
        return;
    }
  });
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

    registerOverviewMessageBridge(overviewPanel.webview, context, output, statusBar);
  } else {
    overviewPanel.reveal(vscode.ViewColumn.Beside, true);
  }

  await refreshOverviewSurfaces(context, output, statusBar);
}

async function refreshOverviewSurfaces(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  activeContext = context;
  activeOutput = output;
  activeStatusBar = statusBar;

  const [license, activity] = await Promise.all([resolveLicense(), getActivitySummary()]);
  latestLicense = license;
  updateStatusBar(statusBar, latestReport);

  if (overviewPanel) {
    overviewPanel.title = license.status === "valid" ? "MCP Preflight Overview - Pro" : "MCP Preflight Overview";
    overviewPanel.webview.html = renderOverviewHtml(
      {
        license,
        activity,
        report: latestReport,
        version: String(context.extension.packageJSON.version ?? "unknown")
      },
      "panel"
    );
  }

  if (overviewSidebarView) {
    overviewSidebarView.title = "Overview";
    overviewSidebarView.description = license.status === "valid" ? "Pro active" : "Lite active";
    overviewSidebarView.webview.html = renderOverviewHtml(
      {
        license,
        activity,
        report: latestReport,
        version: String(context.extension.packageJSON.version ?? "unknown")
      },
      "sidebar"
    );
  }
}

function renderOverviewHtml(
  params: {
  license: ResolvedLicense;
  activity: ActivitySummary;
  report?: ScanReport;
  version: string;
},
  surface: "panel" | "sidebar"
): string {
  const { license, activity, report } = params;
  const reportSummary = getReportOverview(report);
  const isSidebar = surface === "sidebar";
  const licenseActions =
    license.status === "valid"
      ? `<button data-command="showLicenseStatus">Refresh license status</button>`
      : `<button data-command="installLicense">Install Pro token</button><button class="secondary" data-command="upgradeToPro">Upgrade to Pro</button>`;
  const activitySummary =
    activity.eventsRecorded === 0
      ? "No scans recorded yet."
      : `${activity.scans.total} scans, ${activity.upgradesOpened} upgrade opens, ${activity.reviewsOpened} review opens, ${activity.supportOpens} help opens.`;
  const trustList = [
    "Local by default",
    "No account required for Lite",
    "Signed local token for Pro",
    "Local suppression files in Lite"
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <html>
      <body class="${isSidebar ? "sidebar" : "panel"}">
        <style>
          :root {
            color-scheme: dark;
            --bg: #0a0a0b;
            --surface: #121316;
            --surface-strong: #16171b;
            --line: #26282e;
            --line-strong: #383b43;
            --ink: #f3f4f6;
            --ink-soft: #b4b8c0;
            --ink-faint: #7f858f;
          }
          body {
            margin: 0;
            padding: ${isSidebar ? "10px" : "16px"};
            font-family: Inter, "Segoe UI", sans-serif;
            color: var(--ink);
            background:
              radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 18rem),
              linear-gradient(180deg, #09090a 0%, #0b0b0d 100%);
          }
          h1, h2, h3, p, ul { margin: 0; }
          .layout { display: grid; gap: 10px; }
          .hero,
          .card {
            border: 1px solid var(--line);
            border-radius: 14px;
            background:
              radial-gradient(circle at top left, rgba(255, 255, 255, 0.03), transparent 12rem),
              linear-gradient(180deg, rgba(22, 23, 27, 0.98), rgba(14, 15, 18, 0.98));
          }
          .hero {
            padding: ${isSidebar ? "14px" : "16px"};
          }
          .hero-top {
            display: grid;
            grid-template-columns: ${isSidebar ? "1fr" : "auto 1fr auto"};
            gap: 12px;
            align-items: start;
          }
          .identity {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: start;
          }
          .brand-mark {
            width: ${isSidebar ? "42px" : "48px"};
            height: ${isSidebar ? "42px" : "48px"};
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--line);
          }
          .cards {
            display: grid;
            grid-template-columns: ${isSidebar ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))"};
            gap: 10px;
          }
          .card {
            padding: 14px;
          }
          .eyebrow,
          .summary-label,
          .tier-chip,
          .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            width: fit-content;
            padding: 4px 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.03);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .summary-label,
          .eyebrow {
            color: #d2d6dd;
          }
          .tier-chip {
            justify-self: ${isSidebar ? "start" : "end"};
            color: ${license.status === "valid" ? "#d8eadc" : "#dde1e8"};
            border-color: ${license.status === "valid" ? "rgba(128, 160, 136, 0.28)" : "var(--line)"};
            background: ${license.status === "valid" ? "rgba(128, 160, 136, 0.1)" : "rgba(255, 255, 255, 0.03)"};
          }
          .hero-copy h1 {
            margin-top: 8px;
            font-size: ${isSidebar ? "20px" : "24px"};
            line-height: 1.04;
            letter-spacing: -0.04em;
          }
          .subcopy {
            margin-top: 8px;
            color: var(--ink-soft);
            line-height: 1.45;
            max-width: 48ch;
            font-size: 13px;
          }
          .toolbar,
          button {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .toolbar {
            margin-top: 12px;
          }
          button {
            appearance: none;
            border: 1px solid var(--line);
            border-radius: 10px;
            padding: 8px 11px;
            background: #f3f4f6;
            color: #0a0a0b;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: -0.01em;
            cursor: pointer;
          }
          button.secondary {
            background: rgba(255, 255, 255, 0.03);
            color: var(--ink);
          }
          button:hover {
            border-color: var(--line-strong);
          }
          .metric-grid {
            margin-top: 12px;
            display: grid;
            grid-template-columns: ${isSidebar ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))"};
            gap: 8px;
          }
          .metric {
            padding: 10px 11px;
            border-radius: 10px;
            border: 1px solid var(--line);
            background: rgba(255, 255, 255, 0.025);
          }
          .metric strong {
            display: block;
            font-size: 16px;
            letter-spacing: -0.03em;
          }
          .metric span {
            display: block;
            margin-top: 4px;
            font-size: 11px;
            color: var(--ink-faint);
          }
          .card-head {
            display: flex;
            align-items: start;
            justify-content: space-between;
            gap: 10px;
          }
          .stat {
            margin-top: 10px;
            font-size: 22px;
            font-weight: 700;
            line-height: 1.04;
            letter-spacing: -0.04em;
          }
          .muted {
            margin-top: 8px;
            color: var(--ink-soft);
            line-height: 1.45;
            font-size: 13px;
          }
          .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 12px;
          }
          .meta {
            margin-top: 10px;
            color: var(--ink-faint);
            line-height: 1.45;
            font-size: 12px;
          }
          .pill {
            margin-top: 10px;
            margin-bottom: 0;
            color: ${getVerdictForeground(report?.verdict)};
            background: ${getVerdictBackground(report?.verdict)};
            border-color: ${getVerdictBorder(report?.verdict)};
          }
          .trust-list {
            list-style: none;
            margin: 10px 0 0;
            padding: 0;
            display: grid;
            gap: 0;
          }
          .trust-list li {
            padding: 9px 0;
            border-top: 1px solid var(--line);
            color: var(--ink-soft);
            font-size: 13px;
          }
          .trust-list li:first-child {
            border-top: 0;
          }
          @media (max-width: 640px) {
            .hero-top,
            .identity {
              grid-template-columns: 1fr;
            }
            .metric-grid,
            .cards {
              grid-template-columns: 1fr;
            }
          }
        </style>
        <div class="layout">
          <section class="hero">
            <div class="hero-top">
              <div class="identity">
                <div class="brand-mark" aria-hidden="true">
                  ${renderBrandMarkSvg()}
                </div>
                <div class="hero-copy">
                  <div class="summary-label">MCP Preflight</div>
                  <h1>Review MCP setup before first run.</h1>
                  <p class="subcopy">Latest scan status, local license state, and the next actions for this editor profile.</p>
                </div>
              </div>
              <div class="tier-chip">${escapeHtml(license.status === "valid" ? "Pro active" : "Lite active")}</div>
            </div>
            <div class="toolbar">
              <button data-command="scanWorkspace">Scan workspace</button>
              <button class="secondary" data-command="scanCurrentFile">Scan current file</button>
              <button class="secondary" data-command="refresh">Refresh</button>
            </div>
            <div class="metric-grid">
              <div class="metric">
                <strong>${activity.scans.total}</strong>
                <span>local scans</span>
              </div>
              <div class="metric">
                <strong>${report ? report.summary.errors + report.summary.warnings + report.summary.info : 0}</strong>
                <span>latest findings</span>
              </div>
              <div class="metric">
                <strong>${license.status === "valid" ? "Pro" : "Lite"}</strong>
                <span>current tier</span>
              </div>
              <div class="metric">
                <strong>v${escapeHtml(params.version)}</strong>
                <span>extension build</span>
              </div>
            </div>
          </section>
          <div class="cards">
            <section class="card">
              <div class="card-head">
                <div class="eyebrow">Latest scan</div>
                <div class="pill">${escapeHtml(report?.verdict ?? "idle")}</div>
              </div>
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
              <div class="eyebrow">Local mode</div>
              <div class="stat">Local-first</div>
              <p class="muted">The scanner reads local files. Lite needs no account. Pro uses a signed token on this machine.</p>
              <ul class="trust-list">${trustList}</ul>
            </section>
            <section class="card">
              <div class="eyebrow">Activity</div>
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
              <p class="muted">Open help, leave a review, or compare Lite and Pro.</p>
              <div class="actions">
                <button data-command="openSidebar">Open sidebar</button>
                <button data-command="upgradeToPro">Upgrade</button>
                <button class="secondary" data-command="leaveReview">Review</button>
                <button class="secondary" data-command="getHelp">Help</button>
              </div>
              <div class="meta">Support stays async through GitHub Discussions and Issues.</div>
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
        title: "No scan yet",
        detail: "Run a workspace scan or file scan to see the latest result.",
      actions:
        `<button data-command="scanWorkspace">Scan workspace</button>` +
        `<button class="secondary" data-command="scanCurrentFile">Scan current file</button>`,
      meta: "No editor scan has been recorded in this session yet."
    };
  }

  const title =
    report.verdict === "fail"
      ? "Needs review"
      : report.verdict === "warning"
        ? "Warnings found"
        : "No issues found";
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
    return "No Pro token installed. MCP Preflight is in Lite mode.";
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
    return "rgba(120, 42, 42, 0.14)";
  }

  if (verdict === "warning") {
    return "rgba(118, 92, 40, 0.14)";
  }

  return "rgba(62, 88, 67, 0.14)";
}

function getVerdictForeground(verdict: ScanReport["verdict"] | undefined): string {
  if (verdict === "fail") {
    return "#e7c1c1";
  }

  if (verdict === "warning") {
    return "#e4d2ab";
  }

  return "#d1dfd4";
}

function getVerdictBorder(verdict: ScanReport["verdict"] | undefined): string {
  if (verdict === "fail") {
    return "rgba(198, 98, 98, 0.22)";
  }

  if (verdict === "warning") {
    return "rgba(194, 152, 72, 0.22)";
  }

  return "rgba(118, 153, 124, 0.22)";
}

function renderFixRecipeHtml(report: ScanReport | undefined): string {
  if (!report) {
    return `
      <html>
        <body>
          <h2>No scan results yet</h2>
          <p>Run "MCP Preflight: Scan Workspace" to see fix suggestions.</p>
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

function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function updateStatusBar(statusBar: vscode.StatusBarItem, report?: ScanReport): void {
  const licenseLabel = latestLicense?.status === "valid" ? " | Pro" : "";

  if (!report) {
    statusBar.text = `$(shield) MCP Preflight${licenseLabel}`;
    statusBar.tooltip = "Open the MCP Preflight sidebar";
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
    "Click to open the MCP Preflight sidebar."
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
    await refreshOverviewSurfaces(activeContext, activeOutput, activeStatusBar);
  }
}

function renderBrandMarkSvg(): string {
  return `
    <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MCP Preflight">
      <defs>
        <linearGradient id="mcp-preflight-brand-ring" x1="8" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#b6fbff" />
          <stop offset="1" stop-color="#4cc9b0" />
        </linearGradient>
        <linearGradient id="mcp-preflight-brand-mark" x1="12" y1="10" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#1f5a84" />
          <stop offset="1" stop-color="#2cc2a7" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="18" fill="#eff9ff" />
      <circle cx="22" cy="22" r="17" fill="none" stroke="url(#mcp-preflight-brand-ring)" stroke-width="2" />
      <path d="M17.5 14.4C15.4 15.8 14 18.6 14 22C14 25.4 15.4 28.2 17.5 29.6" fill="none" stroke="url(#mcp-preflight-brand-mark)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26.5 14.4C28.6 15.8 30 18.6 30 22C30 25.4 28.6 28.2 26.5 29.6" fill="none" stroke="url(#mcp-preflight-brand-mark)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 15.8V28.2" fill="none" stroke="#1b4c76" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M18.8 22.4L21.1 24.7L26.1 19.7" fill="none" stroke="#f0a746" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function isOverviewMessage(value: unknown): value is { command: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "command" in value &&
    typeof (value as { command: unknown }).command === "string"
  );
}
