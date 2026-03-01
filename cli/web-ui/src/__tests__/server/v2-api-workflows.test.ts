/**
 * Tests for dynamic state machine step derivation and stale row filtering
 * in the v2 API. Verifies that state-machine-driven step derivation produces
 * output matching the legacy hardcoded step arrays for build and build-fast.
 */

import { describe, expect, test } from "bun:test";
import {
	deriveOrderedSteps,
	parseAndTransform,
} from "../../../../src/agent-tools/state-machine/index.js";
import type { StateMachine } from "../../../../src/agent-tools/state-machine/models.js";
import type {
	StatusUpdateRecord,
	StatusValue,
} from "../../../../src/agent-tools/work/models.js";
import {
	commandToWorkflowName,
	deriveTaskBasedSteps,
	deriveWorkflowRunStatus,
	deriveWorkflowStepsFromMachine,
	filterNonExpiredRecords,
} from "../../server/routes/v2-api.js";

const buildMmd = `stateDiagram-v2
    [*] --> requirements
    requirements --> design : reqs_complete
    design --> tasks : design_complete
    tasks --> build : tasks_ready
    build --> verify : build_complete
    verify --> build : verify_failed
    verify --> archive : verify_passed
    archive --> [*] : done
`;

const buildFastMmd = `stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
`;

const prReviewMmd = `stateDiagram-v2
    [*] --> split
    split --> review : split_complete
    review --> synthesize : review_complete
    synthesize --> post : synthesis_complete
    post --> [*] : done
`;

function parseMachine(id: string, source: string): StateMachine {
	const result = parseAndTransform(id, source);
	if (result._tag === "Left") {
		throw new Error(
			`Failed to parse state machine: ${JSON.stringify(result.left)}`,
		);
	}
	return result.right;
}

function makeRecord(
	overrides: Partial<StatusUpdateRecord> & {
		id: number;
		feature: string;
		status: StatusValue;
	},
): StatusUpdateRecord {
	return {
		projectPath: "/test/project",
		task: null,
		message: null,
		metadata: null,
		createdAt: "2026-03-01T00:00:00.000Z",
		runId: null,
		expiresAt: null,
		...overrides,
	};
}

describe("commandToWorkflowName", () => {
	test("strips leading slash from command", () => {
		expect(commandToWorkflowName("/build")).toBe("build");
		expect(commandToWorkflowName("/build-fast")).toBe("build-fast");
		expect(commandToWorkflowName("/pr-review")).toBe("pr-review");
	});

	test("returns null for empty or invalid commands", () => {
		expect(commandToWorkflowName("")).toBeNull();
		expect(commandToWorkflowName("build")).toBeNull();
		expect(commandToWorkflowName("/")).toBeNull();
	});
});

describe("filterNonExpiredRecords", () => {
	test("keeps records with null expiresAt", () => {
		const records = [
			makeRecord({ id: 1, feature: "f1", status: "started", expiresAt: null }),
			makeRecord({
				id: 2,
				feature: "f2",
				status: "completed",
				expiresAt: null,
			}),
		];
		expect(filterNonExpiredRecords(records)).toHaveLength(2);
	});

	test("filters out records with expiresAt in the past", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				status: "started",
				expiresAt: "2020-01-01T00:00:00.000Z",
			}),
			makeRecord({
				id: 2,
				feature: "f2",
				status: "completed",
				expiresAt: null,
			}),
		];
		const filtered = filterNonExpiredRecords(records);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe(2);
	});

	test("keeps records with expiresAt in the future", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				status: "started",
				expiresAt: "2099-12-31T23:59:59.999Z",
			}),
			makeRecord({
				id: 2,
				feature: "f2",
				status: "completed",
				expiresAt: "2099-01-01T00:00:00.000Z",
			}),
		];
		expect(filterNonExpiredRecords(records)).toHaveLength(2);
	});

	test("handles empty array", () => {
		expect(filterNonExpiredRecords([])).toHaveLength(0);
	});

	test("mixed expired and non-expired records", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				status: "started",
				expiresAt: "2020-01-01T00:00:00.000Z",
			}),
			makeRecord({
				id: 2,
				feature: "f1",
				status: "in_progress",
				expiresAt: "2099-12-31T23:59:59.999Z",
			}),
			makeRecord({
				id: 3,
				feature: "f2",
				status: "completed",
				expiresAt: null,
			}),
			makeRecord({
				id: 4,
				feature: "f3",
				status: "failed",
				expiresAt: "2019-06-15T12:00:00.000Z",
			}),
		];
		const filtered = filterNonExpiredRecords(records);
		expect(filtered).toHaveLength(2);
		expect(filtered.map((r) => r.id)).toEqual([2, 3]);
	});
});

describe("deriveWorkflowStepsFromMachine", () => {
	describe("build workflow", () => {
		const machine = parseMachine("build", buildMmd);
		const orderedSteps = deriveOrderedSteps(machine);

		test("produces correct step count and ordering", () => {
			expect(orderedSteps).toHaveLength(6);
			expect(orderedSteps.map((s) => s.id)).toEqual([
				"requirements",
				"design",
				"tasks",
				"build",
				"verify",
				"archive",
			]);
		});

		test("all steps pending when no records", () => {
			const steps = deriveWorkflowStepsFromMachine([], orderedSteps);
			expect(steps).toHaveLength(6);
			for (const step of steps) {
				expect(step.status).toBe("pending");
				expect(step.startedAt).toBeNull();
				expect(step.completedAt).toBeNull();
			}
		});

		test("step names match legacy hardcoded names", () => {
			const steps = deriveWorkflowStepsFromMachine([], orderedSteps);
			expect(steps.map((s) => s.name)).toEqual([
				"Requirements",
				"Design",
				"Tasks",
				"Build",
				"Verify",
				"Archive",
			]);
		});

		test("step IDs match legacy hardcoded IDs", () => {
			const steps = deriveWorkflowStepsFromMachine([], orderedSteps);
			expect(steps.map((s) => s.id)).toEqual([
				"requirements",
				"design",
				"tasks",
				"build",
				"verify",
				"archive",
			]);
		});

		test("marks steps with records as running or completed", () => {
			const records: StatusUpdateRecord[] = [
				makeRecord({
					id: 1,
					feature: "f1",
					task: "requirements",
					status: "started",
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeRecord({
					id: 2,
					feature: "f1",
					task: "requirements",
					status: "completed",
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
				makeRecord({
					id: 3,
					feature: "f1",
					task: "design",
					status: "in_progress",
					createdAt: "2026-03-01T00:02:00.000Z",
				}),
			];

			const steps = deriveWorkflowStepsFromMachine(records, orderedSteps);
			expect(steps[0].status).toBe("completed");
			expect(steps[0].startedAt).toBe("2026-03-01T00:00:00.000Z");
			expect(steps[0].completedAt).toBe("2026-03-01T00:01:00.000Z");
			expect(steps[1].status).toBe("running");
			expect(steps[1].startedAt).toBe("2026-03-01T00:02:00.000Z");
			expect(steps[2].status).toBe("pending");
			expect(steps[3].status).toBe("pending");
			expect(steps[4].status).toBe("pending");
			expect(steps[5].status).toBe("pending");
		});

		test("feature-level waiting-input overrides last active step", () => {
			const records: StatusUpdateRecord[] = [
				makeRecord({
					id: 1,
					feature: "f1",
					task: "requirements",
					status: "completed",
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeRecord({
					id: 2,
					feature: "f1",
					task: "design",
					status: "completed",
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
				makeRecord({
					id: 3,
					feature: "f1",
					status: "waiting-input",
					createdAt: "2026-03-01T00:02:00.000Z",
				}),
			];

			const steps = deriveWorkflowStepsFromMachine(records, orderedSteps);
			expect(steps[0].status).toBe("completed");
			// Last active step (design) should be overridden to "running"
			expect(steps[1].status).toBe("running");
		});
	});

	describe("build-fast workflow", () => {
		const machine = parseMachine("build-fast", buildFastMmd);
		const orderedSteps = deriveOrderedSteps(machine);

		test("produces correct step count and ordering", () => {
			expect(orderedSteps).toHaveLength(3);
			expect(orderedSteps.map((s) => s.id)).toEqual([
				"plan",
				"build",
				"review",
			]);
		});

		test("step names match legacy hardcoded names", () => {
			const steps = deriveWorkflowStepsFromMachine([], orderedSteps);
			expect(steps.map((s) => s.name)).toEqual(["Plan", "Build", "Review"]);
		});

		test("step IDs match legacy hardcoded IDs", () => {
			const steps = deriveWorkflowStepsFromMachine([], orderedSteps);
			expect(steps.map((s) => s.id)).toEqual(["plan", "build", "review"]);
		});

		test("marks completed and running steps correctly", () => {
			const records: StatusUpdateRecord[] = [
				makeRecord({
					id: 1,
					feature: "f1",
					task: "plan",
					status: "completed",
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeRecord({
					id: 2,
					feature: "f1",
					task: "build",
					status: "in_progress",
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
			];

			const steps = deriveWorkflowStepsFromMachine(records, orderedSteps);
			expect(steps[0].status).toBe("completed");
			expect(steps[1].status).toBe("running");
			expect(steps[2].status).toBe("pending");
		});
	});

	describe("pr-review workflow", () => {
		const machine = parseMachine("pr-review", prReviewMmd);
		const orderedSteps = deriveOrderedSteps(machine);

		test("produces correct step count and ordering", () => {
			expect(orderedSteps).toHaveLength(4);
			expect(orderedSteps.map((s) => s.id)).toEqual([
				"split",
				"review",
				"synthesize",
				"post",
			]);
		});
	});
});

describe("deriveWorkflowRunStatus", () => {
	const buildMachine = parseMachine("build", buildMmd);
	const buildFastMachine = parseMachine("build-fast", buildFastMmd);

	test("returns 'running' when no terminal records", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "requirements",
				status: "in_progress",
			}),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe("running");
	});

	test("returns 'failed' when any record has failed status", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "requirements",
				status: "completed",
			}),
			makeRecord({ id: 2, feature: "f1", task: "design", status: "failed" }),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe("failed");
	});

	test("returns 'completed' when terminal state has completed record", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "requirements",
				status: "completed",
			}),
			makeRecord({ id: 2, feature: "f1", task: "design", status: "completed" }),
			makeRecord({ id: 3, feature: "f1", task: "tasks", status: "completed" }),
			makeRecord({ id: 4, feature: "f1", task: "build", status: "completed" }),
			makeRecord({ id: 5, feature: "f1", task: "verify", status: "completed" }),
			makeRecord({
				id: 6,
				feature: "f1",
				task: "archive",
				status: "completed",
			}),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe("completed");
	});

	test("returns 'completed' via feature-level completed record", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "requirements",
				status: "completed",
			}),
			makeRecord({ id: 2, feature: "f1", status: "completed" }),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe("completed");
	});

	test("returns 'waiting-input' from feature-level record", () => {
		const records = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "requirements",
				status: "completed",
			}),
			makeRecord({ id: 2, feature: "f1", status: "waiting-input" }),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe(
			"waiting-input",
		);
	});

	test("returns 'needs-review' from feature-level record", () => {
		const records = [
			makeRecord({ id: 1, feature: "f1", task: "build", status: "completed" }),
			makeRecord({ id: 2, feature: "f1", status: "needs-review" }),
		];
		expect(deriveWorkflowRunStatus(records, buildMachine)).toBe("needs-review");
	});

	test("build-fast: completed when review step is completed", () => {
		const records = [
			makeRecord({ id: 1, feature: "f1", task: "plan", status: "completed" }),
			makeRecord({ id: 2, feature: "f1", task: "build", status: "completed" }),
			makeRecord({ id: 3, feature: "f1", task: "review", status: "completed" }),
		];
		expect(deriveWorkflowRunStatus(records, buildFastMachine)).toBe(
			"completed",
		);
	});

	test("build-fast: running when mid-workflow", () => {
		const records = [
			makeRecord({ id: 1, feature: "f1", task: "plan", status: "completed" }),
			makeRecord({
				id: 2,
				feature: "f1",
				task: "build",
				status: "in_progress",
			}),
		];
		expect(deriveWorkflowRunStatus(records, buildFastMachine)).toBe("running");
	});
});

describe("deriveTaskBasedSteps", () => {
	test("groups records by task ID", () => {
		const records: StatusUpdateRecord[] = [
			makeRecord({
				id: 1,
				feature: "f1",
				task: "T1",
				status: "completed",
				createdAt: "2026-03-01T00:00:00.000Z",
			}),
			makeRecord({
				id: 2,
				feature: "f1",
				task: "T2",
				status: "in_progress",
				createdAt: "2026-03-01T00:01:00.000Z",
			}),
		];

		const steps = deriveTaskBasedSteps(records);
		expect(steps).toHaveLength(2);
		expect(steps[0].id).toBe("T1");
		expect(steps[0].status).toBe("completed");
		expect(steps[1].id).toBe("T2");
		expect(steps[1].status).toBe("running");
	});

	test("skips records without task", () => {
		const records: StatusUpdateRecord[] = [
			makeRecord({ id: 1, feature: "f1", status: "started" }),
			makeRecord({
				id: 2,
				feature: "f1",
				task: "T1",
				status: "completed",
				createdAt: "2026-03-01T00:00:00.000Z",
			}),
		];

		const steps = deriveTaskBasedSteps(records);
		expect(steps).toHaveLength(1);
		expect(steps[0].id).toBe("T1");
	});

	test("returns empty array for no task records", () => {
		const records: StatusUpdateRecord[] = [
			makeRecord({ id: 1, feature: "f1", status: "started" }),
		];

		const steps = deriveTaskBasedSteps(records);
		expect(steps).toHaveLength(0);
	});
});
