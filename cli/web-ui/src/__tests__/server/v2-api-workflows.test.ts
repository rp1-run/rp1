/**
 * Tests for the v2 API step derivation, state machine integration,
 * and workflows API endpoints. Verifies that event-sourced step derivation
 * produces correct output from status_change events, and that the workflows
 * API endpoints return correct listing, detail, and 404 responses.
 */

import { describe, expect, test } from "bun:test";
import type { EventRecord } from "../../../../shared/events.js";
import type { StepStatusEntry } from "../../../../src/agent-tools/emit/database.js";
import {
	deriveOrderedSteps,
	parseAndTransform,
} from "../../../../src/agent-tools/state-machine/index.js";
import type {
	OrderedStep,
	StateMachine,
} from "../../../../src/agent-tools/state-machine/models.js";
import {
	commandToWorkflowName,
	deriveAgentSteps,
	deriveStepsFromEvents,
	deriveStepsFromMachine,
	handleV2WorkflowDetailRequest,
	handleV2WorkflowsListRequest,
	isActivityTrackedFlow,
} from "../../server/routes/v2-api.js";

const buildMmd = `stateDiagram-v2
    [*] --> requirements
    requirements --> planning : requirements_accepted
    requirements --> requirements : requirements_revised
    requirements --> [*] : stopped
    planning --> implementation : plan_accepted
    planning --> planning : plan_revised
    planning --> [*] : oversized_or_stopped
    implementation --> implementation : add_task_or_repair
    implementation --> release : readiness_ready
    implementation --> [*] : unrecoverable_failure
    release --> implementation : add_task
    release --> release : archive_chosen
    release --> [*] : release_complete
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

function makeEvent(
	overrides: Partial<EventRecord> & { id: number },
): EventRecord {
	return {
		runId: "test-run-1",
		type: "status_change",
		step: null,
		unit: null,
		data: null,
		parentStepId: null,
		createdAt: "2026-03-01T00:00:00.000Z",
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

describe("isActivityTrackedFlow", () => {
	test("defaults to tracked when no skill metadata matches the flow", () => {
		expect(isActivityTrackedFlow("unknown-flow", new Map())).toBe(true);
	});

	test("hides flows when every matching skill explicitly disables arcade tracking", () => {
		const lookup = new Map([
			["base:knowledge-build", { arcade_tracked: false }],
		]);

		expect(isActivityTrackedFlow("knowledge-build", lookup)).toBe(false);
	});

	test("keeps flows visible when any matching skill remains tracked", () => {
		const lookup = new Map([
			["base:knowledge-build", { arcade_tracked: false }],
			["dev:knowledge-build", { arcade_tracked: true }],
		]);

		expect(isActivityTrackedFlow("knowledge-build", lookup)).toBe(true);
	});
});

describe("deriveStepsFromMachine", () => {
	describe("build workflow", () => {
		const machine = parseMachine("build", buildMmd);
		const orderedSteps = deriveOrderedSteps(machine);

		test("produces correct step count and ordering", () => {
			expect(orderedSteps).toHaveLength(4);
			expect(orderedSteps.map((s) => s.id)).toEqual([
				"requirements",
				"planning",
				"implementation",
				"release",
			]);
		});

		test("all steps not_started when no step statuses", () => {
			const steps = deriveStepsFromMachine([], orderedSteps, []);
			expect(steps).toHaveLength(4);
			for (const step of steps) {
				expect(step.status).toBe("not_started");
				expect(step.startedAt).toBeNull();
				expect(step.completedAt).toBeNull();
			}
		});

		test("step names match expected names", () => {
			const steps = deriveStepsFromMachine([], orderedSteps, []);
			expect(steps.map((s) => s.name)).toEqual([
				"Requirements",
				"Planning",
				"Implementation",
				"Release",
			]);
		});

		test("step IDs match expected IDs", () => {
			const steps = deriveStepsFromMachine([], orderedSteps, []);
			expect(steps.map((s) => s.id)).toEqual([
				"requirements",
				"planning",
				"implementation",
				"release",
			]);
		});

		test("marks steps with statuses correctly", () => {
			const stepStatuses: StepStatusEntry[] = [
				{ step: "requirements", status: "completed" },
				{ step: "planning", status: "running" },
			];

			const events: EventRecord[] = [
				makeEvent({
					id: 1,
					step: "requirements",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeEvent({
					id: 2,
					step: "requirements",
					data: JSON.stringify({ status: "completed" }),
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
				makeEvent({
					id: 3,
					step: "planning",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:02:00.000Z",
				}),
			];

			const steps = deriveStepsFromMachine(stepStatuses, orderedSteps, events);
			expect(steps[0].status).toBe("completed");
			expect(steps[0].startedAt).toBe("2026-03-01T00:00:00.000Z");
			expect(steps[0].completedAt).toBe("2026-03-01T00:01:00.000Z");
			expect(steps[1].status).toBe("running");
			expect(steps[1].startedAt).toBe("2026-03-01T00:02:00.000Z");
			expect(steps[1].completedAt).toBeNull();
			expect(steps[2].status).toBe("not_started");
			expect(steps[3].status).toBe("not_started");
		});

		test("uses only canonical status values", () => {
			const stepStatuses: StepStatusEntry[] = [
				{ step: "requirements", status: "completed" },
				{ step: "planning", status: "running" },
				{ step: "implementation", status: "waiting" },
				{ step: "release", status: "skipped" },
			];

			const steps = deriveStepsFromMachine(stepStatuses, orderedSteps, []);
			const statusValues = steps.map((s) => s.status);

			for (const status of statusValues) {
				expect([
					"not_started",
					"running",
					"waiting",
					"completed",
					"failed",
					"skipped",
				]).toContain(status);
			}
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

		test("step names match expected names", () => {
			const steps = deriveStepsFromMachine([], orderedSteps, []);
			expect(steps.map((s) => s.name)).toEqual(["Plan", "Build", "Review"]);
		});

		test("marks completed and running steps correctly", () => {
			const stepStatuses: StepStatusEntry[] = [
				{ step: "plan", status: "completed" },
				{ step: "build", status: "running" },
			];

			const steps = deriveStepsFromMachine(stepStatuses, orderedSteps, []);
			expect(steps[0].status).toBe("completed");
			expect(steps[1].status).toBe("running");
			expect(steps[2].status).toBe("not_started");
		});

		test("appends synthetic logical sub-agent steps after machine steps in first-seen order", () => {
			const stepStatuses: StepStatusEntry[] = [
				{ step: "plan", status: "completed" },
				{ step: "task-builder::T2", status: "running" },
				{ step: "task-builder::T1", status: "completed" },
			];

			const events: EventRecord[] = [
				makeEvent({
					id: 1,
					step: "plan",
					data: JSON.stringify({ status: "completed" }),
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeEvent({
					id: 2,
					step: "task-builder:building",
					unit: "T2",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
				makeEvent({
					id: 3,
					step: "task-builder:building",
					unit: "T1",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:02:00.000Z",
				}),
				makeEvent({
					id: 4,
					step: "task-builder:completed",
					unit: "T1",
					data: JSON.stringify({ status: "completed" }),
					createdAt: "2026-03-01T00:03:00.000Z",
				}),
			];

			const steps = deriveStepsFromMachine(stepStatuses, orderedSteps, events);
			expect(steps.map((step) => step.id)).toEqual([
				"plan",
				"build",
				"review",
				"task-builder::T2",
				"task-builder::T1",
			]);
			expect(steps[3]).toMatchObject({
				id: "task-builder::T2",
				name: "Task Builder T2",
				status: "running",
				startedAt: "2026-03-01T00:01:00.000Z",
				completedAt: null,
			});
			expect(steps[4]).toMatchObject({
				id: "task-builder::T1",
				name: "Task Builder T1",
				status: "completed",
				startedAt: "2026-03-01T00:02:00.000Z",
				completedAt: "2026-03-01T00:03:00.000Z",
			});
		});

		test("suppresses synthetic logical sub-agent steps when the parent machine already represents them", () => {
			const orderedSteps: OrderedStep[] = [
				{ id: "plan", label: "Plan", index: 0 },
				{ id: "task-builder", label: "Task Builder", index: 1 },
				{ id: "review", label: "Review", index: 2 },
			];
			const stepStatuses: StepStatusEntry[] = [
				{ step: "plan", status: "completed" },
				{ step: "task-builder", status: "running" },
			];

			const events: EventRecord[] = [
				makeEvent({
					id: 1,
					step: "plan",
					data: JSON.stringify({ status: "completed" }),
					createdAt: "2026-03-01T00:00:00.000Z",
				}),
				makeEvent({
					id: 2,
					step: "task-builder:building",
					unit: "T1",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:01:00.000Z",
				}),
				makeEvent({
					id: 3,
					step: "task-builder:building",
					unit: "T2",
					data: JSON.stringify({ status: "running" }),
					createdAt: "2026-03-01T00:02:00.000Z",
				}),
			];

			const steps = deriveStepsFromMachine(stepStatuses, orderedSteps, events);
			expect(steps.map((step) => step.id)).toEqual([
				"plan",
				"task-builder",
				"review",
			]);
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

describe("deriveStepsFromEvents", () => {
	test("groups non-namespaced events by step ID", () => {
		const stepStatuses: StepStatusEntry[] = [
			{ step: "T1", status: "completed" },
			{ step: "T2", status: "running" },
		];

		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "T1",
				data: JSON.stringify({ status: "completed" }),
				createdAt: "2026-03-01T00:00:00.000Z",
			}),
			makeEvent({
				id: 2,
				step: "T2",
				data: JSON.stringify({ status: "running" }),
				createdAt: "2026-03-01T00:01:00.000Z",
			}),
		];

		const steps = deriveStepsFromEvents(stepStatuses, events);
		expect(steps).toHaveLength(2);
		expect(steps[0].id).toBe("T1");
		expect(steps[0].status).toBe("completed");
		expect(steps[1].id).toBe("T2");
		expect(steps[1].status).toBe("running");
	});

	test("latest logical work-item status supersedes earlier lifecycle states in the detail view", () => {
		const stepStatuses: StepStatusEntry[] = [
			{ step: "task-reviewer::T1", status: "completed" },
		];

		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "task-reviewer:failed",
				unit: "T1",
				data: JSON.stringify({ status: "failed" }),
				createdAt: "2026-03-01T00:00:00.000Z",
			}),
			makeEvent({
				id: 2,
				step: "task-reviewer:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
				createdAt: "2026-03-01T00:01:00.000Z",
			}),
		];

		const steps = deriveStepsFromEvents(stepStatuses, events);
		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({
			id: "task-reviewer::T1",
			name: "Task Reviewer T1",
			status: "completed",
			startedAt: "2026-03-01T00:00:00.000Z",
			completedAt: "2026-03-01T00:01:00.000Z",
		});
	});

	test("skips events without step", () => {
		const stepStatuses: StepStatusEntry[] = [
			{ step: "T1", status: "completed" },
		];

		const events: EventRecord[] = [
			makeEvent({ id: 1, data: JSON.stringify({ status: "running" }) }),
			makeEvent({
				id: 2,
				step: "T1",
				data: JSON.stringify({ status: "completed" }),
				createdAt: "2026-03-01T00:00:00.000Z",
			}),
		];

		const steps = deriveStepsFromEvents(stepStatuses, events);
		expect(steps).toHaveLength(1);
		expect(steps[0].id).toBe("T1");
	});

	test("returns empty array for no step events", () => {
		const events: EventRecord[] = [
			makeEvent({ id: 1, data: JSON.stringify({ status: "running" }) }),
		];

		const steps = deriveStepsFromEvents([], events);
		expect(steps).toHaveLength(0);
	});

	test("uses only canonical status values", () => {
		const stepStatuses: StepStatusEntry[] = [
			{ step: "T1", status: "completed" },
			{ step: "T2", status: "failed" },
			{ step: "T3", status: "skipped" },
		];

		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "T1",
				data: JSON.stringify({ status: "completed" }),
			}),
			makeEvent({
				id: 2,
				step: "T2",
				data: JSON.stringify({ status: "failed" }),
			}),
			makeEvent({
				id: 3,
				step: "T3",
				data: JSON.stringify({ status: "skipped" }),
			}),
		];

		const steps = deriveStepsFromEvents(stepStatuses, events);
		for (const step of steps) {
			expect([
				"not_started",
				"running",
				"waiting",
				"completed",
				"failed",
				"skipped",
			]).toContain(step.status);
		}
	});
});

describe("deriveAgentSteps", () => {
	test("groups lifecycle events by logical parent and preserves each unit's latest state", () => {
		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			}),
			makeEvent({
				id: 2,
				step: "task-builder:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			}),
			makeEvent({
				id: 3,
				step: "task-builder:building",
				unit: "T2",
				data: JSON.stringify({ status: "running" }),
			}),
		];

		const agentSteps = deriveAgentSteps(events);
		expect(agentSteps).toEqual({
			"task-builder": [
				{
					id: "T1",
					name: "T1",
					status: "completed",
					agent: "task-builder",
				},
				{
					id: "T2",
					name: "T2",
					status: "running",
					agent: "task-builder",
				},
			],
		});
	});

	test("contains unit tasks under the active workflow step when one is running", () => {
		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "build",
				data: JSON.stringify({ status: "running" }),
			}),
			makeEvent({
				id: 2,
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			}),
			makeEvent({
				id: 3,
				step: "task-reviewer:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			}),
		];

		const agentSteps = deriveAgentSteps(events);
		expect(agentSteps).toEqual({
			build: [
				{
					id: "T1",
					name: "T1",
					status: "running",
					agent: "task-builder",
				},
				{
					id: "T1",
					name: "T1",
					status: "completed",
					agent: "task-reviewer",
				},
			],
		});
	});

	test("two events with same agent and unit merge into one task", () => {
		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			}),
			makeEvent({
				id: 2,
				step: "task-builder:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			}),
		];

		const agentSteps = deriveAgentSteps(events);
		expect(agentSteps).toEqual({
			"task-builder": [
				{
					id: "T1",
					name: "T1",
					status: "completed",
					agent: "task-builder",
				},
			],
		});
	});

	test("two events with same unit but different agents produce separate tasks", () => {
		const events: EventRecord[] = [
			makeEvent({
				id: 1,
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			}),
			makeEvent({
				id: 2,
				step: "task-reviewer:reviewing",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			}),
		];

		const agentSteps = deriveAgentSteps(events);
		expect(agentSteps).toEqual({
			"task-builder": [
				{
					id: "T1",
					name: "T1",
					status: "running",
					agent: "task-builder",
				},
			],
			"task-reviewer": [
				{
					id: "T1",
					name: "T1",
					status: "running",
					agent: "task-reviewer",
				},
			],
		});
	});
});

describe("handleV2WorkflowsListRequest", () => {
	test("returns a list of workflows with names and state counts", async () => {
		const response = await handleV2WorkflowsListRequest();
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			workflows: {
				name: string;
				stateCount: number;
				description: string | null;
			}[];
		};
		expect(body.workflows).toBeDefined();
		expect(Array.isArray(body.workflows)).toBe(true);
		expect(body.workflows.length).toBeGreaterThanOrEqual(3);

		const names = body.workflows.map((w) => w.name);
		expect(names).toContain("build");
		expect(names).toContain("build-fast");
		expect(names).toContain("pr-review");

		const buildWorkflow = body.workflows.find((w) => w.name === "build");
		expect(buildWorkflow).toBeDefined();
		expect(buildWorkflow?.stateCount).toBe(4);

		const buildFastWorkflow = body.workflows.find(
			(w) => w.name === "build-fast",
		);
		expect(buildFastWorkflow).toBeDefined();
		expect(buildFastWorkflow?.stateCount).toBe(3);

		const prReviewWorkflow = body.workflows.find((w) => w.name === "pr-review");
		expect(prReviewWorkflow).toBeDefined();
		expect(prReviewWorkflow?.stateCount).toBe(2);
	});

	test("each workflow entry has the expected shape", async () => {
		const response = await handleV2WorkflowsListRequest();
		const body = (await response.json()) as {
			workflows: {
				name: string;
				stateCount: number;
				description: string | null;
			}[];
		};

		for (const workflow of body.workflows) {
			expect(typeof workflow.name).toBe("string");
			expect(workflow.name.length).toBeGreaterThan(0);
			expect(typeof workflow.stateCount).toBe("number");
			expect(workflow.stateCount).toBeGreaterThan(0);
		}
	});
});

describe("handleV2WorkflowDetailRequest", () => {
	test("returns full state machine definition for 'build'", async () => {
		const response = await handleV2WorkflowDetailRequest("build");
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			name: string;
			states: {
				id: string;
				label: string | null;
				isInitial: boolean;
				isTerminal: boolean;
			}[];
			transitions: {
				sourceId: string;
				targetId: string;
				label: string | null;
			}[];
			orderedSteps: { id: string; label: string; index: number }[];
		};

		expect(body.name).toBe("build");

		expect(body.states).toHaveLength(4);
		const stateIds = body.states.map((s) => s.id);
		expect(stateIds).toContain("requirements");
		expect(stateIds).toContain("planning");
		expect(stateIds).toContain("implementation");
		expect(stateIds).toContain("release");

		const reqState = body.states.find((s) => s.id === "requirements");
		expect(reqState?.isInitial).toBe(true);
		expect(reqState?.isTerminal).toBe(true);

		const releaseState = body.states.find((s) => s.id === "release");
		expect(releaseState?.isInitial).toBe(false);
		expect(releaseState?.isTerminal).toBe(true);

		expect(body.transitions).toHaveLength(8);
		const reqToPlanning = body.transitions.find(
			(t) => t.sourceId === "requirements" && t.targetId === "planning",
		);
		expect(reqToPlanning).toBeDefined();
		expect(reqToPlanning?.label).toBe("requirements_accepted");

		const implementationToRelease = body.transitions.find(
			(t) => t.sourceId === "implementation" && t.targetId === "release",
		);
		expect(implementationToRelease).toBeDefined();
		expect(implementationToRelease?.label).toBe("readiness_ready");

		const releaseAddTask = body.transitions.find(
			(t) => t.sourceId === "release" && t.targetId === "implementation",
		);
		expect(releaseAddTask).toBeDefined();
		expect(releaseAddTask?.label).toBe("add_task");

		expect(body.orderedSteps).toHaveLength(4);
		expect(body.orderedSteps.map((s) => s.id)).toEqual([
			"requirements",
			"planning",
			"implementation",
			"release",
		]);
		expect(body.orderedSteps[0].index).toBe(0);
		expect(body.orderedSteps[3].index).toBe(3);
	});

	test("returns full state machine definition for 'build-fast'", async () => {
		const response = await handleV2WorkflowDetailRequest("build-fast");
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			name: string;
			states: { id: string }[];
			transitions: { sourceId: string; targetId: string }[];
			orderedSteps: { id: string; label: string; index: number }[];
		};

		expect(body.name).toBe("build-fast");
		expect(body.states).toHaveLength(3);
		expect(body.orderedSteps.map((s) => s.id)).toEqual([
			"plan",
			"build",
			"review",
		]);
	});

	test("returns full state machine definition for 'pr-review'", async () => {
		const response = await handleV2WorkflowDetailRequest("pr-review");
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			name: string;
			states: { id: string }[];
			orderedSteps: { id: string }[];
		};

		expect(body.name).toBe("pr-review");
		expect(body.states).toHaveLength(2);
		expect(body.orderedSteps.map((s) => s.id)).toEqual([
			"reviewing",
			"posting",
		]);
	});

	test("returns 404 for nonexistent workflow", async () => {
		const response = await handleV2WorkflowDetailRequest(
			"nonexistent-workflow",
		);
		expect(response.status).toBe(404);

		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("nonexistent-workflow");
	});

	test("returns 404 for workflow without state.mmd", async () => {
		const response = await handleV2WorkflowDetailRequest("code-check");
		expect(response.status).toBe(404);

		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("code-check");
	});

	test("response time is under 100ms for cached lookups", async () => {
		await handleV2WorkflowDetailRequest("build");

		const start = performance.now();
		await handleV2WorkflowDetailRequest("build");
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(100);
	});
});
