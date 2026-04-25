import { describe, expect, test } from "bun:test";
import {
	buildArtifactRoute,
	groupArtifactsByWorkflowStep,
	RUN_ARTIFACT_GROUP_ID,
	RUN_ARTIFACT_GROUP_LABEL,
} from "../../lib/artifact-groups";
import type { Artifact, Step } from "../../types/runs";

function step(id: string, name: string): Step {
	return {
		id,
		name,
		status: "running",
		startedAt: null,
		completedAt: null,
		taskCount: null,
		completedTaskCount: null,
	};
}

function artifact(docId: string, stepId: string | null, path = `${docId}.md`) {
	return {
		docId,
		path,
		absolutePath: `/repo/${path}`,
		type: "markdown",
		updatedDuringRun: false,
		isNew: true,
		step: stepId,
	} satisfies Artifact;
}

describe("artifact grouping", () => {
	test("groups step-backed artifacts in workflow step order", () => {
		const groups = groupArtifactsByWorkflowStep(
			[
				artifact("build-summary", "build"),
				artifact("plan-notes", "plan"),
				artifact("build-report", "build"),
			],
			[step("plan", "Plan"), step("build", "Build"), step("verify", "Verify")],
		);

		expect(groups).toEqual([
			{
				id: "step:plan",
				label: "Plan",
				stepId: "plan",
				artifacts: [artifact("plan-notes", "plan")],
			},
			{
				id: "step:build",
				label: "Build",
				stepId: "build",
				artifacts: [
					artifact("build-summary", "build"),
					artifact("build-report", "build"),
				],
			},
		]);
	});

	test("places run-level artifacts in a final group", () => {
		const groups = groupArtifactsByWorkflowStep(
			[
				artifact("run-brief", null),
				artifact("build-summary", "build"),
				artifact("run-notes", null),
			],
			[step("build", "Build")],
		);

		expect(groups).toEqual([
			{
				id: "step:build",
				label: "Build",
				stepId: "build",
				artifacts: [artifact("build-summary", "build")],
			},
			{
				id: RUN_ARTIFACT_GROUP_ID,
				label: RUN_ARTIFACT_GROUP_LABEL,
				stepId: null,
				artifacts: [artifact("run-brief", null), artifact("run-notes", null)],
			},
		]);
	});

	test("keeps a single artifact in one stable group", () => {
		const groups = groupArtifactsByWorkflowStep(
			[artifact("only-artifact", "build")],
			[step("build", "Build")],
		);

		expect(groups).toHaveLength(1);
		expect(groups[0]).toEqual({
			id: "step:build",
			label: "Build",
			stepId: "build",
			artifacts: [artifact("only-artifact", "build")],
		});
	});

	test("keeps step-backed artifacts with missing step metadata", () => {
		const groups = groupArtifactsByWorkflowStep(
			[artifact("unknown-output", "missing"), artifact("run-brief", null)],
			[],
		);

		expect(groups).toEqual([
			{
				id: "step:missing",
				label: "missing",
				stepId: "missing",
				artifacts: [artifact("unknown-output", "missing")],
			},
			{
				id: RUN_ARTIFACT_GROUP_ID,
				label: RUN_ARTIFACT_GROUP_LABEL,
				stepId: null,
				artifacts: [artifact("run-brief", null)],
			},
		]);
	});
});

describe("artifact routes", () => {
	test("builds routes from the artifact origin", () => {
		expect(buildArtifactRoute("run-1", artifact("doc-build", "build"))).toBe(
			"/runs/run-1/step/build/artifact/doc-build",
		);
		expect(buildArtifactRoute("run-1", artifact("doc-run", null))).toBe(
			"/runs/run-1/artifact/doc-run",
		);
	});
});
