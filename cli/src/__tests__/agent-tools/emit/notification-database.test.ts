/**
 * Unit tests for the notification database service layer.
 * Tests CRUD operations, pagination, project filtering, and deduplication.
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
import {
	dismissNotification,
	hasNotificationForSource,
	insertNotification,
	listNotifications,
} from "../../../agent-tools/emit/notification-database.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("notification-database", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `notif-db-test-${Date.now()}`);
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

	describe("insertNotification", () => {
		test("stores all fields and returns created record", async () => {
			const dbPath = join(tempDir, "insert-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const record = insertNotification(db, {
				message: "build completed",
				sourceType: "run",
				sourceId: "run-abc-123",
				route: "/runs/run-abc-123",
				projectId: "proj-1",
			});

			expect(record.id).toBeGreaterThan(0);
			expect(record.message).toBe("build completed");
			expect(record.sourceType).toBe("run");
			expect(record.sourceId).toBe("run-abc-123");
			expect(record.route).toBe("/runs/run-abc-123");
			expect(record.projectId).toBe("proj-1");
			expect(record.dismissed).toBe(false);
			expect(record.createdAt).toBeTruthy();
		});

		test("stores record with optional fields as null", async () => {
			const dbPath = join(tempDir, "insert-nulls-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const record = insertNotification(db, {
				message: "system announcement",
				sourceType: "system",
			});

			expect(record.sourceId).toBeNull();
			expect(record.route).toBeNull();
			expect(record.projectId).toBeNull();
		});
	});

	describe("listNotifications", () => {
		test("returns non-dismissed notifications ordered by created_at DESC", async () => {
			const dbPath = join(tempDir, "list-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "first",
				sourceType: "run",
				sourceId: "r1",
			});
			insertNotification(db, {
				message: "second",
				sourceType: "run",
				sourceId: "r2",
			});
			insertNotification(db, {
				message: "third",
				sourceType: "agent",
				sourceId: "r3",
			});

			const result = listNotifications(db);

			expect(result.total).toBe(3);
			expect(result.notifications).toHaveLength(3);
			expect(result.notifications[0].message).toBe("third");
			expect(result.notifications[1].message).toBe("second");
			expect(result.notifications[2].message).toBe("first");
		});

		test("excludes dismissed notifications", async () => {
			const dbPath = join(tempDir, "list-dismissed-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, { message: "keep", sourceType: "run" });
			const n2 = insertNotification(db, {
				message: "dismiss-me",
				sourceType: "run",
			});

			dismissNotification(db, n2.id);

			const result = listNotifications(db);
			expect(result.total).toBe(1);
			expect(result.notifications[0].message).toBe("keep");
		});

		test("filters by projectId", async () => {
			const dbPath = join(tempDir, "list-project-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "proj-a",
				sourceType: "run",
				projectId: "a",
			});
			insertNotification(db, {
				message: "proj-b",
				sourceType: "run",
				projectId: "b",
			});
			insertNotification(db, {
				message: "proj-a-2",
				sourceType: "run",
				projectId: "a",
			});

			const result = listNotifications(db, { projectId: "a" });
			expect(result.total).toBe(2);
			expect(result.notifications.every((n) => n.projectId === "a")).toBe(true);
		});

		test("respects limit and offset pagination", async () => {
			const dbPath = join(tempDir, "list-pagination-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			for (let i = 0; i < 5; i++) {
				insertNotification(db, { message: `msg-${i}`, sourceType: "run" });
			}

			const page1 = listNotifications(db, { limit: 2, offset: 0 });
			expect(page1.notifications).toHaveLength(2);
			expect(page1.total).toBe(5);

			const page2 = listNotifications(db, { limit: 2, offset: 2 });
			expect(page2.notifications).toHaveLength(2);

			const page3 = listNotifications(db, { limit: 2, offset: 4 });
			expect(page3.notifications).toHaveLength(1);
		});
	});

	describe("dismissNotification", () => {
		test("sets dismissed = 1 and returns true", async () => {
			const dbPath = join(tempDir, "dismiss-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const n = insertNotification(db, {
				message: "to dismiss",
				sourceType: "run",
			});

			const result = dismissNotification(db, n.id);
			expect(result).toBe(true);

			const list = listNotifications(db);
			expect(list.notifications.find((x) => x.id === n.id)).toBeUndefined();
		});

		test("returns false for non-existent notification", async () => {
			const dbPath = join(tempDir, "dismiss-missing-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = dismissNotification(db, 99999);
			expect(result).toBe(false);
		});

		test("returns false when already dismissed", async () => {
			const dbPath = join(tempDir, "dismiss-twice-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const n = insertNotification(db, {
				message: "dismiss twice",
				sourceType: "run",
			});

			dismissNotification(db, n.id);
			const second = dismissNotification(db, n.id);
			expect(second).toBe(false);
		});
	});

	describe("hasNotificationForSource", () => {
		test("returns true when matching notification exists", async () => {
			const dbPath = join(tempDir, "dedup-found-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "build completed",
				sourceType: "run",
				sourceId: "run-1",
			});

			const exists = hasNotificationForSource(
				db,
				"run",
				"run-1",
				"build completed",
			);
			expect(exists).toBe(true);
		});

		test("matches by message prefix", async () => {
			const dbPath = join(tempDir, "dedup-prefix-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "build completed successfully",
				sourceType: "run",
				sourceId: "run-2",
			});

			const exists = hasNotificationForSource(
				db,
				"run",
				"run-2",
				"build completed",
			);
			expect(exists).toBe(true);
		});

		test("returns false when no matching notification exists", async () => {
			const dbPath = join(tempDir, "dedup-missing-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "build completed",
				sourceType: "run",
				sourceId: "run-3",
			});

			const noMatch = hasNotificationForSource(
				db,
				"run",
				"run-3",
				"build failed",
			);
			expect(noMatch).toBe(false);
		});

		test("returns false for different source ID", async () => {
			const dbPath = join(tempDir, "dedup-diff-source-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "build completed",
				sourceType: "run",
				sourceId: "run-4",
			});

			const noMatch = hasNotificationForSource(
				db,
				"run",
				"run-other",
				"build completed",
			);
			expect(noMatch).toBe(false);
		});

		test("returns false for different source type", async () => {
			const dbPath = join(tempDir, "dedup-diff-type-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertNotification(db, {
				message: "build completed",
				sourceType: "run",
				sourceId: "run-5",
			});

			const noMatch = hasNotificationForSource(
				db,
				"agent",
				"run-5",
				"build completed",
			);
			expect(noMatch).toBe(false);
		});
	});
});
