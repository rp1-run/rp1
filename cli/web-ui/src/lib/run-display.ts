import type { Run } from "@/types/runs";

export interface RunDisplayTarget {
	readonly name?: string | null;
	readonly featureName?: string | null;
	readonly featureId?: string | null;
}

/**
 * Resolves the display name for a run using the fallback chain:
 * name > featureName > featureId > ""
 */
export function resolveRunDisplayName(
	run: Pick<Run, "name" | "featureName" | "featureId"> | RunDisplayTarget,
): string {
	return run.name ?? run.featureName ?? run.featureId ?? "";
}
