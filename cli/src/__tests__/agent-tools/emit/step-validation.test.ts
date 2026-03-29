/**
 * Unit and integration tests for step validation, flow-mismatch checks,
 * and predecessor auto-completion in the emit pipeline.
 *
 * Covers: isNamespacedStep, getCurrentRunState, formatStepValidationError,
 * validateStepAgainstStateMachine, flow-mismatch rejection, and predecessor
 * auto-completion logic within handleSkippedSteps.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	getStepStatuses,
	insertEvent,
	insertRun,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import { executeEmit } from "../../../agent-tools/emit/index.js";
import type { EmitInput } from "../../../agent-tools/emit/models.js";
import {
	formatStepValidationError,
	getCurrentRunState,
	isNamespacedStep,
	validateStepAgainstStateMachine,
} from "../../../agent-tools/emit/step-validation.js";
import { clearCache } from "../../../agent-tools/state-machine/index.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("isNamespacedStep", () => {
	test("returns true for step with colon separator", () => {
		expect(isNamespacedStep("task-builder:building")).toBe(true);
	});

	test("returns false for step without colon", () => {
		expect(isNamespacedStep("building")).toBe(false);
	});

	test("returns true for step with leading colon", () => {
		expect(isNamespacedStep(":building")).toBe(true);
	});

	test("returns true for step with multiple colons", () => {
		expect(isNamespacedStep("task-builder:sub:building")).toBe(true);
	});

	test("returns false for empty string", () => {
		expect(isNamespacedStep("")).toBe(false);
	});

	test("returns true for colon-only string", () => {
		expect(isNamespacedStep(":")).toBe(true);
	});
});

describe("getCurrentRunState", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("step-val-state");
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns null when no events exist", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-no-events";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		const state = getCurrentRunState(db, runId);
		expect(state).toBeNull();
	});

	test("returns latest step from status_change events", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-with-events";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId,
			type: "status_change",
			step: "requirements",
			data: JSON.stringify({ status: "running" }),
		});
		insertEvent(db, {
			runId,
			type: "status_change",
			step: "design",
			data: JSON.stringify({ status: "running" }),
		});

		const state = getCurrentRunState(db, runId);
		expect(state).toBe("design");
	});

	test("ignores unit-level events", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-unit-events";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId,
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
		});
		insertEvent(db, {
			runId,
			type: "status_change",
			step: "build",
			unit: "T1",
			data: JSON.stringify({ status: "running" }),
		});

		const state = getCurrentRunState(db, runId);
		expect(state).toBe("build");
	});

	test("ignores non-status_change events", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-mixed-events";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId,
			type: "status_change",
			step: "requirements",
			data: JSON.stringify({ status: "running" }),
		});
		insertEvent(db, {
			runId,
			type: "btw_update",
			step: "design",
			data: JSON.stringify({ message: "hello" }),
		});

		const state = getCurrentRunState(db, runId);
		expect(state).toBe("requirements");
	});
});

describe("formatStepValidationError", () => {
	test("formats error with current state and valid transitions", () => {
		const msg = formatStepValidationError(
			"biulding",
			"build",
			["requirements", "design", "tasks", "build", "verify", "archive"],
			"tasks",
			["build"],
		);

		expect(msg).toContain('step "biulding"');
		expect(msg).toContain('"build" state machine');
		expect(msg).toContain(
			"Valid states: [requirements, design, tasks, build, verify, archive]",
		);
		expect(msg).toContain('Current state: "tasks"');
		expect(msg).toContain('Valid transitions from "tasks": [build]');
	});

	test("formats error without current state when state unknown", () => {
		const msg = formatStepValidationError(
			"biulding",
			"build",
			["requirements", "design", "tasks", "build", "verify", "archive"],
			null,
			null,
		);

		expect(msg).toContain('step "biulding"');
		expect(msg).toContain('"build" state machine');
		expect(msg).toContain(
			"Valid states: [requirements, design, tasks, build, verify, archive]",
		);
		expect(msg).not.toContain("Current state:");
		expect(msg).not.toContain("Valid transitions from");
	});

	test("includes multiple valid transitions", () => {
		const msg = formatStepValidationError(
			"invalid",
			"build",
			["a", "b", "c"],
			"verify",
			["build", "archive"],
		);

		expect(msg).toContain('Valid transitions from "verify": [build, archive]');
	});

	test("handles empty valid transitions list", () => {
		const msg = formatStepValidationError(
			"invalid",
			"build",
			["a", "b"],
			"terminal",
			[],
		);

		expect(msg).toContain('Valid transitions from "terminal": []');
	});
});

describe("validateStepAgainstStateMachine", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		tempDir = await createTempDir("step-val-validate");
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		await rm(tempDir, { recursive: true, force: true });
	});

	const makeRun = (overrides: Partial<{ id: string; flow: string }> = {}) => ({
		id: overrides.id ?? "run-test",
		flow: overrides.flow ?? "build",
		featureId: "feat",
		projectPath: tempDir,
		rp1ProjectRoot: tempDir,
		rp1KbDir: join(tempDir, ".rp1", "context"),
		rp1WorkDir: join(tempDir, ".rp1", "work"),
		status: "running" as const,
		name: null,
		harness: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	test("skips validation when no step provided", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			projectPath: tempDir,
			data: { status: "running", workflow: "build" },
		};

		await expectTaskRight(validateStepAgainstStateMachine(input, makeRun()));
	});

	test("skips validation for namespaced steps", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			step: "task-builder:building",
			projectPath: tempDir,
			data: { status: "running", workflow: "build" },
		};

		await expectTaskRight(validateStepAgainstStateMachine(input, makeRun()));
	});

	test("skips validation when workflow is unknown", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			step: "anything",
			workflow: "unknown",
			projectPath: tempDir,
			data: { status: "running" },
		};

		await expectTaskRight(
			validateStepAgainstStateMachine(input, makeRun({ flow: "unknown" })),
		);
	});

	test("skips validation when run flow is unknown", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			step: "anything",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running" },
		};

		await expectTaskRight(
			validateStepAgainstStateMachine(input, makeRun({ flow: "unknown" })),
		);
	});

	test("passes for valid step in build workflow", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build" },
		};

		await expectTaskRight(validateStepAgainstStateMachine(input, makeRun()));
	});

	test("rejects invalid step with actionable error message", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-invalid-step";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "biulding",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build" },
		};

		const error = await expectTaskLeft(
			validateStepAgainstStateMachine(input, makeRun({ id: runId })),
		);

		const msg = getErrorMessage(error);
		expect(msg).toContain('step "biulding"');
		expect(msg).toContain('"build" state machine');
		expect(msg).toContain("Valid states:");
		expect(msg).toContain("requirements");
	});

	test("rejects invalid step with current state and transitions when state is known", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-with-state";
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});
		insertEvent(db, {
			runId,
			type: "status_change",
			step: "tasks",
			data: JSON.stringify({ status: "running" }),
		});

		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "biulding",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build" },
		};

		const error = await expectTaskLeft(
			validateStepAgainstStateMachine(input, makeRun({ id: runId })),
		);

		const msg = getErrorMessage(error);
		expect(msg).toContain('Current state: "tasks"');
		expect(msg).toContain('Valid transitions from "tasks"');
	});

	test("returns error when state machine cannot be loaded for known workflow", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: "run-test",
			step: "anything",
			workflow: "nonexistent-workflow-xyz",
			projectPath: tempDir,
			data: { status: "running", workflow: "nonexistent-workflow-xyz" },
		};

		const error = await expectTaskLeft(
			validateStepAgainstStateMachine(
				input,
				makeRun({ flow: "nonexistent-workflow-xyz" }),
			),
		);

		expect(error._tag).toBeDefined();
	});
});

describe("flow-mismatch check (via executeEmit)", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		tempDir = await createTempDir("flow-mismatch");
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("backfills legacy run flow when stored flow is 'unknown'", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = "run-flow-mismatch";
		insertRun(db, {
			id: runId,
			flow: "unknown",
			featureId: "feat",
			projectPath: tempDir,
		});

		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);

		const row = db.prepare("SELECT flow FROM runs WHERE id = ?").get(runId) as {
			flow: string;
		} | null;
		expect(row?.flow).toBe("build");
	});

	test("passes when run flow matches provided workflow", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-flow-match-${Date.now()}`,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);
	});

	test("passes when no --workflow is provided", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-no-workflow-${Date.now()}`,
			step: "somestep",
			projectPath: tempDir,
			data: { status: "running", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);
	});
});

describe("emit pipeline: step validation integration", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		tempDir = await createTempDir("emit-step-val");
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("valid step is persisted without errors", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-valid-${Date.now()}`,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);
		expect(result.data.eventId).toBeGreaterThan(0);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const event = db
			.prepare("SELECT * FROM events WHERE id = $id")
			.get({ $id: result.data.eventId }) as { step: string } | null;
		expect(event).not.toBeNull();
		expect(event?.step).toBe("requirements");
	});

	test("invalid step is rejected and not persisted", async () => {
		const runId = `run-invalid-${Date.now()}`;
		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "nonexistent_step",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};

		const error = await expectTaskLeft(executeEmit(input));
		const msg = getErrorMessage(error);
		expect(msg).toContain("nonexistent_step");
		expect(msg).toContain("Valid states:");

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const events = db
			.prepare("SELECT * FROM events WHERE run_id = $runId AND step = $step")
			.all({ $runId: runId, $step: "nonexistent_step" });
		expect(events).toHaveLength(0);
	});

	test("namespaced step is persisted without validation error", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-ns-${Date.now()}`,
			step: "task-builder:building",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const event = db
			.prepare("SELECT * FROM events WHERE id = $id")
			.get({ $id: result.data.eventId }) as { step: string } | null;
		expect(event?.step).toBe("task-builder:building");
	});

	test("state machine load failure rejects emit for known workflow", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-load-fail-${Date.now()}`,
			step: "build",
			workflow: "nonexistent-workflow-abc",
			projectPath: tempDir,
			data: {
				status: "running",
				workflow: "nonexistent-workflow-abc",
				feature: "feat",
			},
		};

		const error = await expectTaskLeft(executeEmit(input));
		expect(error._tag).toBeDefined();
	});

	test("workflows without state machines skip validation", async () => {
		const input: EmitInput = {
			type: "status_change",
			runId: `run-no-sm-${Date.now()}`,
			step: "any_step",
			projectPath: tempDir,
			data: { status: "running", feature: "feat" },
		};

		const result = await expectTaskRight(executeEmit(input));
		expect(result.success).toBe(true);
	});
});

describe("predecessor auto-completion", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		tempDir = await createTempDir("pred-completion");
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		clearCache();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("auto-completes running predecessor when next step emits running", async () => {
		const runId = `run-pred-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors).toBeDefined();
		expect(result.data.completedPredecessors).toContain("requirements");

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const statuses = getStepStatuses(db, runId);
		const reqStatus = statuses.find((s) => s.step === "requirements");
		expect(reqStatus?.status).toBe("completed");
	});

	test("auto-completes waiting predecessor when next step emits running", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const runId = `run-pred-wait-${Date.now()}`;
		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId,
			type: "status_change",
			step: "requirements",
			data: JSON.stringify({ status: "waiting" }),
		});

		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input));

		expect(result.data.completedPredecessors).toContain("requirements");
	});

	test("does not auto-complete predecessor with completed status", async () => {
		const runId = `run-pred-done-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const inputComplete: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "completed", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(inputComplete));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors ?? []).not.toContain(
			"requirements",
		);
	});

	test("does not auto-complete predecessor with failed status", async () => {
		const runId = `run-pred-fail-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "failed", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors ?? []).not.toContain(
			"requirements",
		);
	});

	test("auto-completes transitive predecessors in running status", async () => {
		const runId = `run-pred-trans-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "build",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors ?? []).toContain("requirements");
	});

	test("does not trigger predecessor completion when unit is set", async () => {
		const runId = `run-pred-unit-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			unit: "T1",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors).toBeUndefined();

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const statuses = getStepStatuses(db, runId);
		const reqStatus = statuses.find((s) => s.step === "requirements");
		expect(reqStatus?.status).toBe("running");
	});

	test("does not trigger predecessor completion for non-running status", async () => {
		const runId = `run-pred-complete-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "completed", workflow: "build", feature: "feat" },
		};
		const result = await expectTaskRight(executeEmit(input2));

		expect(result.data.completedPredecessors).toBeUndefined();
	});

	test("auto-completed events have timestamps before the current event", async () => {
		const runId = `run-pred-ts-${Date.now()}`;

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input1));

		const input2: EmitInput = {
			type: "status_change",
			runId,
			step: "design",
			workflow: "build",
			projectPath: tempDir,
			data: { status: "running", workflow: "build", feature: "feat" },
		};
		await expectTaskRight(executeEmit(input2));

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const events = db
			.prepare(
				"SELECT * FROM events WHERE run_id = $runId AND type = 'status_change' ORDER BY id ASC",
			)
			.all({ $runId: runId }) as {
			step: string;
			data: string;
			created_at: string;
		}[];

		const reqCompleted = events.find(
			(e) =>
				e.step === "requirements" && JSON.parse(e.data).status === "completed",
		);
		const designRunning = events.find(
			(e) => e.step === "design" && JSON.parse(e.data).status === "running",
		);

		expect(reqCompleted).toBeDefined();
		expect(designRunning).toBeDefined();
		if (reqCompleted && designRunning) {
			expect(reqCompleted.created_at <= designRunning.created_at).toBe(true);
		}
	});
});
