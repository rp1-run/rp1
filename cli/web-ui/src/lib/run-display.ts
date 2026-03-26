import type { Run } from "@/types/runs";

/**
 * Resolves the display name for a run using the fallback chain:
 * name > featureName > featureId > ""
 */
export function resolveRunDisplayName(run: Run): string {
	return run.name || run.featureName || run.featureId || "";
}
