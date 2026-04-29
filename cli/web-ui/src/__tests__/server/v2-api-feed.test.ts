import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectTaskRight } from "../../../../src/__tests__/helpers/index.js";
import {
	closeDatabase,
	deriveRunStatus,
	getEmitDatabase,
	getEventsForRun,
	INACTIVE_REAPER_STATUS_CHANGE,
	insertEvent,
	insertRun,
	resetInstance,
} from "../../../../src/agent-tools/emit/database.js";
import { insertNotification } from "../../../../src/agent-tools/emit/notification-database.js";
import { handleV2FeedRequest } from "../../server/routes/v2-api.js";

async function setupProject(tempDir: string, suffix: string) {
	const homeDir = join(tempDir, `home-${suffix}`);
	const projectRoot = join(tempDir, `project-${suffix}`);
	const dbPath = join(tempDir, `feed-${suffix}.db`);
	const now = "2026-04-11T00:00:00.000Z";

	process.env.HOME = homeDir;
	await mkdir(projectRoot, { recursive: true });

	const db = await expectTaskRight(getEmitDatabase(dbPath));

	db.prepare(
		"INSERT INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		`project-${suffix}`,
		`project-uuid-${suffix}`,
		projectRoot,
		`Project ${suffix}`,
		now,
		now,
		1,
	);
	db.prepare(
		"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', ?)",
	).run(`project-${suffix}`);

	return {
		db,
		projectId: `project-uuid-${suffix}`,
		registryProjectId: `project-${suffix}`,
		projectRoot,
	};
}

describe("handleV2FeedRequest", () => {
	let tempDir: string;
	const originalHome = process.env.HOME;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-v2-feed-"));
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

	test("returns paginated run activity without standalone notifications", async () => {
		const { db, projectId, projectRoot } = await setupProject(tempDir, "alpha");

		insertRun(db, {
			id: "run-earlier",
			flow: "build",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId,
			name: "Earlier Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-earlier",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T01:00:00.000Z",
		});
		deriveRunStatus(db, "run-earlier");

		insertRun(db, {
			id: "run-latest",
			flow: "verify",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId,
			name: "Latest Run",
			harness: "claude-code",
		});
		insertEvent(db, {
			runId: "run-latest",
			type: "status_change",
			step: "verify",
			data: JSON.stringify({ status: "completed" }),
			createdAt: "2026-04-10T03:00:00.000Z",
		});
		deriveRunStatus(db, "run-latest");

		insertNotification(db, {
			message: "Approval needed",
			sourceType: "agent",
			sourceId: "run-earlier",
			route: "/runs/run-earlier",
			projectId,
		});

		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?limit=1"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{
				type: "run";
				id: string;
				timestamp: string;
				run: {
					id: string;
					command: string;
					currentStep: string | null;
					status: string;
				};
			}>;
			total: number;
		};

		expect(body.total).toBe(2);
		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({
			type: "run",
			id: "run-latest",
			run: {
				id: "run-latest",
				command: "/verify",
				currentStep: "verify",
				status: "completed",
			},
		});
	});

	test("keeps run status filters intact after removing notifications", async () => {
		const { db, projectId, projectRoot } = await setupProject(tempDir, "beta");

		insertRun(db, {
			id: "run-failed",
			flow: "build",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId,
			name: "Failed Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-failed",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "failed" }),
			createdAt: "2026-04-10T04:00:00.000Z",
		});
		deriveRunStatus(db, "run-failed");

		insertRun(db, {
			id: "run-running",
			flow: "verify",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId,
			name: "Running Run",
			harness: "claude-code",
		});
		insertEvent(db, {
			runId: "run-running",
			type: "status_change",
			step: "verify",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T05:00:00.000Z",
		});
		deriveRunStatus(db, "run-running");

		insertNotification(db, {
			message: "verify completed",
			sourceType: "run",
			sourceId: "run-running",
			route: "/runs/run-running",
			projectId,
		});

		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?status=failed"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{
				type: "run";
				id: string;
				timestamp: string;
				run: {
					status: string;
				};
			}>;
			total: number;
		};

		expect(body.total).toBe(1);
		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({
			type: "run",
			id: "run-failed",
			run: {
				status: "failed",
			},
		});
		expect(body.items[0]?.run.status).toBe("failed");
	});

	test("hides bootstrap-only phase-plan runs while returning normal workflow runs", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"bootstrap-feed",
		);

		insertRun(db, {
			id: "run-ghost-phase-plan",
			flow: "phase-plan",
			featureId: "phase-plan",
			projectPath: projectRoot,
			projectId,
			name: "Ghost Phase Plan",
			harness: "codex",
			bootstrapContext: JSON.stringify({
				run: { decision: "created_new_run" },
			}),
		});
		db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run(
			"2026-04-10T06:00:00.000Z",
			"run-ghost-phase-plan",
		);
		db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
			"2026-04-10T06:00:00.000Z",
			"run-ghost-phase-plan",
		);
		insertEvent(db, {
			runId: "run-ghost-phase-plan",
			type: "status_change",
			data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
			createdAt: "2026-04-11T06:00:00.000Z",
		});

		insertRun(db, {
			id: "run-normal-workflow",
			flow: "build",
			featureId: "hide-bootstrap-runs",
			projectPath: projectRoot,
			projectId,
			name: "Normal Workflow",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-normal-workflow",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T05:00:00.000Z",
		});
		deriveRunStatus(db, "run-normal-workflow");

		const websocketHub = {
			broadcastEvent: mock(() => {}),
		};

		const response = await handleV2FeedRequest(
			new Request(`http://localhost/api/v2/feed?project_id=${projectId}`),
			{ websocketHub } as never,
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{ id: string; run: { id: string } }>;
			total: number;
		};

		expect(body.total).toBe(1);
		expect(body.items.map((item) => item.id)).toEqual(["run-normal-workflow"]);
		expect(body.items[0]?.run.id).toBe("run-normal-workflow");
		expect(websocketHub.broadcastEvent).not.toHaveBeenCalled();
		expect(getEventsForRun(db, "run-ghost-phase-plan")).toHaveLength(1);
	});

	test("broadcasts stale run inactivity when feed reads trigger reclassification", async () => {
		const { db, projectId, projectRoot, registryProjectId } =
			await setupProject(tempDir, "stale-feed");

		insertRun(db, {
			id: "run-feed-stale",
			flow: "build",
			featureId: "notifications-sidebar",
			projectPath: projectRoot,
			projectId,
			name: "Stale Feed Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-feed-stale",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T01:00:00.000Z",
		});
		deriveRunStatus(db, "run-feed-stale");
		db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
			"2026-04-10T01:00:00.000Z",
			"run-feed-stale",
		);

		const websocketHub = {
			broadcastEvent: mock(
				(
					_projectKey: string,
					_eventId: number,
					_eventType: string,
					_runId: string,
					_featureId: string,
					_runStatus: string | null,
					_step: string | null,
					_unit: string | null,
					_data: Record<string, unknown> | null,
					_createdAt: string,
				) => {},
			),
		};

		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed"),
			{ websocketHub } as never,
		);

		expect(response.status).toBe(200);
		expect(websocketHub.broadcastEvent).toHaveBeenCalledTimes(1);
		expect(websocketHub.broadcastEvent).toHaveBeenCalledWith(
			registryProjectId,
			expect.any(Number),
			"status_change",
			"run-feed-stale",
			"notifications-sidebar",
			"inactive",
			null,
			null,
			expect.objectContaining({
				status: "inactive",
				message: "No workflow activity recorded for 24 hours",
				actor: "system",
				source: "inactivity_reaper",
			}),
			expect.any(String),
		);
	});
});
