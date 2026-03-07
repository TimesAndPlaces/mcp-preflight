export type Severity = "error" | "warning" | "info";
export type Verdict = "pass" | "warning" | "fail";
export type ProFeature = "reports" | "suppressions" | "ci" | "hooks" | "policy-presets";
export type LicenseStatus = "missing" | "valid" | "invalid" | "expired";
export type LicenseSource = "direct" | "env-token" | "env-file" | "default-file" | "explicit-file";
export type PolicyPreset = "balanced" | "strict";
export type ActivitySurface = "cli" | "vscode-extension";
export type ActivityScanMode = "workspace" | "focused" | "ci";
export type ActivityEventType =
  | "scan-completed"
  | "pro-feature-blocked"
  | "license-installed"
  | "license-install-failed"
  | "license-removed"
  | "license-status-checked"
  | "upgrade-opened"
  | "review-opened"
  | "support-opened";
export type ActivityDestination = "upgrade" | "marketplace" | "openvsx" | "discussions" | "issues";

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
  focusFilePaths?: string[];
  licenseToken?: string;
  licenseFilePath?: string;
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

export interface ScanNotice {
  code: string;
  severity: "warning" | "info";
  message: string;
  suggestion?: string;
}

export interface LicensePayload {
  product: "mcp-preflight";
  edition: "pro";
  licenseId: string;
  customer?: string;
  issuedAt: string;
  expiresAt?: string;
  updatesUntil?: string;
  features?: ProFeature[];
}

export interface ResolvedLicense {
  status: LicenseStatus;
  tier: "lite" | "pro";
  featureSet: ProFeature[];
  source: LicenseSource;
  installPath?: string;
  licenseId?: string;
  customer?: string;
  issuedAt?: string;
  expiresAt?: string;
  updatesUntil?: string;
  reason?: string;
}

export interface PolicyEvaluation {
  preset: PolicyPreset;
  failOn: "error" | "warning";
  passed: boolean;
  message: string;
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
  notices: ScanNotice[];
}

export interface ActivityEvent {
  type: ActivityEventType;
  recordedAt: string;
  surface: ActivitySurface;
  scanMode?: ActivityScanMode;
  verdict?: Verdict;
  durationMs?: number;
  filesScanned?: number;
  errors?: number;
  warnings?: number;
  info?: number;
  suppressed?: number;
  feature?: ProFeature;
  licenseStatus?: LicenseStatus;
  destination?: ActivityDestination;
}

export type ActivityEventInput = Omit<ActivityEvent, "recordedAt">;

export interface ActivitySummary {
  enabled: boolean;
  filePath: string;
  eventsRecorded: number;
  firstRecordedAt?: string;
  lastRecordedAt?: string;
  scans: {
    total: number;
    workspace: number;
    focused: number;
    ci: number;
    pass: number;
    warning: number;
    fail: number;
    avgDurationMs?: number;
  };
  blockedFeatures: Record<ProFeature, number>;
  upgradesOpened: number;
  reviewsOpened: number;
  supportOpens: number;
  licenseInstalls: number;
  licenseInstallFailures: number;
  licenseRemovals: number;
  licenseStatusChecks: number;
}
