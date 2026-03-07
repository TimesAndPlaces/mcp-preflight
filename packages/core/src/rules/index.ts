import type { LoadedWorkspace } from "../types";
import { sortFindings, uniqueFindings } from "../utils";
import { scanMcpConfigurationRisks } from "./config-rules";
import { scanContentIndicators } from "./content-rules";
import { scanDependencyRisks } from "./dependency-rules";
import { scanSecretExposure } from "./secret-rules";

export function runAllRules(workspace: LoadedWorkspace) {
  return sortFindings(
    uniqueFindings([
      ...scanSecretExposure(workspace),
      ...scanDependencyRisks(workspace),
      ...scanMcpConfigurationRisks(workspace),
      ...scanContentIndicators(workspace)
    ])
  );
}
