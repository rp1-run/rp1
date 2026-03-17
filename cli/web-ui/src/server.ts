import { readDaemonState, writeDaemonState } from "./daemon/config-dir";
import { FileWatcherPool } from "./server/file-watcher";
import { startServer } from "./server/http";
import { getAllProjects } from "./server/registry";
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

	const projects = await getAllProjects();
	const projectPathToId = new Map<string, string>();
	const runCache = new Map<
		string,
		{ projectPath: string; featureId: string }
	>();

	for (const event of missedEvents) {
		let runInfo = runCache.get(event.runId);
		if (!runInfo) {
			const row = db
				.prepare("SELECT project_path, feature_id FROM runs WHERE id = ?")
				.get(event.runId) as {
				project_path: string;
				feature_id: string;
			} | null;

			if (!row) continue;
			runInfo = { projectPath: row.project_path, featureId: row.feature_id };
			runCache.set(event.runId, runInfo);
		}

		let projectId = projectPathToId.get(runInfo.projectPath);
		if (!projectId) {
			const project = projects.find((p) => p.path === runInfo.projectPath);
			if (!project) continue;
			projectId = project.id;
			projectPathToId.set(runInfo.projectPath, projectId);
		}

		let data: Record<string, unknown> | null = null;
		if (event.data) {
			try {
				data = JSON.parse(event.data) as Record<string, unknown>;
			} catch {
				data = null;
			}
		}

		websocketHub.broadcastEvent(
			projectId,
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

	// Wire up replay provider for WebSocket reconnect replay
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
			getActiveRunsSnapshot: () => getActiveRunsSnapshot(db),
			getMaxEventId: () => getMaxEventId(db),
		});
	};

	setupReplayProvider().catch((err) => {
		console.warn("[replay] Failed to set up replay provider:", err);
	});

	runStartupRecovery(websocketHub).catch((err) => {
		console.warn("[recovery] Startup recovery failed:", err);
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
