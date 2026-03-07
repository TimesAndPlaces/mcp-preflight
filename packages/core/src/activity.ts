import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ActivityEvent,
  ActivityEventInput,
  ActivitySummary,
  ProFeature
} from "./types";

const DISABLE_ACTIVITY_VALUES = new Set(["1", "true", "yes", "on"]);

export const DEFAULT_ACTIVITY_DIRECTORY_NAME = ".mcp-preflight";
export const DEFAULT_ACTIVITY_FILE_NAME = "activity-log.jsonl";

export function getDefaultActivityFilePath(): string {
  return path.join(os.homedir(), DEFAULT_ACTIVITY_DIRECTORY_NAME, DEFAULT_ACTIVITY_FILE_NAME);
}

export function resolveActivityFilePath(activityFilePath?: string): string {
  if (activityFilePath?.trim()) {
    return path.resolve(activityFilePath.trim());
  }

  const envActivityFilePath = process.env.MCP_PREFLIGHT_ACTIVITY_FILE?.trim();

  if (envActivityFilePath) {
    return path.resolve(envActivityFilePath);
  }

  return getDefaultActivityFilePath();
}

export function isActivityTrackingEnabled(): boolean {
  const rawValue = process.env.MCP_PREFLIGHT_DISABLE_ACTIVITY?.trim().toLowerCase();

  if (!rawValue) {
    return true;
  }

  return !DISABLE_ACTIVITY_VALUES.has(rawValue);
}

export async function recordActivity(
  event: ActivityEventInput,
  activityFilePath?: string
): Promise<boolean> {
  if (!isActivityTrackingEnabled()) {
    return false;
  }

  const filePath = resolveActivityFilePath(activityFilePath);
  const entry: ActivityEvent = {
    ...event,
    recordedAt: new Date().toISOString()
  };

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function loadActivityLog(activityFilePath?: string): Promise<ActivityEvent[]> {
  const filePath = resolveActivityFilePath(activityFilePath);

  try {
    const content = await readFile(filePath, "utf8");

    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => parseActivityLine(line));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function exportActivitySnapshot(activityFilePath?: string): Promise<{
  summary: ActivitySummary;
  events: ActivityEvent[];
}> {
  const events = await loadActivityLog(activityFilePath);

  return {
    summary: summarizeActivity(events, activityFilePath),
    events
  };
}

export async function getActivitySummary(activityFilePath?: string): Promise<ActivitySummary> {
  const events = await loadActivityLog(activityFilePath);
  return summarizeActivity(events, activityFilePath);
}

export async function resetActivityLog(activityFilePath?: string): Promise<boolean> {
  const filePath = resolveActivityFilePath(activityFilePath);

  try {
    await rm(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function summarizeActivity(
  events: ActivityEvent[],
  activityFilePath?: string
): ActivitySummary {
  const summary: ActivitySummary = {
    enabled: isActivityTrackingEnabled(),
    filePath: resolveActivityFilePath(activityFilePath),
    eventsRecorded: events.length,
    scans: {
      total: 0,
      workspace: 0,
      focused: 0,
      ci: 0,
      pass: 0,
      warning: 0,
      fail: 0
    },
    blockedFeatures: createFeatureCounter(),
    upgradesOpened: 0,
    reviewsOpened: 0,
    supportOpens: 0,
    licenseInstalls: 0,
    licenseInstallFailures: 0,
    licenseRemovals: 0,
    licenseStatusChecks: 0
  };

  let totalScanDurationMs = 0;
  let scansWithDuration = 0;

  for (const event of events) {
    summary.firstRecordedAt ??= event.recordedAt;
    summary.lastRecordedAt = event.recordedAt;

    switch (event.type) {
      case "scan-completed":
        summary.scans.total += 1;
        if (event.scanMode === "workspace") {
          summary.scans.workspace += 1;
        } else if (event.scanMode === "focused") {
          summary.scans.focused += 1;
        } else if (event.scanMode === "ci") {
          summary.scans.ci += 1;
        }

        if (event.verdict === "pass") {
          summary.scans.pass += 1;
        } else if (event.verdict === "warning") {
          summary.scans.warning += 1;
        } else if (event.verdict === "fail") {
          summary.scans.fail += 1;
        }

        if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs) && event.durationMs >= 0) {
          totalScanDurationMs += event.durationMs;
          scansWithDuration += 1;
        }
        break;
      case "pro-feature-blocked":
        if (event.feature) {
          summary.blockedFeatures[event.feature] += 1;
        }
        break;
      case "license-installed":
        summary.licenseInstalls += 1;
        break;
      case "license-install-failed":
        summary.licenseInstallFailures += 1;
        break;
      case "license-removed":
        summary.licenseRemovals += 1;
        break;
      case "license-status-checked":
        summary.licenseStatusChecks += 1;
        break;
      case "upgrade-opened":
        summary.upgradesOpened += 1;
        break;
      case "review-opened":
        summary.reviewsOpened += 1;
        break;
      case "support-opened":
        summary.supportOpens += 1;
        break;
      default:
        break;
    }
  }

  if (scansWithDuration > 0) {
    summary.scans.avgDurationMs = Math.round(totalScanDurationMs / scansWithDuration);
  }

  return summary;
}

export function formatActivitySummary(summary: ActivitySummary): string {
  const lines = [
    "MCP Preflight local activity",
    `Status: ${summary.enabled ? "enabled" : "disabled"}`,
    `Path: ${summary.filePath}`
  ];

  if (!summary.enabled) {
    lines.push(
      "Local activity is disabled. Unset `MCP_PREFLIGHT_DISABLE_ACTIVITY` to record future scan and workflow events."
    );
    return lines.join("\n");
  }

  if (summary.eventsRecorded === 0) {
    lines.push("No local activity has been recorded yet.");
    return lines.join("\n");
  }

  lines.push(`Events recorded: ${summary.eventsRecorded}`);

  if (summary.firstRecordedAt) {
    lines.push(`First recorded: ${summary.firstRecordedAt}`);
  }

  if (summary.lastRecordedAt) {
    lines.push(`Last recorded: ${summary.lastRecordedAt}`);
  }

  lines.push(
    `Scans: ${summary.scans.total} total (${summary.scans.workspace} workspace, ${summary.scans.focused} focused, ${summary.scans.ci} CI)`
  );
  lines.push(
    `Verdicts: ${summary.scans.pass} pass, ${summary.scans.warning} warning, ${summary.scans.fail} fail`
  );

  if (typeof summary.scans.avgDurationMs === "number") {
    lines.push(`Average scan duration: ${formatDuration(summary.scans.avgDurationMs)}`);
  }

  const blockedFeatureLines = Object.entries(summary.blockedFeatures)
    .filter(([, count]) => count > 0)
    .map(([feature, count]) => `${feature}: ${count}`);

  lines.push(
    blockedFeatureLines.length > 0
      ? `Blocked Pro features: ${blockedFeatureLines.join(", ")}`
      : "Blocked Pro features: none recorded"
  );
  lines.push(`Upgrade page opens: ${summary.upgradesOpened}`);
  lines.push(`Review page opens: ${summary.reviewsOpened}`);
  lines.push(`Support page opens: ${summary.supportOpens}`);
  lines.push(`License installs: ${summary.licenseInstalls}`);
  lines.push(`License install failures: ${summary.licenseInstallFailures}`);
  lines.push(`License removals: ${summary.licenseRemovals}`);
  lines.push(`License status checks: ${summary.licenseStatusChecks}`);

  return lines.join("\n");
}

function parseActivityLine(line: string): ActivityEvent[] {
  try {
    const value = JSON.parse(line) as unknown;
    return isActivityEvent(value) ? [value] : [];
  } catch {
    return [];
  }
}

function createFeatureCounter(): Record<ProFeature, number> {
  return {
    reports: 0,
    suppressions: 0,
    ci: 0,
    hooks: 0,
    "policy-presets": 0
  };
}

function formatDuration(durationMs: number): string {
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(1)}s`;
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.type === "string" &&
    typeof event.recordedAt === "string" &&
    typeof event.surface === "string"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
