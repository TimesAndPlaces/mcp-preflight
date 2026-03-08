import {
  findNodeAtLocation,
  parse,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError
} from "jsonc-parser";

import type { Finding, LoadedWorkspace, ScanLocation } from "../types";
import { createFinding, locateMatch } from "../utils";

type ConfigPath = Array<string | number>;

interface ServerContext {
  file: LoadedWorkspace["files"][number];
  tree?: Node;
  serverName: string;
  serverConfig: Record<string, unknown>;
  basePath: ConfigPath;
}

const MCP_CONFIG_SUFFIXES = [
  ".vscode/mcp.json",
  "mcp.json",
  ".mcp.json",
  ".cursor/mcp.json",
  ".windsurf/mcp.json"
];
const MCP_SETTINGS_SUFFIXES = [
  ".vscode/settings.json",
  ".cursor/settings.json",
  ".windsurf/settings.json"
];

const SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "cmd", "powershell", "pwsh"]);
const PATH_FLAGS = new Set(["--allow-path", "--path", "--root", "--dir", "--cwd"]);
const NETWORK_FLAGS = new Set(["--network", "--allow-network", "--egress", "--allow-egress"]);
const ENV_INHERITANCE_FLAGS = ["inheritEnv", "inheritEnvironment", "forwardAllEnv", "passEnvironment"];
const PASS_THROUGH_ENV_KEYS = ["passThroughEnv", "forwardEnv", "allowedEnv", "allowEnv"];
const EPHEMERAL_LAUNCHERS = new Set(["npx", "bunx", "uvx"]);
const AUTH_CONFIG_KEYS = ["auth", "authentication", "authorization"];
const EXPLICIT_SERVER_ID_KEYS = ["id", "serverId"];
const SENSITIVE_ENV_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN",
  "SLACK_BOT_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AZURE_OPENAI_API_KEY",
  "GOOGLE_API_KEY"
];
const GENERIC_SERVER_IDS = new Set(["server", "mcp", "default", "test", "example", "sample", "myserver"]);

export function scanMcpConfigurationRisks(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];

  for (const file of workspace.files) {
    if (!isPotentialMcpConfigFile(file)) {
      continue;
    }

    const parseErrors: ParseError[] = [];
    const parsed = parse(file.content, parseErrors) as unknown;
    const tree = parseTree(file.content);

    if (parseErrors.length > 0) {
      const firstParseError = parseErrors[0];

      if (firstParseError) {
        findings.push(
          createFinding({
            ruleId: "invalid-mcp-config",
            title: "MCP config contains invalid JSON",
            description:
              "The MCP config could not be parsed cleanly. Invalid config files should be fixed before the server is trusted or shared.",
            severity: "warning",
            category: "config-integrity",
            suggestion: "Fix the JSON syntax error in the MCP config and rerun the scan.",
            file,
            evidence: printParseErrorCode(firstParseError.error),
            location: locateMatch(file, firstParseError.offset),
            tags: ["lite", "mcp", "config"]
          })
        );
      }
    }

    if (!isRecord(parsed)) {
      continue;
    }

    const serverContexts = collectServerContexts(file, tree, parsed);

    for (const context of serverContexts) {
      findings.push(...scanServerIdReadiness(context));
      findings.push(...scanUnsafeShellWrappers(context));
      findings.push(...scanEphemeralLaunchers(context));
      findings.push(...scanSandboxGuidance(context));
      findings.push(...scanTokenPassthrough(context));
      findings.push(...scanEnvironmentInheritance(context));
      findings.push(...scanTransportAndAuth(context));
      findings.push(...scanExplicitRemoteAuthDisablement(context));
      findings.push(...scanScopeRisks(context));
    }
  }

  return findings;
}

function scanEphemeralLaunchers(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const command = typeof context.serverConfig.command === "string" ? context.serverConfig.command : "";
  const args = asStringArray(context.serverConfig.args);
  const joined = [command, ...args].join(" ").trim();
  const usesEphemeralLauncher =
    EPHEMERAL_LAUNCHERS.has(command.toLowerCase()) ||
    (command.toLowerCase() === "pnpm" && args[0] === "dlx") ||
    (command.toLowerCase() === "yarn" && args[0] === "dlx") ||
    (command.toLowerCase() === "npm" && args[0] === "exec");

  if (!usesEphemeralLauncher) {
    return findings;
  }

  const launcherTarget = resolveEphemeralLauncherTarget(command, args);
  const usesPinnedVersion = hasExactPackageVersion(launcherTarget.packageSpec);
  const location = launcherTarget.argIndex !== undefined
    ? getContextLocation(context, ["args", launcherTarget.argIndex], ["command"])
    : getContextLocation(context, ["command"]);

  findings.push(
    createFinding({
      ruleId: usesPinnedVersion ? "pinned-ephemeral-mcp-launcher" : "ephemeral-mcp-launcher",
      title: usesPinnedVersion
        ? "MCP server uses a pinned ephemeral package launcher"
        : "MCP server uses an unpinned ephemeral package launcher",
      description: usesPinnedVersion
        ? `Server "${context.serverName}" is launched through an on-demand package runner with an exact package version. That is easier to review than a floating quickstart, but it still leaves less local audit trail than a reviewed local install or binary.`
        : `Server "${context.serverName}" is launched through an on-demand package runner without an exact package version. Quickstarts often use this pattern, but daily use increases supply-chain drift and makes the exact executable harder to verify.`,
      severity: usesPinnedVersion ? "info" : "warning",
      category: "supply-chain",
      suggestion: usesPinnedVersion
        ? "Keep the package pinned to an exact version and review what that version does. For steadier workflows, prefer a reviewed local install or binary."
        : "Pin the server package to an exact version or switch to a reviewed local install or binary before trusting it in a daily workflow.",
      file: context.file,
      evidence: joined,
      location,
      tags: ["lite", "mcp", "supply-chain"]
    })
  );

  return findings;
}

function resolveEphemeralLauncherTarget(
  command: string,
  args: string[]
): { packageSpec?: string; argIndex?: number } {
  const lowerCommand = command.toLowerCase();
  let startIndex = 0;

  if ((lowerCommand === "pnpm" || lowerCommand === "yarn") && args[0] === "dlx") {
    startIndex = 1;
  } else if (lowerCommand === "npm" && args[0] === "exec") {
    startIndex = 1;
  }

  for (let index = startIndex; index < args.length; index += 1) {
    const value = args[index];

    if (!value || value === "--") {
      break;
    }

    if (value === "--package" || value === "-p") {
      const packageSpec = args[index + 1];
      return packageSpec ? { packageSpec, argIndex: index + 1 } : {};
    }

    if (value.startsWith("-")) {
      continue;
    }

    return {
      packageSpec: value,
      argIndex: index
    };
  }

  return {};
}

function hasExactPackageVersion(packageSpec: string | undefined): boolean {
  if (!packageSpec) {
    return false;
  }

  const versionSeparator = findVersionSeparator(packageSpec);

  if (versionSeparator < 0) {
    return false;
  }

  const version = packageSpec.slice(versionSeparator + 1);
  return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function findVersionSeparator(packageSpec: string): number {
  if (packageSpec.startsWith("@")) {
    const slashIndex = packageSpec.indexOf("/");

    if (slashIndex < 0) {
      return -1;
    }

    return packageSpec.indexOf("@", slashIndex + 1);
  }

  return packageSpec.indexOf("@");
}

function scanUnsafeShellWrappers(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const command = typeof context.serverConfig.command === "string" ? context.serverConfig.command : "";
  const args = asStringArray(context.serverConfig.args);
  const joined = [command, ...args].join(" ").trim();
  const shellArgIndex = args.findIndex((value) => value === "-c" || value === "/c");
  const bootstrapArgIndex = args.findIndex(
    (value) =>
      /(curl|wget)[^|]*(\||\|\|).*\b(sh|bash|zsh)\b/i.test(value) ||
      /\b(powershell|pwsh)\b[^\n]*\s(-enc|-encodedcommand)\b/i.test(value)
  );

  if (
    SHELL_WRAPPERS.has(command.toLowerCase()) ||
    shellArgIndex >= 0 ||
    /(curl|wget)[^|]*(\||\|\|).*\b(sh|bash|zsh)\b/i.test(joined) ||
    /\b(powershell|pwsh)\b[^\n]*\s(-enc|-encodedcommand)\b/i.test(joined)
  ) {
    findings.push(
      createFinding({
        ruleId: "unsafe-shell-wrapper",
        title: "MCP server launch uses a shell wrapper or bootstrap command",
        description: `Server "${context.serverName}" is launched through a shell wrapper or risky bootstrap chain. That makes the effective behavior harder to review and increases local compromise risk.`,
        severity: "error",
        category: "unsafe-primitives",
        suggestion: "Launch the reviewed executable directly and avoid `sh -c`, `cmd /c`, or download-and-execute patterns in MCP config.",
        file: context.file,
        evidence: joined,
        location: getContextLocation(
          context,
          bootstrapArgIndex >= 0 ? ["args", bootstrapArgIndex] : undefined,
          shellArgIndex >= 0 ? ["args", shellArgIndex] : undefined,
          ["command"]
        ),
        tags: ["lite", "mcp", "shell"]
      })
    );
  }

  return findings;
}

function scanEnvironmentInheritance(context: ServerContext): Finding[] {
  const findings: Finding[] = [];

  for (const key of ENV_INHERITANCE_FLAGS) {
    if (context.serverConfig[key] === true) {
      findings.push(
        createFinding({
          ruleId: "overbroad-env-inheritance",
          title: "MCP server inherits the host environment broadly",
          description: `Server "${context.serverName}" enables ${key}=true, which can expose unrelated credentials and widen confused-deputy risk.`,
          severity: "warning",
          category: "scope-minimization",
          suggestion: `Set ${key} to false, then move only the variables this server actually needs into "env" or an explicit allowlist such as "allowedEnv".`,
          file: context.file,
          evidence: `${key}=true`,
          location: getContextLocation(context, [key]),
          tags: ["lite", "mcp", "credentials"]
        })
      );
    }
  }

  for (const key of PASS_THROUGH_ENV_KEYS) {
    const value = context.serverConfig[key];
    const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const wildcardIndex = values.findIndex((entry) => entry === "*");
    const sensitiveEntries = values
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => SENSITIVE_ENV_NAMES.includes(entry.toUpperCase()));

    if (wildcardIndex < 0) {
      for (const { entry, index } of sensitiveEntries) {
        findings.push(
          createFinding({
            ruleId: "token-passthrough",
            title: "MCP server forwards a sensitive host credential by name",
            description: `Server "${context.serverName}" forwards "${entry}" through ${key}. Passing named host credentials directly into the MCP server weakens scope minimization.`,
            severity: "warning",
            category: "scope-minimization",
            suggestion: `Stop forwarding ${entry} directly through ${key}. Prefer a dedicated server-specific credential, or map a narrower secret into "env" under a server-specific name.`,
            file: context.file,
            evidence: `${key}=["${entry}"]`,
            location: getContextLocation(context, [key, index], [key]),
            tags: ["lite", "mcp", "credentials"]
          })
        );
      }

      continue;
    }

    findings.push(
      createFinding({
        ruleId: "overbroad-env-inheritance",
        title: "MCP server allows wildcard environment forwarding",
        description: `Server "${context.serverName}" forwards environment variables using a wildcard selector under ${key}. That is broader than necessary for most MCP servers.`,
        severity: "warning",
        category: "scope-minimization",
        suggestion: `Replace "*" in ${key} with a short explicit list such as ["MCP_SERVER_TOKEN"] or another server-specific credential name.`,
        file: context.file,
        evidence: `${key}=["*"]`,
        location: getContextLocation(context, [key, wildcardIndex], [key]),
        tags: ["lite", "mcp", "credentials"]
      })
    );
  }

  return findings;
}

function scanTokenPassthrough(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const env = isRecord(context.serverConfig.env) ? context.serverConfig.env : undefined;

  if (!env) {
    return findings;
  }

  for (const [key, value] of Object.entries(env)) {
    const rendered = `${key}=${String(value)}`;
    const referencesSensitiveEnv =
      SENSITIVE_ENV_NAMES.includes(key) ||
      SENSITIVE_ENV_NAMES.some((candidate) => rendered.includes(candidate));

    if (!referencesSensitiveEnv) {
      continue;
    }

    findings.push(
      createFinding({
        ruleId: "token-passthrough",
        title: "MCP server receives a broad credential from the host environment",
        description: `Server "${context.serverName}" forwards "${key}" from the host environment. Broad token pass-through weakens scope minimization and increases confused-deputy risk.`,
        severity: "warning",
        category: "scope-minimization",
        suggestion: `Avoid passing ${key} straight through from the host. Create a server-specific env entry such as MCP_SERVER_TOKEN and source it from a narrower credential instead.`,
        file: context.file,
        evidence: rendered,
        location: getContextLocation(context, ["env", key], ["env"]),
        tags: ["lite", "mcp", "credentials"]
      })
    );
  }

  return findings;
}

function scanTransportAndAuth(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const remoteEndpoint = getRemoteEndpoint(context.serverConfig);

  if (!remoteEndpoint) {
    return findings;
  }

  const { url, path } = remoteEndpoint;
  const credentialsInUrl = hasCredentialsInUrl(url);
  const location = getContextLocation(context, [path]);

  if (url.startsWith("http://")) {
    findings.push(
      createFinding({
        ruleId: "insecure-remote-transport",
        title: "Remote MCP server uses insecure transport",
        description: `Server "${context.serverName}" points to "${url}", which uses plain HTTP and can expose credentials or requests to interception.`,
        severity: "error",
        category: "transport",
        suggestion: "Use HTTPS for the remote MCP endpoint, verify the server identity, and keep auth in headers or env-backed config instead of plaintext transport.",
        file: context.file,
        evidence: url,
        location,
        tags: ["lite", "mcp", "transport"]
      })
    );
  }

  const remoteTargetSeverity = getSensitiveRemoteTargetSeverity(url);

  if (remoteTargetSeverity) {
    findings.push(
      createFinding({
        ruleId: "sensitive-remote-target",
        title: "Remote MCP server targets a local or sensitive network address",
        description: `Server "${context.serverName}" points to "${url}", which resolves to localhost or an internal network range that deserves explicit review.`,
        severity: remoteTargetSeverity,
        category: "network-abuse",
        suggestion: "Avoid local or sensitive network targets unless they are explicitly intended and tightly scoped.",
        file: context.file,
        evidence: url,
        location,
        tags: ["lite", "mcp", "network"]
      })
    );
  }

  if (credentialsInUrl) {
    findings.push(
      createFinding({
        ruleId: "credential-in-url",
        title: "Remote MCP server URL embeds credentials or secrets",
        description: `Server "${context.serverName}" includes credentials directly in the URL. URLs are easy to leak through logs, screenshots, and shell history.`,
        severity: "error",
        category: "auth",
        suggestion: "Move the credential out of the URL. Use an Authorization header, a local secret store, or an env-backed auth field instead of userinfo or query-string secrets.",
        file: context.file,
        evidence: url,
        location,
        tags: ["lite", "mcp", "auth"]
      })
    );
  }

  if (
    !url.startsWith("http://") &&
    !credentialsInUrl &&
    !remoteTargetSeverity &&
    !hasAuthHints(context.serverConfig)
  ) {
    findings.push(
      createFinding({
        ruleId: "remote-auth-review",
        title: "Remote MCP server has no obvious auth configuration",
        description: `Server "${context.serverName}" is remote but the config does not show clear auth hints. That can be valid, but it deserves review before the endpoint is trusted.`,
        severity: "info",
        category: "auth",
        suggestion: "Document the expected auth method explicitly. Prefer a visible header or server-specific token flow over relying on ambient login state or inherited host credentials.",
        file: context.file,
        evidence: url,
        location,
        tags: ["lite", "mcp", "auth"]
      })
    );
  }

  return findings;
}

function scanExplicitRemoteAuthDisablement(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const remoteEndpoint = getRemoteEndpoint(context.serverConfig);

  if (!remoteEndpoint) {
    return findings;
  }

  for (const key of AUTH_CONFIG_KEYS) {
    const value = context.serverConfig[key];

    if (!looksLikeDisabledAuthConfig(value)) {
      continue;
    }

    findings.push(
      createFinding({
        ruleId: "remote-auth-disabled",
        title: "Remote MCP server explicitly disables authentication",
        description: `Server "${context.serverName}" appears to disable authentication via ${key}. Remote MCP servers should not rely on unauthenticated access by default.`,
        severity: "warning",
        category: "auth",
        suggestion: "Turn authentication back on, or place the endpoint behind a tightly scoped local gateway. Avoid explicit no-auth mode except on intentionally isolated loopback during development.",
        file: context.file,
        evidence: `${key}=${String(value)}`,
        location: getContextLocation(context, [key]),
        tags: ["lite", "mcp", "auth"]
      })
    );
  }

  return findings;
}

function scanScopeRisks(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const args = asStringArray(context.serverConfig.args);

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if (current && PATH_FLAGS.has(current) && next && looksOverbroadPath(next)) {
      findings.push(
        createFinding({
          ruleId: "overbroad-path-scope",
          title: "MCP server grants broad filesystem scope",
          description: `Server "${context.serverName}" is launched with ${current} ${next}, which appears to grant access to an overly broad filesystem scope.`,
          severity: "warning",
          category: "scope-minimization",
          suggestion: "Reduce allowed filesystem scope to the smallest path needed for the server to function.",
          file: context.file,
          evidence: `${current} ${next}`,
          location: getContextLocation(context, ["args", index + 1], ["args", index]),
          tags: ["lite", "filesystem", "scope"]
        })
      );
    }

    if (current && NETWORK_FLAGS.has(current) && next && next.toLowerCase() === "all") {
      findings.push(
        createFinding({
          ruleId: "overbroad-path-scope",
          title: "MCP server grants broad network scope",
          description: `Server "${context.serverName}" appears to allow unrestricted network access via ${current} ${next}.`,
          severity: "warning",
          category: "scope-minimization",
          suggestion: "Restrict egress to the minimum host set or remove unnecessary network capability entirely.",
          file: context.file,
          evidence: `${current} ${next}`,
          location: getContextLocation(context, ["args", index + 1], ["args", index]),
          tags: ["lite", "network", "scope"]
        })
      );
    }
  }

  return findings;
}

function scanSandboxGuidance(context: ServerContext): Finding[] {
  if (!looksLikeLocalStdioServer(context.serverConfig)) {
    return [];
  }

  const sandboxEnabled = context.serverConfig.sandboxEnabled;

  if (sandboxEnabled === true) {
    return [];
  }

  if (sandboxEnabled === false) {
    return [
      createFinding({
        ruleId: "stdio-sandbox-disabled",
        title: "Local stdio MCP server explicitly disables sandboxing",
        description: `Server "${context.serverName}" launches locally over stdio but sets sandboxEnabled=false. Local tools are safer when client-side sandboxing is enabled where supported.`,
        severity: "warning",
        category: "sandbox-hardening",
        suggestion:
          "Set sandboxEnabled to true where your MCP client supports it, then narrow filesystem and network allowances to the minimum this server needs.",
        file: context.file,
        evidence: "sandboxEnabled=false",
        location: getContextLocation(context, ["sandboxEnabled"], ["command"]),
        tags: ["lite", "mcp", "sandbox"]
      })
    ];
  }

  return [
    createFinding({
      ruleId: "missing-stdio-sandbox",
      title: "Local stdio MCP server has no visible sandbox guidance",
      description: `Server "${context.serverName}" launches locally over stdio but the config does not show sandboxEnabled. That deserves review before the server gets filesystem or network access on the host.`,
      severity: "info",
      category: "sandbox-hardening",
      suggestion:
        "If your MCP client supports it, add sandboxEnabled: true for this local server and review any filesystem or network allowances before using it day to day.",
      file: context.file,
      evidence: typeof context.serverConfig.command === "string" ? context.serverConfig.command : context.serverName,
      location: getContextLocation(context, ["command"]),
      tags: ["lite", "mcp", "sandbox"]
    })
  ];
}

function scanServerIdReadiness(context: ServerContext): Finding[] {
  const findings: Finding[] = [];
  const serverIdIssue = getServerIdIssue(context.serverName);

  if (serverIdIssue) {
    findings.push(
      createFinding({
        ruleId: "noncanonical-server-id",
        title: "Server ID may be awkward for allowlists or registry policy",
        description: `Server "${context.serverName}" uses an identifier that exact-match allowlists and registry policy surfaces can handle poorly because ${serverIdIssue}.`,
        severity: "info",
        category: "policy-readiness",
        suggestion:
          'Rename the server key to one stable descriptive identifier such as "filesystem", "github", or "browserTools", then keep that exact ID consistent across docs and policy.',
        file: context.file,
        evidence: context.serverName,
        location: getContextLocation(context),
        tags: ["lite", "mcp", "policy"]
      })
    );
  }

  for (const key of EXPLICIT_SERVER_ID_KEYS) {
    const value = context.serverConfig[key];

    if (typeof value !== "string" || !value.trim() || value === context.serverName) {
      continue;
    }

    findings.push(
      createFinding({
        ruleId: "server-id-mismatch",
        title: "Server declares a second identifier",
        description: `Server "${context.serverName}" also declares ${key}="${value}". That makes exact-match allowlists, registry policy, and docs harder to keep aligned.`,
        severity: "info",
        category: "config-integrity",
        suggestion:
          "Keep one canonical server identifier. Rename the config key or the explicit id so they match exactly, then use that same identifier in docs and policy.",
        file: context.file,
        evidence: `${key}=${value}`,
        location: getContextLocation(context, [key]),
        tags: ["lite", "mcp", "policy"]
      })
    );
  }

  return findings;
}

function collectServerContexts(
  file: LoadedWorkspace["files"][number],
  tree: Node | undefined,
  root: Record<string, unknown>
): ServerContext[] {
  const contexts = new Map<string, ServerContext>();

  if (isRecord(root.servers)) {
    addServerContexts(contexts, file, tree, root.servers, ["servers"]);
  }

  if (looksLikeServerConfig(root)) {
    contexts.set(
      "default",
      {
        file,
        tree,
        serverName: "default",
        serverConfig: root,
        basePath: []
      }
    );
  }

  collectNestedServerContexts(contexts, file, tree, root, [], false);
  return [...contexts.values()];
}

function getRemoteEndpoint(config: Record<string, unknown>): { url: string; path: string } | undefined {
  for (const key of ["url", "endpoint", "baseUrl"] as const) {
    const candidate = config[key];

    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
      return { url: candidate, path: key };
    }
  }

  return undefined;
}

function hasAuthHints(config: Record<string, unknown>): boolean {
  return hasAuthHintsRecursive(config, 0);
}

function looksLikeServerConfig(value: Record<string, unknown>): boolean {
  return typeof value.command === "string" || typeof value.url === "string" || Array.isArray(value.args);
}

function looksLikeLocalStdioServer(config: Record<string, unknown>): boolean {
  if (getRemoteEndpoint(config)) {
    return false;
  }

  const command = typeof config.command === "string" ? config.command.trim() : "";
  const transport = typeof config.transport === "string" ? config.transport.trim().toLowerCase() : "";

  if (!command) {
    return false;
  }

  return !transport || transport === "stdio";
}

function collectNestedServerContexts(
  contexts: Map<string, ServerContext>,
  file: LoadedWorkspace["files"][number],
  tree: Node | undefined,
  current: Record<string, unknown>,
  currentPath: ConfigPath,
  underMcpBranch: boolean
): void {
  for (const [key, value] of Object.entries(current)) {
    if (!isRecord(value)) {
      continue;
    }

    const nextPath = [...currentPath, key];
    const nextUnderMcpBranch = underMcpBranch || keyLooksLikeMcpBranch(key);

    if (shouldTreatValueAsServerMap(key, nextUnderMcpBranch)) {
      addServerContexts(contexts, file, tree, value, nextPath);
      continue;
    }

    collectNestedServerContexts(contexts, file, tree, value, nextPath, nextUnderMcpBranch);
  }
}

function addServerContexts(
  contexts: Map<string, ServerContext>,
  file: LoadedWorkspace["files"][number],
  tree: Node | undefined,
  serverMap: Record<string, unknown>,
  basePath: ConfigPath
): void {
  for (const [serverName, serverConfig] of Object.entries(serverMap)) {
    if (!isRecord(serverConfig)) {
      continue;
    }

    contexts.set(
      [...basePath, serverName].join("/"),
      {
        file,
        tree,
        serverName,
        serverConfig,
        basePath: [...basePath, serverName]
      }
    );
  }
}

function shouldTreatValueAsServerMap(key: string, underMcpBranch: boolean): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey === "servers" && underMcpBranch ||
    normalizedKey === "mcpservers" ||
    normalizedKey.endsWith("mcp.servers")
  );
}

function keyLooksLikeMcpBranch(key: string): boolean {
  return /(^|[.\-_])mcp($|[.\-_])/i.test(key);
}

function hasAuthHintsRecursive(value: unknown, depth: number): boolean {
  if (depth > 3) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasAuthHintsRecursive(item, depth + 1));
  }

  if (!isRecord(value)) {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/auth|token|apikey|apiKey|header|authorization/i.test(key)) {
      return true;
    }

    if (hasAuthHintsRecursive(nestedValue, depth + 1)) {
      return true;
    }
  }

  return false;
}

function looksLikeDisabledAuthConfig(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value === false;
  }

  if (typeof value === "string") {
    return /^(none|disabled|off|false)$/i.test(value.trim());
  }

  return false;
}

function looksOverbroadPath(value: string): boolean {
  return value === "/" || value === "~" || /^[A-Za-z]:\\?$/.test(value) || value === "C:\\";
}

function getServerIdIssue(serverName: string): string | undefined {
  if (serverName.trim() !== serverName) {
    return "it has leading or trailing whitespace";
  }

  if (/\s/.test(serverName)) {
    return "it contains spaces";
  }

  if (/[^A-Za-z0-9_-]/.test(serverName)) {
    return "it contains punctuation outside simple letters, numbers, hyphens, or underscores";
  }

  if (/^\d/.test(serverName)) {
    return "it starts with a number";
  }

  if (GENERIC_SERVER_IDS.has(serverName.toLowerCase())) {
    return "it is too generic to be a clear policy identifier";
  }

  return undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getContextLocation(context: ServerContext, ...relativePaths: Array<ConfigPath | undefined>): ScanLocation | undefined {
  for (const relativePath of relativePaths) {
    if (!relativePath) {
      continue;
    }

    const location = locateJsonPath(context.file, context.tree, [...context.basePath, ...relativePath]);

    if (location) {
      return location;
    }
  }

  return locateJsonPath(context.file, context.tree, context.basePath);
}

function locateJsonPath(
  file: LoadedWorkspace["files"][number],
  tree: Node | undefined,
  path: ConfigPath
): ScanLocation | undefined {
  if (!tree) {
    return undefined;
  }

  const node = findNodeAtLocation(tree, path);
  return node ? locateMatch(file, node.offset) : undefined;
}

function isPotentialMcpConfigFile(file: LoadedWorkspace["files"][number]): boolean {
  if (file.basename.endsWith(".code-workspace")) {
    return true;
  }

  return (
    MCP_CONFIG_SUFFIXES.some(
      (candidate) => file.relativePath === candidate || file.relativePath.endsWith(`/${candidate}`)
    ) ||
    MCP_SETTINGS_SUFFIXES.some(
      (candidate) => file.relativePath === candidate || file.relativePath.endsWith(`/${candidate}`)
    )
  );
}

function getSensitiveRemoteTargetSeverity(remoteUrl: string): "error" | "warning" | undefined {
  try {
    const url = new URL(remoteUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "169.254.169.254") {
      return "error";
    }

    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "127.0.0.1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      /^127\./.test(hostname)
    ) {
      return "warning";
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function hasCredentialsInUrl(remoteUrl: string): boolean {
  try {
    const url = new URL(remoteUrl);

    if (url.username || url.password) {
      return true;
    }

    for (const key of url.searchParams.keys()) {
      if (/token|secret|key|apikey|api_key|access_token|auth/i.test(key)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
