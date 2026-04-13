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
	getRunById,
	insertEvent,
	insertRun,
	resetInstance,
} from "../../../../src/agent-tools/emit/database.js";
import { saveRegistry } from "../../server/registry.js";
import {
	handleV2RunDetailRequest,
	handleV2RunEndRequest,
	handleV2RunsAttentionRequest,
	handleV2RunsListRequest,
} from "../../server/routes/v2-api.js";

async function setupProject(tempDir: string, suffix: string) {
	const homeDir = join(tempDir, `home-${suffix}`);
	const registryProjectId = `project-${suffix}`;
	const persistedProjectId = `project-uuid-${suffix}`;
	const projectRoot = join(tempDir, `project-${suffix}`);
	const dbPath = join(tempDir, `runs-${suffix}.db`);
	const now = "2026-04-11T00:00:00.000Z";

	process.env.HOME = homeDir;
	process.env.RP1_DB = dbPath;

	await mkdir(projectRoot, { recursive: true });
	await saveRegistry({
		version: 1,
		lastInvoked: registryProjectId,
		projects: {
			[registryProjectId]: {
				id: registryProjectId,
				projectId: persistedProjectId,
				path: projectRoot,
				name: `Project ${suffix}`,
				addedAt: now,
				lastAccessedAt: now,
				available: true,
			},
		},
	});

	const db = await expectTaskRight(getEmitDatabase(dbPath));

	return {
		db,
		projectId: persistedProjectId,
		registryProjectId,
		projectRoot,
	};
}

describe("V2 runs API", () => {
	let tempDir: string;
	const originalHome = process.env.HOME;
	const originalDb = process.env.RP1_DB;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-v2-runs-"));
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
		if (originalHome == null) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		if (originalDb == null) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDb;
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
		if (originalDb == null) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDb;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	test("uses the waiting-aware step projection on initial detail reads", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"waiting-detail",
		);

		insertRun(db, {
			id: "run-waiting-detail",
			flow: "detail-waiting",
			featureId: "state-fixes",
			projectPath: projectRoot,
			projectId,
			name: "Waiting Detail Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-waiting-detail",
			type: "status_change",
			step: "review",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-12T01:00:00.000Z",
		});
		insertEvent(db, {
			runId: "run-waiting-detail",
			type: "waiting_for_user",
			step: "review",
			data: JSON.stringify({ prompt: "Please review the plan" }),
			createdAt: "2026-04-12T01:05:00.000Z",
		});
		deriveRunStatus(db, "run-waiting-detail");

		const detailResponse = await handleV2RunDetailRequest("run-waiting-detail");
		const detailBody = (await detailResponse.json()) as {
			status: string;
			currentStep: string | null;
			steps: Array<{ id: string; status: string }>;
		};

		expect(detailResponse.status).toBe(200);
		expect(detailBody.status).toBe("waiting");
		expect(detailBody.currentStep).toBe("review");
		expect(detailBody.steps).toContainEqual(
			expect.objectContaining({
				id: "review",
				status: "waiting",
			}),
		);
	});

	test("reclassifies stale live runs before list, attention, and detail reads", async () => {
		const { db, projectId, projectRoot } = await setupProject(tempDir, "stale");

		insertRun(db, {
			id: "run-stale",
			flow: "build",
			featureId: "state-fixes",
			projectPath: projectRoot,
			projectId,
			name: "Stale Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-stale",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T01:00:00.000Z",
		});
		deriveRunStatus(db, "run-stale");
		db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
			"2026-04-10T01:00:00.000Z",
			"run-stale",
		);

		const listResponse = await handleV2RunsListRequest(
			new Request("http://localhost/api/v2/runs?status=running"),
		);
		const listBody = (await listResponse.json()) as {
			runs: Array<{ id: string }>;
			total: number;
		};

		expect(listResponse.status).toBe(200);
		expect(listBody.total).toBe(0);
		expect(getRunById(db, "run-stale")?.status).toBe("inactive");

		const attentionResponse = await handleV2RunsAttentionRequest();
		const attentionBody = (await attentionResponse.json()) as {
			running: Array<{ id: string }>;
		};

		expect(attentionResponse.status).toBe(200);
		expect(attentionBody.running).toHaveLength(0);

		const detailResponse = await handleV2RunDetailRequest("run-stale");
		const detailBody = (await detailResponse.json()) as {
			status: string;
			statusMessage: string | null;
			completedAt: string | null;
		};

		expect(detailResponse.status).toBe(200);
		expect(detailBody.status).toBe("inactive");
		expect(detailBody.statusMessage).toBe(
			"No workflow activity recorded for 24 hours",
		);
		expect(detailBody.completedAt).toBeNull();
	});

	test("broadcasts inactivity reclassification events from list, attention, and detail reads", async () => {
		const { db, projectId, projectRoot, registryProjectId } =
			await setupProject(tempDir, "stale-broadcast");

		const insertStaleRun = (runId: string, step: string) => {
			insertRun(db, {
				id: runId,
				flow: "build",
				featureId: "state-fixes",
				projectPath: projectRoot,
				projectId,
				name: runId,
				harness: "codex",
			});
			insertEvent(db, {
				runId,
				type: "status_change",
				step,
				data: JSON.stringify({ status: "running" }),
				createdAt: "2026-04-10T01:00:00.000Z",
			});
			deriveRunStatus(db, runId);
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T01:00:00.000Z",
				runId,
			);
		};

		const websocketHub = {
			broadcastEvent: mock(
				(
					_projectKey: string,
					_eventId: number,
					_eventType: string,
					_runId: string,
					_featureId: string,
					_step: string | null,
					_data: Record<string, unknown> | null,
					_createdAt: string,
				) => {},
			),
		};

		insertStaleRun("run-list-stale", "build");
		const listResponse = await handleV2RunsListRequest(
			new Request("http://localhost/api/v2/runs"),
			{ websocketHub } as never,
		);
		expect(listResponse.status).toBe(200);

		insertStaleRun("run-attention-stale", "verify");
		const attentionResponse = await handleV2RunsAttentionRequest({
			websocketHub,
		} as never);
		expect(attentionResponse.status).toBe(200);

		insertStaleRun("run-detail-stale", "review");
		const detailResponse = await handleV2RunDetailRequest("run-detail-stale", {
			websocketHub,
		} as never);
		expect(detailResponse.status).toBe(200);

		expect(websocketHub.broadcastEvent).toHaveBeenCalledTimes(3);
		expect(
			websocketHub.broadcastEvent.mock.calls.map((call) => call[3]),
		).toEqual(["run-list-stale", "run-attention-stale", "run-detail-stale"]);

		for (const call of websocketHub.broadcastEvent.mock.calls) {
			expect(call?.[0]).toBe(registryProjectId);
			expect(call?.[2]).toBe("status_change");
			expect(call?.[5]).toBeNull();
			expect(call?.[6]).toEqual(
				expect.objectContaining({
					status: "inactive",
					message: "No workflow activity recorded for 24 hours",
					actor: "system",
					source: "inactivity_reaper",
				}),
			);
			expect(typeof call?.[1]).toBe("number");
			expect(typeof call?.[7]).toBe("string");
		}
	});

	test("ends a live run through the dedicated endpoint and broadcasts the lifecycle event", async () => {
		const { db, projectId, projectRoot, registryProjectId } =
			await setupProject(tempDir, "end");

		insertRun(db, {
			id: "run-live",
			flow: "build",
			featureId: "state-fixes",
			projectPath: projectRoot,
			projectId,
			name: "Live Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-live",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-12T01:00:00.000Z",
		});
		deriveRunStatus(db, "run-live");

		const detailResponse = await handleV2RunDetailRequest("run-live");
		const detailBody = (await detailResponse.json()) as { projectId: string };

		expect(detailResponse.status).toBe(200);
		expect(detailBody.projectId).toBe(registryProjectId);

		const websocketHub = {
			broadcastEvent: mock(
				(
					_projectKey: string,
					_eventId: number,
					_eventType: string,
					_runId: string,
					_featureId: string,
					_step: string | null,
					_data: Record<string, unknown> | null,
					_createdAt: string,
				) => {},
			),
			broadcastNotificationCreated: mock(
				(_notification: Record<string, unknown>) => {},
			),
		};

		const response = await handleV2RunEndRequest(
			"run-live",
			new Request("http://localhost/api/v2/runs/run-live/end", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ outcome: "cancelled" }),
			}),
			{ websocketHub } as never,
		);

		const body = (await response.json()) as {
			runId: string;
			runStatus: string;
			eventId: number;
		};

		expect(response.status).toBe(200);
		expect(body.runId).toBe("run-live");
		expect(body.runStatus).toBe("cancelled");
		expect(body.eventId).toBeGreaterThan(0);
		expect(getRunById(db, "run-live")?.status).toBe("cancelled");
		expect(websocketHub.broadcastEvent).toHaveBeenCalledTimes(1);
		const broadcastCall = websocketHub.broadcastEvent.mock.calls.at(0);
		expect(broadcastCall).toBeDefined();
		if (!broadcastCall) {
			throw new Error("Expected websocket broadcastEvent to be called");
		}
		const [
			broadcastProjectId,
			broadcastEventId,
			broadcastEventType,
			broadcastRunId,
			broadcastFeatureId,
			broadcastStep,
			broadcastData,
			broadcastCreatedAt,
		] = broadcastCall;
		expect(broadcastProjectId).toBe(registryProjectId);
		expect(typeof broadcastEventId).toBe("number");
		expect(broadcastEventId).toBeGreaterThan(0);
		expect(broadcastEventType).toBe("status_change");
		expect(broadcastRunId).toBe("run-live");
		expect(broadcastFeatureId).toBe("state-fixes");
		expect(broadcastStep).toBeNull();
		expect(broadcastData).toEqual(
			expect.objectContaining({
				status: "cancelled",
				actor: "user",
				source: "manual_end",
			}),
		);
		expect(typeof broadcastCreatedAt).toBe("string");
		expect(websocketHub.broadcastNotificationCreated).not.toHaveBeenCalled();
	});

	test("rejects double-finalizing a terminal run", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"terminal",
		);

		insertRun(db, {
			id: "run-terminal",
			flow: "build",
			featureId: "state-fixes",
			projectPath: projectRoot,
			projectId,
			name: "Terminal Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-terminal",
			type: "status_change",
			step: "build",
			data: JSON.stringify({ status: "completed" }),
			createdAt: "2026-04-12T01:00:00.000Z",
		});
		deriveRunStatus(db, "run-terminal");

		const response = await handleV2RunEndRequest(
			"run-terminal",
			new Request("http://localhost/api/v2/runs/run-terminal/end", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ outcome: "abandoned" }),
			}),
			{ websocketHub: { broadcastEvent: mock(() => {}) } } as never,
		);

		const body = (await response.json()) as { error: string };

		expect(response.status).toBe(409);
		expect(body.error).toContain("already terminal");
		expect(getRunById(db, "run-terminal")?.status).toBe("completed");
	});
});
