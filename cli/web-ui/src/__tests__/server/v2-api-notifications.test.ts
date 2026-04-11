import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectTaskRight } from "../../../../src/__tests__/helpers/index.js";
import {
	closeDatabase,
	getEmitDatabase,
	insertRun,
	resetInstance,
} from "../../../../src/agent-tools/emit/database.js";
import { insertNotification } from "../../../../src/agent-tools/emit/notification-database.js";
import { saveRegistry } from "../../server/registry.js";
import { handleV2NotificationsListRequest } from "../../server/routes/v2-api.js";

describe("handleV2NotificationsListRequest", () => {
	let tempDir: string;
	const originalHome = process.env.HOME;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-v2-notifications-"));
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
		if (originalHome == null) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
	});

	afterAll(async () => {
		closeDatabase();
		resetInstance();
		if (originalHome == null) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns enriched notification rows and global summary counts", async () => {
		const homeDir = join(tempDir, "home");
		const projectRoot = join(tempDir, "project-alpha");
		const dbPath = join(tempDir, "notifications.db");
		const now = "2026-04-11T00:00:00.000Z";

		process.env.HOME = homeDir;
		await mkdir(projectRoot, { recursive: true });
		await saveRegistry({
			version: 1,
			lastInvoked: "project-alpha",
			projects: {
				"project-alpha": {
					id: "project-alpha",
					projectId: "project-uuid-1",
					path: projectRoot,
					name: "Alpha Project",
					addedAt: now,
					lastAccessedAt: now,
					available: true,
				},
			},
		});

		const db = await expectTaskRight(getEmitDatabase(dbPath));

		insertRun(db, {
			id: "run-failed",
			flow: "build",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId: "project-uuid-1",
			name: "Sidebar Build",
			harness: "codex",
		});
		insertRun(db, {
			id: "run-completed",
			flow: "verify",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId: "project-uuid-1",
			name: "Sidebar Verify",
			harness: "claude-code",
		});

		insertNotification(db, {
			message: "verify completed",
			sourceType: "run",
			sourceId: "run-completed",
			route: "/runs/run-completed",
			projectId: "project-uuid-1",
		});
		insertNotification(db, {
			message: "Maintenance window later today",
			sourceType: "system",
			projectId: "project-uuid-1",
		});
		insertNotification(db, {
			message: "build failed",
			sourceType: "run",
			sourceId: "run-failed",
			route: "/runs/run-failed",
			projectId: "project-uuid-1",
		});
		insertNotification(db, {
			message: "build: Approval needed",
			sourceType: "agent",
			sourceId: "run-failed",
			route: "/runs/run-failed",
			projectId: "project-uuid-1",
		});

		const response = await handleV2NotificationsListRequest(
			new Request("http://localhost/api/v2/notifications?limit=3"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			notifications: Array<{
				id: number;
				message: string;
				sourceType: string;
				sourceId: string | null;
				route: string | null;
				projectId: string | null;
				createdAt: string;
				harness: string | null;
				runCommand: string | null;
				runName: string | null;
				projectName: string | null;
				attentionLevel: string;
			}>;
			total: number;
			summary: {
				totalCount: number;
				actionRequiredCount: number;
				attentionCount: number;
				informationalCount: number;
			};
		};

		expect(body.total).toBe(4);
		expect(body.notifications).toHaveLength(3);
		expect(body.summary).toEqual({
			totalCount: 4,
			actionRequiredCount: 1,
			attentionCount: 1,
			informationalCount: 2,
		});

		const agentNotification = body.notifications.find(
			(notification) => notification.message === "build: Approval needed",
		);
		expect(agentNotification?.attentionLevel).toBe("action_required");

		const failedNotification = body.notifications.find(
			(notification) => notification.message === "build failed",
		);
		expect(failedNotification).toMatchObject({
			sourceType: "run",
			sourceId: "run-failed",
			route: "/runs/run-failed",
			projectId: "project-uuid-1",
			harness: "codex",
			runCommand: "/build",
			runName: "Sidebar Build",
			projectName: "Alpha Project",
			attentionLevel: "attention",
		});

		const systemNotification = body.notifications.find(
			(notification) =>
				notification.message === "Maintenance window later today",
		);
		expect(systemNotification).toMatchObject({
			harness: null,
			runCommand: null,
			runName: null,
			projectName: "Alpha Project",
			attentionLevel: "info",
		});
	});

	test("keeps global summary counts when the default route page caps the first response at 50 rows", async () => {
		const homeDir = join(tempDir, "home-pagination");
		const dbPath = join(tempDir, "notifications-pagination.db");

		process.env.HOME = homeDir;
		await mkdir(homeDir, { recursive: true });

		const db = await expectTaskRight(getEmitDatabase(dbPath));

		for (let index = 1; index <= 55; index += 1) {
			insertNotification(db, {
				message: `Notification ${index}`,
				sourceType: "system",
			});
		}

		const response = await handleV2NotificationsListRequest(
			new Request("http://localhost/api/v2/notifications"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			notifications: Array<{
				id: number;
				message: string;
				attentionLevel: string;
			}>;
			total: number;
			summary: {
				totalCount: number;
				actionRequiredCount: number;
				attentionCount: number;
				informationalCount: number;
			};
		};

		expect(body.total).toBe(55);
		expect(body.notifications).toHaveLength(50);
		expect(body.notifications[0]?.message).toBe("Notification 55");
		expect(body.notifications.at(-1)?.message).toBe("Notification 6");
		expect(body.summary).toEqual({
			totalCount: 55,
			actionRequiredCount: 0,
			attentionCount: 0,
			informationalCount: 55,
		});
	});
});
