export type Severity = "error" | "warning" | "info";
export type Verdict = "pass" | "warning" | "fail";

export interface ScanLocation {
  filePath: string;
  relativePath: string;
  line: number;
  column: number;
}

export interface Finding {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  suggestion: string;
  fingerprint: string;
  evidence?: string;
  location?: ScanLocation;
  tags: string[];
}

export interface WorkspaceFile {
  filePath: string;
  relativePath: string;
  content: string;
  size: number;
  basename: string;
  extension: string;
}

export interface LoadedWorkspace {
  workspacePath: string;
  files: WorkspaceFile[];
  fileMap: Map<string, WorkspaceFile>;
}

export interface ScanOptions {
  maxFileSizeBytes: number;
  maxFiles: number;
  useSuppressions: boolean;
  includeSuppressedFindings: boolean;
  suppressionsFileName: string;
  suppressionsFilePath?: string;
}

export interface ScanSummary {
  filesScanned: number;
  errors: number;
  warnings: number;
  info: number;
  suppressed: number;
}

export interface FindingSuppression {
  ruleId?: string;
  path?: string;
  fingerprint?: string;
  reason?: string;
  expiresOn?: string;
}

export interface LoadedSuppressions {
  filePath?: string;
  suppressions: FindingSuppression[];
  diagnosticFindings: Finding[];
}

export interface ScanReport {
  productName: "MCP Preflight";
  workspacePath: string;
  generatedAt: string;
  verdict: Verdict;
  summary: ScanSummary;
  findings: Finding[];
  suppressedFindings: Finding[];
  suppressionFilePath?: string;
}
