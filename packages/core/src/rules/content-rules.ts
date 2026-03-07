import type { Finding, LoadedWorkspace, WorkspaceFile } from "../types";
import { createFinding } from "../utils";

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all|any|the|previous|prior) instructions/gi,
  /(reveal|print|dump|expose).{0,40}(secret|token|credential|environment variable)/gi,
  /(override|bypass).{0,20}(system|safety|policy|guardrail)/gi
];

const TOOL_POISONING_PATTERNS = [
  /\b(hidden recipient|bcc|silently forward|forward a copy)\b/gi,
  /\b(exfiltrat(e|ion)|send .* externally|upload .* secretly)\b/gi,
  /\b(without telling the user|do not tell the user|keep this hidden)\b/gi
];

const PROMPTISH_PATH_SEGMENTS = new Set([
  "agent",
  "agents",
  "instruction",
  "instructions",
  "prompt",
  "prompts",
  "resource",
  "resources",
  "skill",
  "skills",
  "tool",
  "tools"
]);

export function scanContentIndicators(workspace: LoadedWorkspace): Finding[] {
  const findings: Finding[] = [];

  for (const file of workspace.files) {
    if (!shouldScanContent(file)) {
      continue;
    }

    findings.push(
      ...scanPatternGroup({
        file,
        patterns: PROMPT_INJECTION_PATTERNS,
        ruleId: "prompt-injection-indicator",
        title: "Prompt text contains instruction-override language",
        description:
          "This text contains language commonly used in prompt injection attempts, such as telling a model to ignore prior instructions or reveal sensitive data.",
        category: "prompt-injection",
        suggestion: "Review and rewrite the prompt or tool description so it cannot override prior policy or request secrets."
      })
    );

    findings.push(
      ...scanPatternGroup({
        file,
        patterns: TOOL_POISONING_PATTERNS,
        ruleId: "tool-poisoning-indicator",
        title: "Tool or resource text contains suspicious hidden-side-effect language",
        description:
          "This text contains language associated with tool poisoning or hidden side effects, such as silent forwarding or concealed exfiltration.",
        category: "tool-poisoning",
        suggestion: "Remove hidden side effects from the tool description and document all externally visible behavior explicitly."
      })
    );
  }

  return findings;
}

function scanPatternGroup(params: {
  file: WorkspaceFile;
  patterns: RegExp[];
  ruleId: string;
  title: string;
  description: string;
  category: string;
  suggestion: string;
}): Finding[] {
  const findings: Finding[] = [];
  const ignoredRanges = getIgnoredRanges(params.file);

  for (const patternTemplate of params.patterns) {
    const pattern = new RegExp(patternTemplate.source, patternTemplate.flags);
    let count = 0;

    for (const match of params.file.content.matchAll(pattern)) {
      if (typeof match.index !== "number" || isIgnoredMatch(match.index, ignoredRanges)) {
        continue;
      }

      findings.push(
        createFinding({
          ruleId: params.ruleId,
          title: params.title,
          description: params.description,
          severity: "warning",
          category: params.category,
          suggestion: params.suggestion,
          file: params.file,
          evidence: match[0],
          index: match.index,
          tags: ["lite", "content", params.category]
        })
      );

      count += 1;
      if (count >= 2) {
        break;
      }
    }
  }

  return findings;
}

function shouldScanContent(file: WorkspaceFile): boolean {
  if (
    file.relativePath === "mcp.json" ||
    file.relativePath === ".mcp.json" ||
    file.relativePath.endsWith("/mcp.json") ||
    file.relativePath.endsWith("/settings.json") ||
    file.basename.endsWith(".code-workspace")
  ) {
    return true;
  }

  const pathSegments = file.relativePath.toLowerCase().split("/");
  return (
    /prompt|tool|resource|instruction|agent|skill|mcp/i.test(file.basename) ||
    pathSegments.some((segment) => PROMPTISH_PATH_SEGMENTS.has(segment))
  );
}

function getIgnoredRanges(file: WorkspaceFile): Array<{ start: number; end: number }> {
  if (file.extension !== ".md") {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  const fencedCodePattern = /```[\s\S]*?```/g;

  for (const match of file.content.matchAll(fencedCodePattern)) {
    if (typeof match.index !== "number") {
      continue;
    }

    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return ranges;
}

function isIgnoredMatch(index: number, ignoredRanges: Array<{ start: number; end: number }>): boolean {
  return ignoredRanges.some((range) => index >= range.start && index < range.end);
}
