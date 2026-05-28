import type { Database } from "bun:sqlite";
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
	getEmitDatabase,
	getEventsForRun,
	getRunById,
	insertRun,
	resetInstance,
} from "../../../../src/agent-tools/emit/database.js";
import { listNotifications } from "../../../../src/agent-tools/emit/notification-database.js";
import {
	cancelFakeAcpSession,
	closeFakeAcpSession,
	startFakeAcpSession,
} from "../../server/acp/api";
import { AcpRunCoalescer } from "../../server/acp/coalescer";
import { AcpSidecarManager } from "../../server/acp/manager";
import { defaultSettings } from "../../server/settings-loader";
import type { AcpActivityMessage } from "../../types/websocket";

function deterministicClock(): () => Date {
	let tick = 0;
	return () => new Date(Date.UTC(2026, 4, 18, 1, 0, tick++));
}

function createDependencies(sessionPrefix: string) {
	let index = 0;
	return {
		manager: new AcpSidecarManager({
			createSessionId: () => `${sessionPrefix}-${++index}`,
			now: deterministicClock(),
		}),
		coalescer: new AcpRunCoalescer(),
	};
}

function insertProject(
	db: Database,
	fields: {
		readonly id: string;
		readonly projectId?: string;
		readonly path: string;
	},
): void {
	db.prepare(
		"INSERT INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		fields.id,
		fields.projectId ?? fields.id,
		fields.path,
		"ACP Project",
		"2026-05-18T00:00:00.000Z",
		"2026-05-18T00:00:00.000Z",
		1,
	);
}

function insertBoundRun(
	db: Database,
	fields: {
		readonly id: string;
		readonly projectId: string;
		readonly projectRoot: string;
	},
): void {
	insertRun(db, {
		id: fields.id,
		flow: "build",
		featureId: "acp-fake-sidecar-proof",
		projectPath: fields.projectRoot,
		rp1ProjectRoot: fields.projectRoot,
		rp1KbRoot: join(fields.projectRoot, ".rp1", "context"),
		rp1WorkRoot: join(fields.projectRoot, ".rp1", "work"),
		projectId: fields.projectId,
		harness: "codex",
	});
}

describe("fake ACP session API", () => {
	let tempDir: string;
	let dbPathIndex = 0;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-acp-api-"));
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	async function createDb(): Promise<Database> {
		dbPathIndex += 1;
		return expectTaskRight(
			getEmitDatabase(join(tempDir, `case-${dbPathIndex}.db`)),
		);
	}

	async function createRegisteredRun(db: Database): Promise<void> {
		const projectRoot = join(tempDir, `project-${dbPathIndex}`);
		await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
		await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
		insertProject(db, {
			id: "project-1",
			projectId: "project-1",
			path: projectRoot,
		});
		insertBoundRun(db, {
			id: "run-1",
			projectId: "project-1",
			projectRoot,
		});
	}

	test("rejects disabled mode even when a request body tries local activation", async () => {
		const db = await createDb();
		await createRegisteredRun(db);

		await expect(
			startFakeAcpSession(
				db,
				{
					projectId: "project-1",
					runId: "run-1",
					prompt: "try local override",
					acpEnabled: true,
				},
				{ settings: defaultSettings },
				createDependencies("disabled-session"),
			),
		).rejects.toMatchObject({
			code: "acp_disabled",
			status: 404,
		});
	});

	test("starts a globally enabled fake session without durable events or notifications", async () => {
		const db = await createDb();
		await createRegisteredRun(db);
		const broadcastAcpActivity = mock((_message: AcpActivityMessage) => {});
		const dependencies = createDependencies("enabled-session");

		const response = await startFakeAcpSession(
			db,
			{
				projectId: "project-1",
				runId: "run-1",
				prompt: "Inspect fake activity",
			},
			{
				settings: { ...defaultSettings, acp: { enabled: true } },
				websocketHub: { broadcastAcpActivity },
			},
			dependencies,
		);

		expect(response.session).toMatchObject({
			sessionId: "enabled-session-1",
			projectId: "project-1",
			runId: "run-1",
			status: "blocked",
			activePermission: {
				permissionId: "fake-permission-1",
				blocking: true,
			},
		});
		expect(response.activity.length).toBeGreaterThan(0);
		expect(broadcastAcpActivity).toHaveBeenCalledTimes(
			response.activity.length,
		);
		expect(
			response.activity.every((message) => !Object.hasOwn(message, "eventId")),
		).toBe(true);
		expect(getEventsForRun(db, "run-1")).toEqual([]);
		expect(listNotifications(db).total).toBe(0);
	});

	test("rejects unregistered projects and project/run mismatches", async () => {
		const db = await createDb();
		await createRegisteredRun(db);
		insertProject(db, {
			id: "project-2",
			projectId: "project-2",
			path: join(tempDir, "other-project"),
		});

		await expect(
			startFakeAcpSession(
				db,
				{ projectId: "missing-project", runId: "run-1" },
				{ settings: { ...defaultSettings, acp: { enabled: true } } },
				createDependencies("missing-project-session"),
			),
		).rejects.toMatchObject({
			code: "project_not_registered",
			status: 404,
		});

		await expect(
			startFakeAcpSession(
				db,
				{ projectId: "project-2", runId: "run-1" },
				{ settings: { ...defaultSettings, acp: { enabled: true } } },
				createDependencies("mismatch-session"),
			),
		).rejects.toMatchObject({
			code: "run_project_mismatch",
			status: 409,
		});
	});

	test("cancels and closes sessions without changing canonical run status", async () => {
		const db = await createDb();
		await createRegisteredRun(db);
		const dependencies = createDependencies("session");
		const runtime = {
			settings: { ...defaultSettings, acp: { enabled: true } },
		};
		const initialRunStatus = getRunById(db, "run-1")?.status;

		const cancellable = await startFakeAcpSession(
			db,
			{ projectId: "project-1", runId: "run-1" },
			runtime,
			dependencies,
		);
		const cancelled = await cancelFakeAcpSession(
			db,
			cancellable.session.sessionId,
			{
				projectId: "project-1",
				runId: "run-1",
				reason: "manual cancellation check",
			},
			runtime,
			dependencies,
		);

		expect(cancelled.session).toMatchObject({
			status: "cancelled",
			activePermission: null,
		});
		expect(getRunById(db, "run-1")?.status).toBe(initialRunStatus);

		const closable = await startFakeAcpSession(
			db,
			{ projectId: "project-1", runId: "run-1" },
			runtime,
			dependencies,
		);
		const closed = await closeFakeAcpSession(
			db,
			closable.session.sessionId,
			{ projectId: "project-1", runId: "run-1" },
			runtime,
			dependencies,
		);

		expect(closed.session).toMatchObject({
			status: "closed",
			activePermission: null,
		});
		expect(getRunById(db, "run-1")?.status).toBe(initialRunStatus);
		expect(getEventsForRun(db, "run-1")).toEqual([]);
		expect(listNotifications(db).total).toBe(0);
	});
});
