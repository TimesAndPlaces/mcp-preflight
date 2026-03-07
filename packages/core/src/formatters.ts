import type { Finding, ScanReport } from "./types";

export function formatReportAsJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatReportAsText(report: ScanReport): string {
  const lines: string[] = [];
  lines.push(`MCP Preflight verdict: ${report.verdict.toUpperCase()}`);
  lines.push(`Workspace: ${report.workspacePath}`);
  lines.push(
    `Files scanned: ${report.summary.filesScanned} | Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info} | Suppressed: ${report.summary.suppressed}`
  );
  if (report.suppressionFilePath) {
    lines.push(`Suppressions file: ${report.suppressionFilePath}`);
  }
  if (report.notices.length > 0) {
    lines.push("Notices:");
    for (const notice of report.notices) {
      lines.push(`- ${notice.message}`);
      if (notice.suggestion) {
        lines.push(`  ${notice.suggestion}`);
      }
    }
  }
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings.");
    return lines.join("\n");
  }

  for (const finding of report.findings) {
    lines.push(formatFinding(finding));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatFinding(finding: Finding): string {
  const location = finding.location
    ? `${finding.location.relativePath}:${finding.location.line}:${finding.location.column}`
    : "workspace";
  const evidence = finding.evidence ? `\n  Evidence: ${finding.evidence}` : "";

  return [
    `[${finding.severity.toUpperCase()}] ${finding.title}`,
    `  Rule: ${finding.ruleId}`,
    `  Fingerprint: ${finding.fingerprint}`,
    `  File: ${location}`,
    `  Why: ${finding.description}`,
    `  Fix: ${finding.suggestion}${evidence}`
  ].join("\n");
}

export function formatReportAsMarkdown(report: ScanReport): string {
  const sections: string[] = [];
  sections.push("# MCP Preflight Report");
  sections.push("");
  sections.push(`- Verdict: **${report.verdict.toUpperCase()}**`);
  sections.push(`- Workspace: \`${report.workspacePath}\``);
  sections.push(`- Generated: \`${report.generatedAt}\``);
  sections.push(
    `- Summary: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info, ${report.summary.suppressed} suppressed`
  );

  if (report.suppressionFilePath) {
    sections.push(`- Suppressions: \`${report.suppressionFilePath}\``);
  }
  if (report.notices.length > 0) {
    sections.push("");
    sections.push("## Notices");
    sections.push("");
    for (const notice of report.notices) {
      sections.push(`- ${notice.message}`);
      if (notice.suggestion) {
        sections.push(`  ${notice.suggestion}`);
      }
    }
  }

  sections.push("");

  if (report.findings.length === 0) {
    sections.push("No active findings.");
    return sections.join("\n");
  }

  sections.push("## Findings");
  sections.push("");

  for (const finding of report.findings) {
    const location = finding.location
      ? `\`${finding.location.relativePath}:${finding.location.line}:${finding.location.column}\``
      : "`workspace`";
    sections.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
    sections.push(`- Rule: \`${finding.ruleId}\``);
    sections.push(`- Fingerprint: \`${finding.fingerprint}\``);
    sections.push(`- Location: ${location}`);
    sections.push(`- Why: ${finding.description}`);
    sections.push(`- Fix: ${finding.suggestion}`);
    if (finding.evidence) {
      sections.push(`- Evidence: \`${escapeMarkdownInline(finding.evidence)}\``);
    }
    sections.push("");
  }

  return sections.join("\n").trimEnd();
}

export function formatReportAsHtml(report: ScanReport): string {
  const cards = report.findings
    .map((finding) => {
      const location = finding.location
        ? `${finding.location.relativePath}:${finding.location.line}:${finding.location.column}`
        : "workspace";

      return `
        <article class="card severity-${finding.severity}">
          <div class="badge">${escapeHtml(finding.severity.toUpperCase())}</div>
          <h2>${escapeHtml(finding.title)}</h2>
          <p><strong>Rule:</strong> ${escapeHtml(finding.ruleId)}</p>
          <p><strong>Fingerprint:</strong> ${escapeHtml(finding.fingerprint)}</p>
          <p><strong>Location:</strong> ${escapeHtml(location)}</p>
          <p>${escapeHtml(finding.description)}</p>
          <p><strong>Fix:</strong> ${escapeHtml(finding.suggestion)}</p>
          ${finding.evidence ? `<pre>${escapeHtml(finding.evidence)}</pre>` : ""}
        </article>
      `;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>MCP Preflight Report</title>
        <style>
          body { font-family: "Segoe UI", sans-serif; margin: 32px; color: #14213d; background: #f7f4ea; }
          .summary { padding: 20px; border-radius: 14px; background: #ffffff; box-shadow: 0 8px 24px rgba(20,33,61,0.08); margin-bottom: 24px; }
          .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
          .card { background: white; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(20,33,61,0.08); border-top: 6px solid #9ca3af; }
          .severity-error { border-top-color: #b91c1c; }
          .severity-warning { border-top-color: #d97706; }
          .severity-info { border-top-color: #2563eb; }
          .badge { display: inline-block; font-size: 12px; letter-spacing: 0.08em; color: #334155; margin-bottom: 12px; }
          pre { background: #f8fafc; padding: 12px; border-radius: 10px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <section class="summary">
          <h1>MCP Preflight Report</h1>
          <p><strong>Verdict:</strong> ${escapeHtml(report.verdict.toUpperCase())}</p>
          <p><strong>Workspace:</strong> ${escapeHtml(report.workspacePath)}</p>
          <p><strong>Generated:</strong> ${escapeHtml(report.generatedAt)}</p>
          <p><strong>Summary:</strong> ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info, ${report.summary.suppressed} suppressed</p>
          ${
            report.suppressionFilePath
              ? `<p><strong>Suppressions:</strong> ${escapeHtml(report.suppressionFilePath)}</p>`
              : ""
          }
          ${
            report.notices.length > 0
              ? `<div><strong>Notices:</strong><ul>${report.notices
                  .map(
                    (notice) =>
                      `<li>${escapeHtml(notice.message)}${
                        notice.suggestion ? ` ${escapeHtml(notice.suggestion)}` : ""
                      }</li>`
                  )
                  .join("")}</ul></div>`
              : ""
          }
        </section>
        <section class="grid">
          ${cards || "<p>No active findings.</p>"}
        </section>
      </body>
    </html>
  `.trim();
}

export function formatReportAsSarif(report: ScanReport): string {
  const rules = Array.from(
    new Map(
      report.findings.map((finding) => [
        finding.ruleId,
        {
          id: finding.ruleId,
          name: finding.title,
          shortDescription: {
            text: finding.description
          }
        }
      ])
    ).values()
  );

  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "MCP Preflight",
            rules
          }
        },
        invocations: [
          {
            executionSuccessful: true
          }
        ],
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: finding.severity === "info" ? "note" : finding.severity,
          message: {
            text: `${finding.title}. ${finding.suggestion}`
          },
          fingerprints: {
            primaryLocationLineHash: finding.fingerprint
          },
          locations: finding.location
            ? [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: finding.location.relativePath
                    },
                    region: {
                      startLine: finding.location.line,
                      startColumn: finding.location.column
                    }
                  }
                }
              ]
            : []
        }))
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeMarkdownInline(value: string): string {
  return value.replaceAll("`", "\\`");
}
