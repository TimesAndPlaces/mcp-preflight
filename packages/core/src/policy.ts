import type { PolicyEvaluation, PolicyPreset, ScanReport } from "./types";

export const POLICY_PRESETS: Record<
  PolicyPreset,
  {
    description: string;
    failOn: "error" | "warning";
  }
> = {
  balanced: {
    description: "Fail only when the scan reports error-level findings.",
    failOn: "error"
  },
  strict: {
    description: "Fail when the scan reports any error-level or warning-level findings.",
    failOn: "warning"
  }
};

export function evaluatePolicy(report: ScanReport, preset: PolicyPreset = "balanced"): PolicyEvaluation {
  const policy = POLICY_PRESETS[preset];
  const failures = policy.failOn === "warning" ? report.summary.errors + report.summary.warnings : report.summary.errors;

  return {
    preset,
    failOn: policy.failOn,
    passed: failures === 0,
    message:
      policy.failOn === "warning"
        ? failures === 0
          ? "No error or warning findings triggered the CI gate."
          : `${failures} error/warning findings triggered the CI gate.`
        : failures === 0
          ? "No error findings triggered the CI gate."
          : `${failures} error findings triggered the CI gate.`
  };
}

export function listPolicyPresets(): Array<{
  name: PolicyPreset;
  description: string;
}> {
  return (Object.entries(POLICY_PRESETS) as Array<
    [PolicyPreset, { description: string; failOn: "error" | "warning" }]
  >).map(([name, definition]) => ({
    name,
    description: definition.description
  }));
}
