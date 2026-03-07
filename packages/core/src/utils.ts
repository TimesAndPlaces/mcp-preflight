import { createHash } from "node:crypto";
import path from "node:path";

import type { Finding, ScanLocation, Severity, WorkspaceFile } from "./types";

const severityOrder: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2
};

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function getLineColumn(content: string, index: number): { line: number; column: number } {
  const safeIndex = Math.max(0, Math.min(index, content.length));
  const linesBefore = content.slice(0, safeIndex).split(/\r?\n/);
  const line = linesBefore.length;
  const column = (linesBefore.at(-1)?.length ?? 0) + 1;

  return { line, column };
}

export function locateMatch(file: WorkspaceFile, index: number): ScanLocation {
  const { line, column } = getLineColumn(file.content, index);
  return {
    filePath: file.filePath,
    relativePath: file.relativePath,
    line,
    column
  };
}

export function locateFileStart(file: WorkspaceFile): ScanLocation {
  return {
    filePath: file.filePath,
    relativePath: file.relativePath,
    line: 1,
    column: 1
  };
}

export function createFinding(params: {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  suggestion: string;
  file: WorkspaceFile;
  evidence?: string;
  index?: number;
  location?: ScanLocation;
  tags?: string[];
}): Finding {
  const location =
    params.location ??
    (typeof params.index === "number" && params.index >= 0
      ? locateMatch(params.file, params.index)
      : locateFileStart(params.file));

  return {
    ruleId: params.ruleId,
    title: params.title,
    description: params.description,
    severity: params.severity,
    category: params.category,
    suggestion: params.suggestion,
    fingerprint: createFindingFingerprint(
      params.ruleId,
      location.relativePath,
      params.evidence ?? params.title,
      params.category
    ),
    evidence: params.evidence,
    location,
    tags: params.tags ?? []
  };
}

export function createFindingFingerprint(
  ruleId: string,
  relativePath: string,
  basis: string,
  category: string
): string {
  const normalizedBasis = basis.replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${ruleId}|${category}|${relativePath}|${normalizedBasis}`)
    .digest("hex")
    .slice(0, 16);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const leftPath = left.location?.relativePath ?? "";
    const rightPath = right.location?.relativePath ?? "";
    const fileDelta = leftPath.localeCompare(rightPath);

    if (fileDelta !== 0) {
      return fileDelta;
    }

    return (left.location?.line ?? 0) - (right.location?.line ?? 0);
  });
}

export function uniqueFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];

  for (const finding of findings) {
    const key = [
      finding.ruleId,
      finding.severity,
      finding.location?.relativePath ?? "",
      finding.location?.line ?? "",
      finding.evidence ?? ""
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(finding);
  }

  return result;
}
