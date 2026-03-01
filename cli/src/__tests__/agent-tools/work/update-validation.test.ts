/**
 * Integration tests for workflow transition validation in work update.
 * Tests the full pipeline: --workflow flag -> state machine load -> validate -> produce StatusUpdateInput.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCache } from "../../../agent-tools/state-machine/index.js";
import {
	closeDatabase,
	insertStatusUpdate,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import type { StatusUpdateInput } from "../../../agent-tools/work/models.js";
import {
	type UpdateCommandOptions,
	validateUpdateOptions,
} from "../../../agent-tools/work/update.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("workflow transition validation", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `work-validation-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-validation.db");
	});

	beforeEach(() => {
		clearCache();
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("valid workflow pipeline", () => {
		test("accepts first update to an initial state", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "test-feature",
				task: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-001",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);

			expect(result.projectPath).toBe("/test/project");
			expect(result.feature).toBe("test-feature");
			expect(result.task).toBe("requirements");
			expect(result.status).toBe("in_progress");
			expect(result.workflow).toBe("build");
			expect(result.runId).toBe("run-001");
			expect(result.expiresAt).toBeDefined();
		});

		test("accepts valid transition from current state", async () => {
			const seed: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "transition-test",
				task: "requirements",
				status: "in_progress",
				runId: "run-002",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seed, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "transition-test",
				task: "design",
				status: "in_progress",
				workflow: "build",
				runId: "run-002",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);

			expect(result.task).toBe("design");
			expect(result.workflow).toBe("build");
			expect(result.expiresAt).toBeDefined();
		});

		test("accepts verify -> build retry loop transition", async () => {
			const seed: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "retry-test",
				task: "verify",
				status: "in_progress",
				runId: "run-retry",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seed, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "retry-test",
				task: "build",
				status: "in_progress",
				workflow: "build",
				runId: "run-retry",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);

			expect(result.task).toBe("build");
		});

		test("includes expiresAt with default 8h TTL", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "ttl-test",
				task: "plan",
				status: "in_progress",
				workflow: "build-fast",
				runId: "run-ttl",
			};

			const before = Date.now();
			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			const after = Date.now();

			expect(result.expiresAt).toBeDefined();
			const expiresAt = result.expiresAt as string;
			const expiresMs = new Date(expiresAt).getTime();
			const expectedMin = before + DEFAULT_TTL_MS - 1000;
			const expectedMax = after + DEFAULT_TTL_MS + 1000;
			expect(expiresMs).toBeGreaterThan(expectedMin);
			expect(expiresMs).toBeLessThan(expectedMax);
		});
	});

	describe("invalid transition rejection", () => {
		test("rejects transition to non-adjacent state", async () => {
			const seed: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "invalid-test",
				task: "requirements",
				status: "in_progress",
				runId: "run-invalid",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seed, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "invalid-test",
				task: "verify",
				status: "in_progress",
				workflow: "build",
				runId: "run-invalid",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("Invalid transition");
			expect(msg).toContain("requirements");
			expect(msg).toContain("verify");
			expect(msg).toContain("design");
		});

		test("rejects first update to non-initial state", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "non-initial-test",
				task: "design",
				status: "in_progress",
				workflow: "build",
				runId: "run-non-initial",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("initial state");
			expect(msg).toContain("requirements");
		});

		test("rejects unknown state in the workflow", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "unknown-state-test",
				task: "nonexistent-state",
				status: "in_progress",
				workflow: "build",
				runId: "run-unknown",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("nonexistent-state");
			expect(msg).toContain("not a valid state");
		});

		test("rejects nonexistent workflow", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "no-workflow-test",
				task: "something",
				status: "in_progress",
				workflow: "nonexistent-workflow",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("No state machine defined");
			expect(msg).toContain("nonexistent-workflow");
		});

		test("rejects --workflow without --task", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "no-task-test",
				status: "in_progress",
				workflow: "build",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("--task is required");
		});
	});

	describe("run-id isolation", () => {
		test("separate runs track state independently", async () => {
			const seedRunA: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "isolation-test",
				task: "requirements",
				status: "in_progress",
				runId: "run-a",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seedRunA, testDbPath));

			const seedRunB: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "isolation-test",
				task: "plan",
				status: "in_progress",
				runId: "run-b",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seedRunB, testDbPath));

			const optionsA: UpdateCommandOptions = {
				project: "/test/project",
				feature: "isolation-test",
				task: "design",
				status: "in_progress",
				workflow: "build",
				runId: "run-a",
			};
			const resultA = await expectTaskRight(
				validateUpdateOptions(optionsA, testDbPath),
			);
			expect(resultA.task).toBe("design");

			const optionsB: UpdateCommandOptions = {
				project: "/test/project",
				feature: "isolation-test",
				task: "build",
				status: "in_progress",
				workflow: "build-fast",
				runId: "run-b",
			};
			const resultB = await expectTaskRight(
				validateUpdateOptions(optionsB, testDbPath),
			);
			expect(resultB.task).toBe("build");
		});

		test("run-a transition fails for run-b's current state", async () => {
			const seedRunA: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "cross-run-test",
				task: "requirements",
				status: "in_progress",
				runId: "run-x",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(seedRunA, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "cross-run-test",
				task: "verify",
				status: "in_progress",
				workflow: "build",
				runId: "run-x",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("Invalid transition");
		});
	});

	describe("FR-006: missing --workflow detection", () => {
		test("rejects task matching a workflow state without --workflow flag", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "fr006-test",
				task: "requirements",
				status: "in_progress",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("--workflow");
			expect(msg).toContain("build");
		});

		test("allows task not matching any workflow state without --workflow", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "no-conflict-test",
				task: "T1",
				status: "in_progress",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.task).toBe("T1");
			expect(result.workflow).toBeUndefined();
			expect(result.expiresAt).toBeUndefined();
		});

		test("allows updates without --task and without --workflow", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "no-task-no-workflow",
				status: "started",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.workflow).toBeUndefined();
			expect(result.expiresAt).toBeUndefined();
		});
	});
});

const DEFAULT_TTL_MS = 28800 * 1000;
