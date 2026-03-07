import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPublicKey, verify as verifySignature } from "node:crypto";

import { PRODUCT_URLS } from "./product";
import type {
  LicensePayload,
  LicenseSource,
  LicenseStatus,
  ProFeature,
  ResolvedLicense,
  ScanOptions
} from "./types";

export const ALL_PRO_FEATURES: ProFeature[] = [
  "reports",
  "suppressions",
  "ci",
  "hooks",
  "policy-presets"
];

export const DEFAULT_LICENSE_DIRECTORY_NAME = ".mcp-preflight";
export const DEFAULT_LICENSE_FILE_NAME = "license.token";

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAtDDA2GIfquH4OcmOj9Uth4zgKG+rw7mrtPUJWgP247s=
-----END PUBLIC KEY-----`;

const LICENSE_PUBLIC_KEY = createPublicKey(LICENSE_PUBLIC_KEY_PEM);

export async function resolveLicense(
  options: Pick<ScanOptions, "licenseToken" | "licenseFilePath"> = {}
): Promise<ResolvedLicense> {
  const directToken = options.licenseToken?.trim();

  if (directToken) {
    return verifyLicenseToken(directToken, {
      source: "direct"
    });
  }

  const envToken = process.env.MCP_PREFLIGHT_LICENSE?.trim();

  if (envToken) {
    return verifyLicenseToken(envToken, {
      source: "env-token"
    });
  }

  const { filePath, source } = resolveLicenseFileReference(options.licenseFilePath);

  try {
    const token = (await readFile(filePath, "utf8")).trim();

    if (!token) {
      return createLiteLicense({
        status: "invalid",
        source,
        installPath: filePath,
        reason: "The local license file is empty."
      });
    }

    return verifyLicenseToken(token, {
      source,
      installPath: filePath
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createLiteLicense({
        status: "missing",
        source,
        installPath: filePath
      });
    }

    return createLiteLicense({
      status: "invalid",
      source,
      installPath: filePath,
      reason: `The local license file could not be read: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

export function verifyLicenseToken(
  token: string,
  context: {
    source: LicenseSource;
    installPath?: string;
  } = {
    source: "direct"
  }
): ResolvedLicense {
  const segments = token.split(".");

  if (segments.length !== 2) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token format is invalid."
    });
  }

  const [payloadSegment, signatureSegment] = segments;

  if (!payloadSegment || !signatureSegment) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token is incomplete."
    });
  }

  let payloadBuffer: Buffer;
  let signatureBuffer: Buffer;

  try {
    payloadBuffer = decodeBase64Url(payloadSegment);
    signatureBuffer = decodeBase64Url(signatureSegment);
  } catch {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token is not valid base64url data."
    });
  }

  const signatureIsValid = verifySignature(
    null,
    Buffer.from(payloadSegment, "utf8"),
    LICENSE_PUBLIC_KEY,
    signatureBuffer
  );

  if (!signatureIsValid) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token signature is invalid."
    });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token payload is not valid JSON."
    });
  }

  if (!isLicensePayload(payload)) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token payload is missing required fields."
    });
  }

  if (payload.product !== "mcp-preflight" || payload.edition !== "pro") {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token is not for MCP Preflight Pro."
    });
  }

  if (!isIsoDate(payload.issuedAt)) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token has an invalid issuedAt value."
    });
  }

  if (payload.expiresAt && !isIsoDate(payload.expiresAt)) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token has an invalid expiresAt value."
    });
  }

  if (payload.updatesUntil && !isIsoDate(payload.updatesUntil)) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token has an invalid updatesUntil value."
    });
  }

  const featureSet = normalizeFeatureSet(payload.features);

  if (featureSet.length === 0) {
    return createLiteLicense({
      status: "invalid",
      source: context.source,
      installPath: context.installPath,
      reason: "The license token does not grant any recognized Pro features."
    });
  }

  if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    return {
      status: "expired",
      tier: "lite",
      featureSet: [],
      source: context.source,
      installPath: context.installPath,
      licenseId: payload.licenseId,
      customer: payload.customer,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      updatesUntil: payload.updatesUntil,
      reason: `The MCP Preflight Pro license expired on ${payload.expiresAt}.`
    };
  }

  return {
    status: "valid",
    tier: "pro",
    featureSet,
    source: context.source,
    installPath: context.installPath,
    licenseId: payload.licenseId,
    customer: payload.customer,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    updatesUntil: payload.updatesUntil
  };
}

export async function installLicenseToken(
  token: string,
  options: Pick<ScanOptions, "licenseFilePath"> = {}
): Promise<ResolvedLicense> {
  const { filePath } = resolveLicenseFileReference(options.licenseFilePath);
  const license = verifyLicenseToken(token.trim(), {
    source: "direct",
    installPath: filePath
  });

  if (license.status !== "valid") {
    throw new Error(license.reason ?? "The MCP Preflight Pro license token is invalid.");
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${token.trim()}\n`, "utf8");

  return {
    ...license,
    source: options.licenseFilePath ? "explicit-file" : "default-file",
    installPath: filePath
  };
}

export async function removeInstalledLicense(
  options: Pick<ScanOptions, "licenseFilePath"> = {}
): Promise<string | undefined> {
  const { filePath } = resolveLicenseFileReference(options.licenseFilePath);

  try {
    await rm(filePath);
    return filePath;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export function hasProFeature(license: ResolvedLicense, feature: ProFeature): boolean {
  return license.status === "valid" && license.featureSet.includes(feature);
}

export function getProFeatureLabel(feature: ProFeature): string {
  switch (feature) {
    case "reports":
      return "Markdown, HTML, and SARIF reports";
    case "suppressions":
      return "suppression files";
    case "ci":
      return "CI mode";
    case "hooks":
      return "Git hooks";
    case "policy-presets":
      return "policy presets";
    default:
      return "Pro features";
  }
}

export function getProFeatureMessage(feature: ProFeature, license: ResolvedLicense): string {
  const label = getProFeatureLabel(feature);

  switch (license.status) {
    case "valid":
      return `${label} are available.`;
    case "expired":
      return `The installed MCP Preflight Pro license has expired, so ${label} are unavailable. Details: ${PRODUCT_URLS.upgrade}`;
    case "invalid":
      return `The installed MCP Preflight Pro license is invalid, so ${label} are unavailable. Details: ${PRODUCT_URLS.upgrade}`;
    default:
      return `${label} require MCP Preflight Pro. Install a local Pro license to unlock them. Details: ${PRODUCT_URLS.upgrade}`;
  }
}

export function formatLicenseStatus(license: ResolvedLicense): string {
  if (license.status === "valid") {
    const details = [
      "MCP Preflight Pro is active.",
      license.licenseId ? `License: ${license.licenseId}` : undefined,
      license.customer ? `Customer: ${license.customer}` : undefined,
      license.updatesUntil ? `Updates until: ${license.updatesUntil}` : undefined,
      `Features: ${license.featureSet.join(", ")}`
    ].filter((line): line is string => Boolean(line));

    return details.join("\n");
  }

  if (license.status === "missing") {
    return "No local MCP Preflight Pro license is installed. Lite mode is active.";
  }

  return license.reason ?? "The local MCP Preflight Pro license could not be used.";
}

export function getDefaultLicenseFilePath(): string {
  return path.join(os.homedir(), DEFAULT_LICENSE_DIRECTORY_NAME, DEFAULT_LICENSE_FILE_NAME);
}

function resolveLicenseFileReference(explicitFilePath?: string): {
  filePath: string;
  source: LicenseSource;
} {
  if (explicitFilePath) {
    return {
      filePath: path.resolve(explicitFilePath),
      source: "explicit-file"
    };
  }

  const envFilePath = process.env.MCP_PREFLIGHT_LICENSE_FILE?.trim();

  if (envFilePath) {
    return {
      filePath: path.resolve(envFilePath),
      source: "env-file"
    };
  }

  return {
    filePath: getDefaultLicenseFilePath(),
    source: "default-file"
  };
}

function normalizeFeatureSet(features: ProFeature[] | undefined): ProFeature[] {
  if (!features || features.length === 0) {
    return [...ALL_PRO_FEATURES];
  }

  const normalized = Array.from(
    new Set(features.filter((feature): feature is ProFeature => ALL_PRO_FEATURES.includes(feature)))
  );

  return normalized;
}

function createLiteLicense(params: {
  status: LicenseStatus;
  source: LicenseSource;
  installPath?: string;
  reason?: string;
}): ResolvedLicense {
  return {
    status: params.status,
    tier: "lite",
    featureSet: [],
    source: params.source,
    installPath: params.installPath,
    reason: params.reason
  };
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = normalized.length % 4;
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function isLicensePayload(value: unknown): value is LicensePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload.product === "mcp-preflight" &&
    payload.edition === "pro" &&
    typeof payload.licenseId === "string" &&
    payload.licenseId.trim().length > 0 &&
    typeof payload.issuedAt === "string" &&
    (payload.customer === undefined || typeof payload.customer === "string") &&
    (payload.expiresAt === undefined || typeof payload.expiresAt === "string") &&
    (payload.updatesUntil === undefined || typeof payload.updatesUntil === "string") &&
    (payload.features === undefined ||
      (Array.isArray(payload.features) &&
        payload.features.every((feature) => typeof feature === "string")))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
