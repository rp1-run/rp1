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
import type { Status } from "../../../../shared/events.js";
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
	upsertAnnotation,
	upsertArtifact,
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

function isoAt(base: string, offsetMs: number): string {
	return new Date(new Date(base).getTime() + offsetMs).toISOString();
}

function insertActivityRun(
	db: Database,
	input: {
		readonly id: string;
		readonly projectRoot: string;
		readonly projectId: string;
		readonly flow?: string;
		readonly featureId?: string;
		readonly name?: string;
		readonly harness?: string;
		readonly status?: Status;
		readonly step?: string;
		readonly eventAt?: string;
		readonly eventData?: Record<string, unknown>;
		readonly bootstrapContext?: string;
	},
): void {
	const status = input.status ?? "running";
	insertRun(db, {
		id: input.id,
		flow: input.flow ?? "build",
		featureId: input.featureId ?? "activity-search",
		projectPath: input.projectRoot,
		projectId: input.projectId,
		name: input.name,
		harness: input.harness ?? "codex",
		bootstrapContext: input.bootstrapContext,
	});
	insertEvent(db, {
		runId: input.id,
		type: "status_change",
		step: input.step ?? "building",
		data: JSON.stringify(input.eventData ?? { status }),
		createdAt: input.eventAt ?? "2026-04-10T00:00:00.000Z",
	});
	deriveRunStatus(db, input.id);
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

	test("filters run activity with the search query", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"search",
		);

		insertRun(db, {
			id: "run-docs",
			flow: "build-fast",
			featureId: "docs-search",
			projectPath: projectRoot,
			projectId,
			name: "Docs Search Run",
			harness: "codex",
		});
		insertEvent(db, {
			runId: "run-docs",
			type: "status_change",
			step: "draft",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T04:00:00.000Z",
		});
		deriveRunStatus(db, "run-docs");

		insertRun(db, {
			id: "run-review",
			flow: "pr-review",
			featureId: "review-search",
			projectPath: projectRoot,
			projectId,
			name: "Review Search Run",
			harness: "claude-code",
		});
		insertEvent(db, {
			runId: "run-review",
			type: "status_change",
			step: "reviewing",
			data: JSON.stringify({ status: "running" }),
			createdAt: "2026-04-10T05:00:00.000Z",
		});
		deriveRunStatus(db, "run-review");

		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=docs"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};

		expect(body.total).toBe(1);
		expect(body.items.map((item) => item.id)).toEqual(["run-docs"]);
	});

	test("returns a unique matching run outside the recent browse cap", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"full-history",
		);

		insertActivityRun(db, {
			id: "run-buried-needle",
			projectRoot,
			projectId,
			featureId: "buried-needle",
			name: "Buried Needle",
			status: "completed",
			step: "archived",
			eventAt: "2026-04-09T00:00:00.000Z",
		});

		for (let index = 0; index < 205; index += 1) {
			insertActivityRun(db, {
				id: `run-recent-noise-${index}`,
				projectRoot,
				projectId,
				featureId: `recent-noise-${index}`,
				name: `Recent Noise ${index}`,
				status: "completed",
				step: "done",
				eventAt: isoAt("2026-04-10T00:00:00.000Z", index * 1000),
			});
		}

		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=buried-needle"),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};

		expect(body.total).toBe(1);
		expect(body.items.map((item) => item.id)).toEqual(["run-buried-needle"]);
	});

	test("preserves token parity and excludes artifact, annotation, and payload-only text", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"token-parity",
		);

		insertActivityRun(db, {
			id: "run-alpha-beta",
			projectRoot,
			projectId,
			flow: "build-fast",
			featureId: "tiny-ab",
			name: "Alpha Beta Search",
			status: "completed",
			step: "done",
			eventAt: "2026-04-10T06:00:00.000Z",
		});
		insertActivityRun(db, {
			id: "run-alpha-only",
			projectRoot,
			projectId,
			featureId: "tiny-zz",
			name: "Alpha Only Search",
			status: "completed",
			step: "done",
			eventAt: "2026-04-10T06:01:00.000Z",
		});
		insertActivityRun(db, {
			id: "run-payload-holder",
			projectRoot,
			projectId,
			featureId: "plain-feature",
			name: "Plain Run",
			status: "completed",
			step: "done",
			eventAt: "2026-04-10T06:02:00.000Z",
			eventData: {
				status: "completed",
				message: "hidden-corpus payload text",
			},
		});
		upsertArtifact(db, {
			docId: "hidden-doc",
			runId: "run-payload-holder",
			path: "features/hidden-corpus.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: projectRoot,
			projectId,
			feature: "plain-feature",
			step: "done",
		});
		upsertAnnotation(db, {
			docId: "hidden-doc",
			runId: "run-payload-holder",
			content: "hidden-corpus annotation text",
		});

		const parityResponse = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=AL%20ab"),
		);
		expect(parityResponse.status).toBe(200);
		const parityBody = (await parityResponse.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};
		expect(parityBody.total).toBe(1);
		expect(parityBody.items.map((item) => item.id)).toEqual(["run-alpha-beta"]);

		const hiddenResponse = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=hidden-corpus"),
		);
		expect(hiddenResponse.status).toBe(200);
		const hiddenBody = (await hiddenResponse.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};
		expect(hiddenBody.total).toBe(0);
		expect(hiddenBody.items).toEqual([]);
	});

	test("applies project, status, date, visibility, bootstrap, and eval filters before pagination", async () => {
		const { db, projectId, projectRoot } = await setupProject(
			tempDir,
			"filter-search",
		);
		const otherProjectRoot = join(tempDir, "project-filter-other");
		await mkdir(otherProjectRoot, { recursive: true });
		db.prepare(
			"INSERT INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).run(
			"project-filter-other",
			"project-uuid-filter-other",
			otherProjectRoot,
			"Project filter other",
			"2026-04-11T00:00:00.000Z",
			"2026-04-11T00:00:00.000Z",
			1,
		);
		const nowIso = new Date().toISOString();
		const oldIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

		insertActivityRun(db, {
			id: "run-visible-one",
			projectRoot,
			projectId,
			featureId: "filter-target-one",
			name: "Filter Target One",
			status: "failed",
			step: "failed",
			eventAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-visible-two",
			projectRoot,
			projectId,
			featureId: "filter-target-two",
			name: "Filter Target Two",
			status: "failed",
			step: "failed",
			eventAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-wrong-status",
			projectRoot,
			projectId,
			featureId: "filter-target-status",
			name: "Filter Target Status",
			status: "completed",
			step: "done",
			eventAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-wrong-project",
			projectRoot: otherProjectRoot,
			projectId: "project-uuid-filter-other",
			featureId: "filter-target-project",
			name: "Filter Target Project",
			status: "failed",
			step: "failed",
			eventAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-too-old",
			projectRoot,
			projectId,
			featureId: "filter-target-old",
			name: "Filter Target Old",
			status: "failed",
			step: "failed",
			eventAt: oldIso,
		});
		insertRun(db, {
			id: "run-bootstrap-only",
			flow: "build",
			featureId: "filter-target-bootstrap",
			projectPath: projectRoot,
			projectId,
			name: "Filter Target Bootstrap",
			harness: "codex",
			bootstrapContext: JSON.stringify({
				run: { decision: "created_new_run" },
			}),
		});
		db.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(
			"run-bootstrap-only",
		);
		insertEvent(db, {
			runId: "run-bootstrap-only",
			type: "status_change",
			data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
			createdAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-eval-hidden",
			projectRoot: "/tmp/rp1-evals/filter-target",
			projectId,
			featureId: "filter-target-eval",
			name: "Filter Target Eval",
			status: "failed",
			step: "failed",
			eventAt: nowIso,
		});
		insertActivityRun(db, {
			id: "run-activity-hidden",
			projectRoot,
			projectId,
			flow: "knowledge-build",
			featureId: "filter-target-hidden",
			name: "Filter Target Hidden",
			status: "failed",
			step: "failed",
			eventAt: nowIso,
		});

		const response = await handleV2FeedRequest(
			new Request(
				`http://localhost/api/v2/feed?project_id=${projectId}&status=failed&dateRange=today&q=filter-target&limit=1`,
			),
		);

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};

		expect(body.total).toBe(2);
		expect(body.items).toHaveLength(1);
		expect(["run-visible-one", "run-visible-two"]).toContain(body.items[0]?.id);
	});

	test("refreshes stale search rows from run, step, status, feature, project, and event changes", async () => {
		const { db, projectId, projectRoot, registryProjectId } =
			await setupProject(tempDir, "stale-search");

		insertActivityRun(db, {
			id: "run-stale-search",
			projectRoot,
			projectId,
			flow: "socratic-duel",
			featureId: "old-feature",
			name: "Old Debate",
			status: "running",
			step: "preparing",
			eventAt: "2026-04-10T07:00:00.000Z",
		});

		const firstResponse = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=old%20debate"),
		);
		expect(firstResponse.status).toBe(200);
		expect(((await firstResponse.json()) as { total: number }).total).toBe(1);

		db.prepare("UPDATE projects SET name = $name WHERE id = $id").run({
			$name: "Renamed Project Search",
			$id: registryProjectId,
		});
		db.prepare(
			"UPDATE runs SET name = $name, feature_id = $featureId WHERE id = $id",
		).run({
			$name: "Renamed Debate Display",
			$featureId: "fresh-feature",
			$id: "run-stale-search",
		});
		insertEvent(db, {
			runId: "run-stale-search",
			type: "status_change",
			step: "preparing",
			data: JSON.stringify({ status: "completed" }),
			createdAt: "2026-04-10T07:01:00.000Z",
		});
		insertEvent(db, {
			runId: "run-stale-search",
			type: "status_change",
			step: "closing",
			data: JSON.stringify({
				status: "completed",
				terminal_outcome: "DISSENT",
			}),
			createdAt: "2026-04-10T07:02:00.000Z",
		});
		deriveRunStatus(db, "run-stale-search");

		const refreshedResponse = await handleV2FeedRequest(
			new Request(
				"http://localhost/api/v2/feed?q=renamed%20debate%20fresh%20feature%20project%20completed%20closing%20dissent",
			),
		);
		expect(refreshedResponse.status).toBe(200);

		const refreshedBody = (await refreshedResponse.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};

		expect(refreshedBody.total).toBe(1);
		expect(refreshedBody.items.map((item) => item.id)).toEqual([
			"run-stale-search",
		]);
	});

	test("queries indexed search rows at 5000-run history scale", async () => {
		const { db, projectId, projectRoot } = await setupProject(tempDir, "scale");
		const insertRunStatement = db.prepare(
			`INSERT INTO runs (
				id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root,
				rp1_work_root, project_id, status, created_at, updated_at, name, harness
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const insertEventStatement = db.prepare(
			`INSERT INTO events (id, run_id, type, step, data, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		);
		const insertSearchStatement = db.prepare(
			`INSERT INTO activity_search_runs (
				run_id, project_id, project_root, flow, status, activity_at,
				source_event_id, source_run_updated_at, search_text, indexed_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const seed = db.transaction(() => {
			for (let index = 0; index < 5000; index += 1) {
				const matches = index % 100 === 0;
				const runId = `run-scale-${index}`;
				const featureId = matches
					? `perf-target-${index}`
					: `ordinary-history-${index}`;
				const runName = matches
					? `Performance Target ${index}`
					: `Ordinary History ${index}`;
				const timestamp = isoAt("2026-04-01T00:00:00.000Z", index * 1000);
				const eventId = index + 1;
				insertRunStatement.run(
					runId,
					"build",
					featureId,
					projectRoot,
					projectRoot,
					join(projectRoot, ".rp1", "context"),
					join(projectRoot, ".rp1", "work"),
					projectId,
					"completed",
					timestamp,
					timestamp,
					runName,
					"codex",
				);
				insertEventStatement.run(
					eventId,
					runId,
					"status_change",
					"done",
					JSON.stringify({ status: "completed" }),
					timestamp,
				);
				insertSearchStatement.run(
					runId,
					projectId,
					projectRoot,
					"build",
					"completed",
					timestamp,
					eventId,
					timestamp,
					`${runId} /build ${runName} ${featureId} Project scale completed codex done Completed`.toLowerCase(),
					timestamp,
				);
			}
		});
		seed();

		const startedAt = Date.now();
		const response = await handleV2FeedRequest(
			new Request("http://localhost/api/v2/feed?q=perf-target&limit=10"),
		);
		const durationMs = Date.now() - startedAt;

		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			items: Array<{ id: string }>;
			total: number;
		};

		expect(body.total).toBe(50);
		expect(body.items).toHaveLength(10);
		expect(durationMs).toBeLessThan(2000);
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
