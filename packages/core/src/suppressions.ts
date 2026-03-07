import { promises as fs } from "node:fs";
import path from "node:path";

import { findNodeAtLocation, getNodeValue, parse, parseTree, printParseErrorCode, type ParseError } from "jsonc-parser";

import type { Finding, FindingSuppression, LoadedSuppressions, ScanOptions, WorkspaceFile } from "./types";
import { createFinding } from "./utils";

export async function loadSuppressions(
  workspacePath: string,
  options: Pick<ScanOptions, "useSuppressions" | "suppressionsFileName" | "suppressionsFilePath">
): Promise<LoadedSuppressions> {
  if (!options.useSuppressions) {
    return { suppressions: [], diagnosticFindings: [] };
  }

  const filePath = options.suppressionsFilePath
    ? path.resolve(options.suppressionsFilePath)
    : path.join(workspacePath, options.suppressionsFileName);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const file = createVirtualWorkspaceFile(filePath, workspacePath, content);
    const errors: ParseError[] = [];
    const parsed = parse(content, errors) as unknown;
    const tree = parseTree(content);
    const diagnosticFindings: Finding[] = [];

    if (errors.length > 0) {
      const firstError = errors[0];

      if (!firstError) {
        return {
          filePath,
          suppressions: [],
          diagnosticFindings
        };
      }

      diagnosticFindings.push(createSuppressionParseFinding(file, firstError));
      return {
        filePath,
        suppressions: [],
        diagnosticFindings
      };
    }

    if (!isSuppressionFile(parsed)) {
      return {
        filePath,
        suppressions: [],
        diagnosticFindings: [
          createFinding({
            ruleId: "invalid-suppression-file",
            title: "Suppression file has the wrong top-level shape",
            description:
              "The suppression file must contain a top-level `suppressions` array. Invalid suppression files are ignored so they cannot silently hide findings.",
            severity: "warning",
            category: "scanner-config",
            suggestion: "Rewrite the file to use `{ \"suppressions\": [ ... ] }` and keep each entry scoped to a rule, path, or fingerprint.",
            file,
            evidence: "Missing top-level suppressions array",
            tags: ["scanner", "suppressions", "config"]
          })
        ]
      };
    }

    const arrayNode = tree ? findNodeAtLocation(tree, ["suppressions"]) : undefined;
    const arrayItems = arrayNode?.children ?? [];
    const validSuppressions: FindingSuppression[] = [];

    parsed.suppressions.forEach((suppression, index) => {
      const entryNode = arrayItems[index];

      if (!isSuppression(suppression)) {
        diagnosticFindings.push(
          createSuppressionEntryFinding({
            file,
            title: "Suppression entry is missing a selector",
            description:
              "Each suppression entry must include at least one selector such as `ruleId`, `path`, or `fingerprint`. Entries without selectors are ignored.",
            suggestion: "Add a `ruleId`, `path`, or `fingerprint` selector to the suppression entry.",
            evidence: typeof suppression === "object" ? JSON.stringify(suppression) : String(suppression),
            index: entryNode?.offset
          })
        );
        return;
      }

      if (suppression.expiresOn && Number.isNaN(new Date(suppression.expiresOn).getTime())) {
        diagnosticFindings.push(
          createSuppressionEntryFinding({
            file,
            title: "Suppression entry has an invalid expiresOn value",
            description:
              "The suppression entry uses `expiresOn`, but the value is not a valid date. Invalid expiry dates are ignored so the entry cannot silently outlive review.",
            suggestion: "Use an ISO date such as `2026-12-31` or remove `expiresOn`.",
            evidence: suppression.expiresOn,
            index: entryNode?.offset
          })
        );
        return;
      }

      validSuppressions.push(suppression);
    });

    return {
      filePath,
      suppressions: validSuppressions,
      diagnosticFindings
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { suppressions: [], diagnosticFindings: [] };
    }

    const content = `Failed to read suppression file: ${error instanceof Error ? error.message : String(error)}`;
    const file = createVirtualWorkspaceFile(filePath, workspacePath, content);
    return {
      filePath,
      suppressions: [],
      diagnosticFindings: [
        createFinding({
          ruleId: "invalid-suppression-file",
          title: "Suppression file could not be read",
          description:
            "The suppression file exists but could not be read successfully. It will be ignored so it cannot silently alter scan results.",
          severity: "warning",
          category: "scanner-config",
          suggestion: "Check file permissions and JSON syntax, then rerun the scan.",
          file,
          evidence: content,
          tags: ["scanner", "suppressions", "config"]
        })
      ]
    };
  }
}

export function applySuppressions(
  findings: Finding[],
  loadedSuppressions: LoadedSuppressions,
  includeSuppressedFindings: boolean
): { findings: Finding[]; suppressedFindings: Finding[] } {
  const findingsToReturn: Finding[] = [];
  const suppressedFindings: Finding[] = [];

  for (const finding of findings) {
    const suppressed = loadedSuppressions.suppressions.some((suppression) =>
      matchesSuppression(finding, suppression)
    );

    if (suppressed) {
      suppressedFindings.push(finding);

      if (includeSuppressedFindings) {
        findingsToReturn.push(finding);
      }

      continue;
    }

    findingsToReturn.push(finding);
  }

  return {
    findings: findingsToReturn,
    suppressedFindings
  };
}

function matchesSuppression(finding: Finding, suppression: FindingSuppression): boolean {
  if (suppression.expiresOn && !isSuppressionStillActive(suppression.expiresOn)) {
    return false;
  }

  if (suppression.ruleId && suppression.ruleId !== finding.ruleId) {
    return false;
  }

  if (suppression.fingerprint && suppression.fingerprint !== finding.fingerprint) {
    return false;
  }

  if (suppression.path && !matchesPathPattern(finding.location?.relativePath ?? "", suppression.path)) {
    return false;
  }

  return true;
}

function matchesPathPattern(relativePath: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexSource = `^${escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`;
  return new RegExp(regexSource).test(relativePath);
}

function isSuppressionStillActive(expiresOn: string): boolean {
  const expiresAt = new Date(expiresOn);

  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }

  return expiresAt.getTime() >= Date.now();
}

function isSuppressionFile(value: unknown): value is { suppressions: unknown[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { suppressions?: unknown[] }).suppressions);
}

function isSuppression(value: unknown): value is FindingSuppression {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const suppression = value as Record<string, unknown>;
  return (
    isNonEmptyString(suppression.ruleId) ||
    isNonEmptyString(suppression.path) ||
    isNonEmptyString(suppression.fingerprint)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function createVirtualWorkspaceFile(filePath: string, workspacePath: string, content: string): WorkspaceFile {
  const relativePath = path.relative(workspacePath, filePath).split(path.sep).join("/");
  return {
    filePath,
    relativePath,
    content,
    size: content.length,
    basename: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase()
  };
}

function createSuppressionParseFinding(file: WorkspaceFile, error: ParseError): Finding {
  return createFinding({
    ruleId: "invalid-suppression-file",
    title: "Suppression file contains invalid JSON",
    description:
      "The suppression file could not be parsed. Invalid suppression files are ignored so they cannot silently hide findings.",
    severity: "warning",
    category: "scanner-config",
    suggestion: "Fix the JSON syntax in the suppression file and rerun the scan.",
    file,
    evidence: printParseErrorCode(error.error),
    index: error.offset,
    tags: ["scanner", "suppressions", "config"]
  });
}

function createSuppressionEntryFinding(params: {
  file: WorkspaceFile;
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
  index?: number;
}): Finding {
  return createFinding({
    ruleId: "invalid-suppression-entry",
    title: params.title,
    description: params.description,
    severity: "warning",
    category: "scanner-config",
    suggestion: params.suggestion,
    file: params.file,
    evidence: params.evidence,
    index: params.index,
    tags: ["scanner", "suppressions", "config"]
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
