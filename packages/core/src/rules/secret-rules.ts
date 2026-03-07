import type { Finding, LoadedWorkspace, WorkspaceFile } from "../types";
import { createFinding } from "../utils";

const SECRET_PATTERNS = [
  {
    label: "OpenAI-style API key",
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g
  },
  {
    label: "GitHub token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g
  },
  {
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g
  },
  {
    label: "Generic secret assignment",
    regex: /\b(api[_-]?key|token|secret)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/gi
  }
];

const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g;

export function scanSecretExposure(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];

  for (const file of workspace.files) {
    if (!isSecretCandidate(file)) {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let count = 0;

      for (const match of file.content.matchAll(regex)) {
        findings.push(
          createFinding({
            ruleId: "exposed-secrets",
            title: "Potential secret or token is stored in the workspace",
            description: `The scanner found content that looks like ${pattern.label}. Checked-in credentials are one of the fastest ways to compromise a local MCP setup or repo.`,
            severity: "error",
            category: "credential-exposure",
            suggestion: "Remove the secret from the file, rotate it, and load it from a narrowly scoped local environment source instead.",
            file,
            evidence: match[0],
            index: match.index,
            tags: ["lite", "mcp", "secrets"]
          })
        );

        count += 1;
        if (count >= 3) {
          break;
        }
      }
    }

    const privateKeyRegex = new RegExp(PRIVATE_KEY_PATTERN.source, PRIVATE_KEY_PATTERN.flags);
    const privateKeyMatch = privateKeyRegex.exec(file.content);

    if (privateKeyMatch) {
      findings.push(
        createFinding({
          ruleId: "private-key-material",
          title: "Private key material is present in the workspace",
          description: "Private key material checked into a workspace is a high-severity local compromise risk.",
          severity: "error",
          category: "credential-exposure",
          suggestion: "Delete the key from the repo, rotate the credential, and move the secret into a secure local store.",
          file,
          evidence: privateKeyMatch[0],
          index: privateKeyMatch.index,
          tags: ["lite", "keys", "secrets"]
        })
      );
    }
  }

  return findings;
}

function isSecretCandidate(file: WorkspaceFile): boolean {
  return (
    file.basename.startsWith(".env") ||
    file.basename === ".npmrc" ||
    file.extension === ".json" ||
    file.extension === ".toml" ||
    file.extension === ".yaml" ||
    file.extension === ".yml" ||
    file.extension === ".md" ||
    file.extension === ".txt"
  );
}
