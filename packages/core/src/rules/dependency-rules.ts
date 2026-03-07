import type { Finding, LoadedWorkspace } from "../types";
import { createFinding } from "../utils";

const PACKAGE_GROUPS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

const DANGEROUS_SCRIPT_PATTERNS = [
  /(curl|wget)[^|]*(\||\|\|).*\b(sh|bash|zsh)\b/i,
  /\b(powershell|pwsh)\b[^\n]*\s(-enc|-encodedcommand)\b/i,
  /\bInvoke-WebRequest\b/i,
  /\bnpx\s+-y\b/i,
  /\bpnpm\s+dlx\b/i,
  /\brm\s+-rf\s+\/\b/i
];

export function scanDependencyRisks(workspace: LoadedWorkspace): Finding[] {
  return [
    ...scanUnpinnedDependencies(workspace),
    ...scanDangerousPackageScripts(workspace),
    ...scanMissingLockfiles(workspace)
  ];
}

function scanUnpinnedDependencies(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];
  const packageFile = workspace.fileMap.get("package.json");

  if (packageFile) {
    const packageJson = tryParseJson<Record<string, unknown>>(packageFile.content);

    if (packageJson) {
      for (const group of PACKAGE_GROUPS) {
        const dependencies = packageJson[group];

        if (!isRecord(dependencies)) {
          continue;
        }

        for (const [name, versionSpec] of Object.entries(dependencies)) {
          if (typeof versionSpec !== "string" || !isUnpinnedDependencySpec(versionSpec)) {
            continue;
          }

          findings.push(
            createFinding({
              ruleId: "unpinned-dependency",
              title: "Dependency uses an unpinned or remote reference",
              description: `Dependency "${name}" uses "${versionSpec}", which increases supply-chain volatility and makes local MCP tooling harder to trust.`,
              severity: "warning",
              category: "supply-chain",
              suggestion: "Pin the dependency to an exact version or verified immutable reference and commit the corresponding lockfile.",
              file: packageFile,
              evidence: `"${name}": "${versionSpec}"`,
              index: packageFile.content.indexOf(`"${name}"`),
              tags: ["lite", "supply-chain", "dependencies"]
            })
          );
        }
      }
    }
  }

  const pyprojectFile = workspace.fileMap.get("pyproject.toml");

  if (pyprojectFile) {
    const regexes = [
      /\bgit\s*=\s*"[^"]+"/gi,
      /=\s*"latest"/gi,
      /=\s*"\*"/gi,
      /@\s*https?:\/\/[^\s"]+/gi
    ];

    for (const regexTemplate of regexes) {
      const regex = new RegExp(regexTemplate.source, regexTemplate.flags);
      const match = regex.exec(pyprojectFile.content);

      if (!match) {
        continue;
      }

      findings.push(
        createFinding({
          ruleId: "unpinned-dependency",
          title: "Python dependency source is not pinned",
          description: "The Python project manifest contains a dependency reference that is not locked to a stable version or immutable source.",
          severity: "warning",
          category: "supply-chain",
          suggestion: "Pin the dependency version or immutable revision and add the corresponding lockfile.",
          file: pyprojectFile,
          evidence: match[0],
          index: match.index,
          tags: ["lite", "python", "dependencies"]
        })
      );
    }
  }

  return findings;
}

function scanDangerousPackageScripts(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];
  const packageFile = workspace.fileMap.get("package.json");

  if (!packageFile) {
    return findings;
  }

  const packageJson = tryParseJson<Record<string, unknown>>(packageFile.content);

  if (!packageJson || !isRecord(packageJson.scripts)) {
    return findings;
  }

  for (const [name, script] of Object.entries(packageJson.scripts)) {
    if (typeof script !== "string") {
      continue;
    }

    const pattern = DANGEROUS_SCRIPT_PATTERNS.find((candidate) => candidate.test(script));

    if (!pattern) {
      continue;
    }

    findings.push(
      createFinding({
        ruleId: "dangerous-package-script",
        title: "Package script runs a risky shell or bootstrap command",
        description: `The "${name}" script contains a command pattern often used to download or execute code with minimal review.`,
        severity: "warning",
        category: "unsafe-primitives",
        suggestion: "Replace shell bootstrap commands with reviewed, pinned, and separately audited install steps.",
        file: packageFile,
        evidence: script,
        index: packageFile.content.indexOf(`"${name}"`),
        tags: ["lite", "scripts", "unsafe-primitives"]
      })
    );
  }

  return findings;
}

function scanMissingLockfiles(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];
  const hasNodeManifest = workspace.fileMap.has("package.json");
  const hasPythonManifest = workspace.fileMap.has("pyproject.toml");

  const hasJavaScriptLockfile =
    workspace.fileMap.has("package-lock.json") ||
    workspace.fileMap.has("pnpm-lock.yaml") ||
    workspace.fileMap.has("yarn.lock") ||
    workspace.fileMap.has("bun.lockb");

  const hasPythonLockfile =
    workspace.fileMap.has("poetry.lock") ||
    workspace.fileMap.has("uv.lock") ||
    workspace.fileMap.has("requirements.txt");

  if (hasNodeManifest && !hasJavaScriptLockfile) {
    const file = workspace.fileMap.get("package.json");
    if (file) {
      findings.push(
        createFinding({
          ruleId: "missing-lockfile",
          title: "JavaScript manifest exists without a lockfile",
          description: "Without a lockfile, dependency resolution can drift between machines and make MCP setup auditing less deterministic.",
          severity: "warning",
          category: "supply-chain",
          suggestion: "Commit `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or another lockfile for the active package manager.",
          file,
          tags: ["lite", "lockfile", "dependencies"]
        })
      );
    }
  }

  if (hasPythonManifest && !hasPythonLockfile) {
    const file = workspace.fileMap.get("pyproject.toml");
    if (file) {
      findings.push(
        createFinding({
          ruleId: "missing-lockfile",
          title: "Python manifest exists without a lockfile",
          description: "A Python project manifest without a lockfile or frozen requirements file makes supply-chain review less deterministic.",
          severity: "warning",
          category: "supply-chain",
          suggestion: "Commit `poetry.lock`, `uv.lock`, or another fully resolved dependency lock artifact.",
          file,
          tags: ["lite", "lockfile", "python"]
        })
      );
    }
  }

  return findings;
}

function isUnpinnedDependencySpec(versionSpec: string): boolean {
  const normalized = versionSpec.trim().toLowerCase();
  return (
    normalized === "*" ||
    normalized === "latest" ||
    normalized.startsWith("github:") ||
    normalized.startsWith("git+") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("workspace:*")
  );
}

function tryParseJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
