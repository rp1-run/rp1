/**
 * Unit tests for notification auto-generation logic.
 * Tests trigger conditions, message formatting, deduplication, and event type handling.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import { listNotifications } from "../../../agent-tools/emit/notification-database.js";
import { maybeGenerateNotification } from "../../../agent-tools/emit/notification-generator.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("notification-generator", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `notif-gen-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("status_change: completed", () => {
		test("generates notification with sourceType run on completed status", async () => {
			const dbPath = join(tempDir, "completed-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-1",
				"completed",
				"status_change",
				"proj-1",
				"build",
				"task-builder:completed",
				{ status: "completed" },
			);

			expect(result).not.toBeNull();
			expect(result!.message).toBe("build completed");
			expect(result!.sourceType).toBe("run");
			expect(result!.sourceId).toBe("run-1");
			expect(result!.route).toBe("/runs/run-1");
			expect(result!.projectId).toBe("proj-1");
		});

		test("uses 'Run' prefix when workflow is unknown", async () => {
			const dbPath = join(tempDir, "completed-unknown-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-2",
				"completed",
				"status_change",
				null,
				"unknown",
				null,
				{ status: "completed" },
			);

			expect(result).not.toBeNull();
			expect(result!.message).toBe("Run completed");
		});
	});

	describe("status_change: failed", () => {
		test("generates notification with sourceType run on failed status", async () => {
			const dbPath = join(tempDir, "failed-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-3",
				"failed",
				"status_change",
				"proj-2",
				"deploy",
				"verifier:failed",
				{ status: "failed" },
			);

			expect(result).not.toBeNull();
			expect(result!.message).toBe("deploy failed");
			expect(result!.sourceType).toBe("run");
			expect(result!.route).toBe("/runs/run-3");
		});
	});

	describe("status_change: non-terminal statuses", () => {
		test("does NOT generate notification for running status", async () => {
			const dbPath = join(tempDir, "running-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-4",
				"running",
				"status_change",
				null,
				"build",
				"task-builder:building",
				{ status: "running" },
			);

			expect(result).toBeNull();
		});

		test("does NOT generate notification for not_started status", async () => {
			const dbPath = join(tempDir, "not-started-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-5",
				"not_started",
				"status_change",
				null,
				"build",
				null,
				{ status: "not_started" },
			);

			expect(result).toBeNull();
		});

		test("does NOT generate notification for waiting status", async () => {
			const dbPath = join(tempDir, "waiting-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-6",
				"waiting",
				"status_change",
				null,
				"build",
				null,
				{ status: "waiting" },
			);

			expect(result).toBeNull();
		});
	});

	describe("deduplication", () => {
		test("does NOT generate duplicate notification for same run + completed status", async () => {
			const dbPath = join(tempDir, "dedup-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const first = maybeGenerateNotification(
				db,
				"run-7",
				"completed",
				"status_change",
				null,
				"build",
				null,
				{ status: "completed" },
			);
			expect(first).not.toBeNull();

			const second = maybeGenerateNotification(
				db,
				"run-7",
				"completed",
				"status_change",
				null,
				"build",
				null,
				{ status: "completed" },
			);
			expect(second).toBeNull();

			const list = listNotifications(db);
			expect(list.total).toBe(1);
		});
	});

	describe("waiting_for_user", () => {
		test("generates notification with sourceType agent", async () => {
			const dbPath = join(tempDir, "wfu-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-8",
				"waiting",
				"waiting_for_user",
				"proj-3",
				"build",
				"task-builder:waiting",
				{ prompt: "Code audit found 3 issues -- review recommended" },
			);

			expect(result).not.toBeNull();
			expect(result!.sourceType).toBe("agent");
			expect(result!.message).toBe(
				"Code audit found 3 issues -- review recommended",
			);
			expect(result!.sourceId).toBe("run-8");
			expect(result!.route).toBe("/runs/run-8");
			expect(result!.projectId).toBe("proj-3");
		});

		test("creates distinct notifications for multiple waiting_for_user emits on same run", async () => {
			const dbPath = join(tempDir, "wfu-multi-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const first = maybeGenerateNotification(
				db,
				"run-9",
				"waiting",
				"waiting_for_user",
				null,
				"build",
				null,
				{ prompt: "First prompt" },
			);

			const second = maybeGenerateNotification(
				db,
				"run-9",
				"waiting",
				"waiting_for_user",
				null,
				"build",
				null,
				{ prompt: "Second prompt" },
			);

			expect(first).not.toBeNull();
			expect(second).not.toBeNull();
			expect(first!.id).not.toBe(second!.id);

			const list = listNotifications(db);
			expect(list.total).toBe(2);
		});

		test("truncates long prompt messages", async () => {
			const dbPath = join(tempDir, "wfu-truncate-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const longPrompt = "A".repeat(300);
			const result = maybeGenerateNotification(
				db,
				"run-10",
				"waiting",
				"waiting_for_user",
				null,
				"build",
				null,
				{ prompt: longPrompt },
			);

			expect(result).not.toBeNull();
			expect(result!.message.length).toBeLessThanOrEqual(200);
			expect(result!.message.endsWith("…")).toBe(true);
		});

		test("uses fallback message when prompt is missing", async () => {
			const dbPath = join(tempDir, "wfu-no-prompt-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-11",
				"waiting",
				"waiting_for_user",
				null,
				null,
				null,
				{},
			);

			expect(result).not.toBeNull();
			expect(result!.message).toBe("Agent is waiting for input");
		});
	});

	describe("non-triggering event types", () => {
		test("does NOT generate notification for artifact_registered", async () => {
			const dbPath = join(tempDir, "artifact-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-12",
				"running",
				"artifact_registered",
				null,
				"build",
				null,
				{ path: "foo.md" },
			);

			expect(result).toBeNull();
		});

		test("does NOT generate notification for btw_update", async () => {
			const dbPath = join(tempDir, "btw-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = maybeGenerateNotification(
				db,
				"run-13",
				"running",
				"btw_update",
				null,
				"build",
				null,
				{ message: "progress update" },
			);

			expect(result).toBeNull();
		});
	});
});
