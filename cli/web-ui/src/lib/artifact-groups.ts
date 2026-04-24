import type { Artifact, Step } from "@/types/runs";

export interface ArtifactGroup {
	readonly id: string;
	readonly label: string;
	readonly stepId: string | null;
	readonly artifacts: readonly Artifact[];
}

type StepDescriptor = Pick<Step, "id" | "name">;
type RouteArtifact = Pick<Artifact, "docId" | "step">;

export const RUN_ARTIFACT_GROUP_ID = "run";
export const RUN_ARTIFACT_GROUP_LABEL = "Run artifacts";

interface MutableArtifactGroup {
	readonly id: string;
	readonly label: string;
	readonly stepId: string | null;
	readonly artifacts: Artifact[];
}

function createStepGroup(
	stepId: string,
	stepLabels: ReadonlyMap<string, string>,
): MutableArtifactGroup {
	return {
		id: `step:${stepId}`,
		label: stepLabels.get(stepId) ?? stepId,
		stepId,
		artifacts: [],
	};
}

function asArtifactGroup(group: MutableArtifactGroup): ArtifactGroup {
	return {
		...group,
		artifacts: [...group.artifacts],
	};
}

export function groupArtifactsByWorkflowStep(
	artifacts: readonly Artifact[],
	steps: readonly StepDescriptor[],
): readonly ArtifactGroup[] {
	const stepLabels = new Map(
		steps.map((step) => [step.id, step.name || step.id]),
	);
	const stepIds = new Set(steps.map((step) => step.id));
	const groupsByStep = new Map<string, MutableArtifactGroup>();
	const runArtifacts: Artifact[] = [];

	for (const artifact of artifacts) {
		if (!artifact.step) {
			runArtifacts.push(artifact);
			continue;
		}

		const group =
			groupsByStep.get(artifact.step) ??
			createStepGroup(artifact.step, stepLabels);
		group.artifacts.push(artifact);
		groupsByStep.set(artifact.step, group);
	}

	const groups: ArtifactGroup[] = [];
	for (const step of steps) {
		const group = groupsByStep.get(step.id);
		if (group) {
			groups.push(asArtifactGroup(group));
		}
	}

	for (const [stepId, group] of groupsByStep) {
		if (!stepIds.has(stepId)) {
			groups.push(asArtifactGroup(group));
		}
	}

	if (runArtifacts.length > 0) {
		groups.push({
			id: RUN_ARTIFACT_GROUP_ID,
			label: RUN_ARTIFACT_GROUP_LABEL,
			stepId: null,
			artifacts: [...runArtifacts],
		});
	}

	return groups;
}

export function buildArtifactRoute(
	runId: string,
	artifact: RouteArtifact,
): string {
	const encodedRunId = encodeURIComponent(runId);
	const encodedDocId = encodeURIComponent(artifact.docId);

	if (artifact.step) {
		return `/runs/${encodedRunId}/step/${encodeURIComponent(
			artifact.step,
		)}/artifact/${encodedDocId}`;
	}

	return `/runs/${encodedRunId}/artifact/${encodedDocId}`;
}
