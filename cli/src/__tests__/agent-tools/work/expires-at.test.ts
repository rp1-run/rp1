/**
 * Integration tests for expires_at / TTL handling in work update.
 * Tests default TTL, custom --ttl flag, stale row pruning, and backward compat.
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
	getCurrentWorkflowState,
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

describe("expires_at handling", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `work-expires-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-expires.db");
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

	describe("default TTL", () => {
		test("applies 8h TTL when --workflow is provided", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "default-ttl-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-default-ttl",
			};

			const before = Date.now();
			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			const after = Date.now();

			expect(result.expiresAt).toBeDefined();
			const expiresMs = new Date(result.expiresAt as string).getTime();
			const eightHoursMs = 28800 * 1000;
			expect(expiresMs).toBeGreaterThanOrEqual(before + eightHoursMs - 1000);
			expect(expiresMs).toBeLessThanOrEqual(after + eightHoursMs + 1000);
		});

		test("does not set expiresAt when --workflow is not provided", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "no-workflow-ttl",
				step: "T1",
				status: "started",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);

			expect(result.expiresAt).toBeUndefined();
		});
	});

	describe("--ttl flag override", () => {
		test("uses custom TTL when provided", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "custom-ttl-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-custom-ttl",
				ttl: "3600",
			};

			const before = Date.now();
			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			const after = Date.now();

			expect(result.expiresAt).toBeDefined();
			const expiresMs = new Date(result.expiresAt as string).getTime();
			const oneHourMs = 3600 * 1000;
			expect(expiresMs).toBeGreaterThanOrEqual(before + oneHourMs - 1000);
			expect(expiresMs).toBeLessThanOrEqual(after + oneHourMs + 1000);
		});

		test("rejects invalid TTL value", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "invalid-ttl-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-bad-ttl",
				ttl: "not-a-number",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain(
				"TTL must be a positive integer",
			);
		});

		test("rejects zero TTL", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "zero-ttl-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-zero-ttl",
				ttl: "0",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
		});

		test("rejects negative TTL", async () => {
			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "neg-ttl-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-neg-ttl",
				ttl: "-100",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("expired rows excluded from current-state queries", () => {
		test("expired row is invisible to getCurrentWorkflowState", async () => {
			const expiredInput: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "expired-state-test",
				step: "requirements",
				status: "in_progress",
				runId: "run-expired",
				expiresAt: new Date(Date.now() - 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(expiredInput, testDbPath));

			const currentState = await expectTaskRight(
				getCurrentWorkflowState(
					"/test/project",
					"expired-state-test",
					"run-expired",
					testDbPath,
				),
			);

			expect(currentState).toBeNull();
		});

		test("non-expired row is visible to getCurrentWorkflowState", async () => {
			const validInput: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "valid-state-test",
				step: "design",
				status: "in_progress",
				runId: "run-valid",
				expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(validInput, testDbPath));

			const currentState = await expectTaskRight(
				getCurrentWorkflowState(
					"/test/project",
					"valid-state-test",
					"run-valid",
					testDbPath,
				),
			);

			expect(currentState).toBe("design");
		});
	});

	describe("NULL expires_at backward compatibility", () => {
		test("rows with NULL expires_at are always included", async () => {
			const legacyInput: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "legacy-test",
				step: "some-step",
				status: "in_progress",
			};
			await expectTaskRight(insertStatusUpdate(legacyInput, testDbPath));

			const currentState = await expectTaskRight(
				getCurrentWorkflowState(
					"/test/project",
					"legacy-test",
					undefined,
					testDbPath,
				),
			);

			expect(currentState).toBe("some-step");
		});
	});

	describe("stale run treated as first update", () => {
		test("expired run allows fresh initial state", async () => {
			const expiredInput: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "stale-run-test",
				step: "design",
				status: "in_progress",
				runId: "run-stale",
				expiresAt: new Date(Date.now() - 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(expiredInput, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "stale-run-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-stale",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.step).toBe("requirements");
		});

		test("expired run rejects non-initial state as first update", async () => {
			const expiredInput: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "stale-reject-test",
				step: "design",
				status: "in_progress",
				runId: "run-stale-reject",
				expiresAt: new Date(Date.now() - 1000).toISOString(),
			};
			await expectTaskRight(insertStatusUpdate(expiredInput, testDbPath));

			const options: UpdateCommandOptions = {
				project: "/test/project",
				feature: "stale-reject-test",
				step: "build",
				status: "in_progress",
				workflow: "build",
				runId: "run-stale-reject",
			};

			const error = await expectTaskLeft(
				validateUpdateOptions(options, testDbPath),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("initial state");
		});
	});

	describe("TTL refresh on valid transition", () => {
		test("each transition sets a fresh expires_at", async () => {
			const options1: UpdateCommandOptions = {
				project: "/test/project",
				feature: "refresh-test",
				step: "requirements",
				status: "in_progress",
				workflow: "build",
				runId: "run-refresh",
			};

			const result1 = await expectTaskRight(
				validateUpdateOptions(options1, testDbPath),
			);
			await expectTaskRight(insertStatusUpdate(result1, testDbPath));
			const expires1 = result1.expiresAt as string;

			await new Promise((resolve) => setTimeout(resolve, 50));

			const options2: UpdateCommandOptions = {
				project: "/test/project",
				feature: "refresh-test",
				step: "design",
				status: "in_progress",
				workflow: "build",
				runId: "run-refresh",
			};

			const result2 = await expectTaskRight(
				validateUpdateOptions(options2, testDbPath),
			);
			const expires2 = result2.expiresAt as string;

			expect(new Date(expires2).getTime()).toBeGreaterThan(
				new Date(expires1).getTime(),
			);
		});
	});
});
