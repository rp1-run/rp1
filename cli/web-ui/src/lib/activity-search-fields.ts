import { resolveRunDisplayName } from "@/lib/run-display";
import { getRunCurrentStepLabel, getRunStatusLabel } from "@/lib/status-labels";
import type { Run } from "@/types/runs";

export type ActivitySearchRunLike = Pick<
	Run,
	| "id"
	| "command"
	| "name"
	| "featureName"
	| "featureId"
	| "projectName"
	| "status"
	| "statusMessage"
	| "harness"
	| "currentStep"
	| "steps"
	| "events"
>;

export function normalizeActivitySearchTokens(
	search: string | null | undefined,
): string[] {
	return search?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
}

export function buildActivitySearchText(run: ActivitySearchRunLike): string {
	return [
		run.id,
		run.command,
		resolveRunDisplayName(run),
		run.featureName,
		run.featureId,
		run.projectName,
		run.status,
		run.statusMessage,
		run.harness,
		run.currentStep,
		getRunCurrentStepLabel(run),
		getRunStatusLabel(run),
	]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
}
