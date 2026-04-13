import { readDaemonState, writeDaemonState } from "./daemon/config-dir";
import { FileWatcherPool } from "./server/file-watcher";
import { startServer } from "./server/http";
import { reclassifyInactiveRunsWithBroadcast } from "./server/inactive-runs";
import {
	buildProjectLookup,
	findProjectByIdentity,
} from "./server/project-lookup";
import { getAllProjects, pruneStaleProjects } from "./server/registry";
import { WebSocketHub } from "./server/websocket";

export interface ServerOptions {
	port?: number;
	projectPath: string;
	isDev?: boolean;
	webUIDir?: string;
	version?: string;
}

async function runStartupRecovery(websocketHub: WebSocketHub): Promise<void> {
	const { isLeft } = await import("fp-ts/lib/Either.js");
	const { getEmitDatabase, getEventsSince, getMaxEventId } = await import(
		"../../src/agent-tools/emit/database"
	);

	const dbResult = await getEmitDatabase()();
	if (isLeft(dbResult)) {
		console.warn("[recovery] Could not open emit database, skipping recovery");
		return;
	}
	const db = dbResult.right;

	const state = readDaemonState();

	if (!state) {
		const currentMaxId = getMaxEventId(db);
		writeDaemonState({
			lastEventId: currentMaxId,
			lastStartedAt: new Date().toISOString(),
		});
		console.log(
			`[recovery] First startup, tracking from event ID ${currentMaxId}`,
		);
		return;
	}

	const missedEvents = getEventsSince(db, state.lastEventId);

	if (missedEvents.length === 0) {
		writeDaemonState({
			lastEventId: state.lastEventId,
			lastStartedAt: new Date().toISOString(),
		});
		console.log("[recovery] No missed events to recover");
		return;
	}

	const projects = await getAllProjects(db);
	const projectLookup = buildProjectLookup(projects);
	const runCache = new Map<
		string,
		{
			projectPath: string;
			rp1ProjectRoot: string | null;
			projectId: string | null;
			featureId: string;
		}
	>();

	for (const event of missedEvents) {
		let runInfo = runCache.get(event.runId);
		if (!runInfo) {
			const row = db
				.prepare(
					"SELECT project_path, rp1_project_root, project_id, feature_id FROM runs WHERE id = ?",
				)
				.get(event.runId) as {
				project_path: string;
				rp1_project_root: string | null;
				project_id: string | null;
				feature_id: string;
			} | null;

			if (!row) continue;
			runInfo = {
				projectPath: row.project_path,
				rp1ProjectRoot: row.rp1_project_root,
				projectId: row.project_id,
				featureId: row.feature_id,
			};
			runCache.set(event.runId, runInfo);
		}

		const project = findProjectByIdentity(projectLookup, runInfo);
		if (!project) continue;

		let data: Record<string, unknown> | null = null;
		if (event.data) {
			try {
				data = JSON.parse(event.data) as Record<string, unknown>;
			} catch {
				data = null;
			}
		}

		websocketHub.broadcastEvent(
			project.id,
			event.id,
			event.type,
			event.runId,
			runInfo.featureId,
			event.step,
			data,
			event.createdAt,
		);
	}

	const highestEventId = missedEvents[missedEvents.length - 1].id;
	writeDaemonState({
		lastEventId: highestEventId,
		lastStartedAt: new Date().toISOString(),
	});

	console.log(
		`[recovery] Pushed ${missedEvents.length} missed events to ${websocketHub.clientCount} clients`,
	);
}

export function createServer(options: ServerOptions) {
	const {
		port = 7710,
		projectPath,
		isDev = false,
		webUIDir,
		version,
	} = options;
	const startTime = Date.now();

	process.title = isDev ? "rp1-dev" : "rp1-daemon";

	const websocketHub = new WebSocketHub();
	const fileWatcherPool = new FileWatcherPool(websocketHub);

	const server = startServer({
		port,
		projectPath,
		websocketHub,
		fileWatcherPool,
		isDev,
		webUIDir,
		startTime,
		version,
	});

	const setupReplayProvider = async () => {
		const {
			getEmitDatabase,
			countEventsSince,
			getEventsSince,
			getActiveRunsSnapshot,
			getMaxEventId,
		} = await import("../../src/agent-tools/emit/database");
		const { isLeft } = await import("fp-ts/lib/Either.js");

		const dbResult = await getEmitDatabase()();
		if (isLeft(dbResult)) {
			console.warn(
				"[replay] Failed to initialize replay provider: could not open database",
			);
			return;
		}

		const db = dbResult.right;
		websocketHub.setReplayProvider({
			countEventsSince: (afterId: number) => countEventsSince(db, afterId),
			getEventsSince: (afterId: number, limit?: number) =>
				getEventsSince(db, afterId, limit),
			getActiveRunsSnapshot: () => {
				void reclassifyInactiveRunsWithBroadcast(db, websocketHub).catch(
					(error) => {
						console.warn("[replay] Failed to broadcast inactive runs:", error);
					},
				);
				return getActiveRunsSnapshot(db);
			},
			getMaxEventId: () => getMaxEventId(db),
		});
	};

	setupReplayProvider().catch((err) => {
		console.warn("[replay] Failed to set up replay provider:", err);
	});

	runStartupRecovery(websocketHub).catch((err) => {
		console.warn("[recovery] Startup recovery failed:", err);
	});

	(async () => {
		const { isLeft } = await import("fp-ts/lib/Either.js");
		const { getEmitDatabase } = await import(
			"../../src/agent-tools/emit/database"
		);
		const dbResult = await getEmitDatabase()();
		if (isLeft(dbResult)) {
			console.warn(
				"[startup] Could not open database for stale project pruning",
			);
			return;
		}
		await pruneStaleProjects(dbResult.right);
	})().catch((err) => {
		console.warn("[startup] Stale project pruning failed:", err);
	});

	console.log(`rp1 Web UI server started`);
	console.log(`  Project: ${projectPath}`);
	console.log(`  URL: http://127.0.0.1:${port}`);
	console.log(`  WebSocket: ws://127.0.0.1:${port}/ws`);

	return {
		server: server.server,
		websocketHub,
		fileWatcherPool,
		startTime,
		stop: () => {
			fileWatcherPool.stop();
			websocketHub.stop();
			server.stop();
		},
	};
}
