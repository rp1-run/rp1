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

export function createServer(options: ServerOptions) {
	const {
		port = 7710,
		projectPath,
		isDev = false,
		webUIDir,
		version,
	} = options;
	const startTime = Date.now();

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

	websocketHub.startStatusPolling(async () => {
		const { getLatestStatusByFeature } = await import(
			"../../src/agent-tools/work/database"
		);
		const { isLeft } = await import("fp-ts/lib/Either.js");

		const projects = await getAllProjects();
		const results: Array<{
			projectId: string;
			feature: string;
			status: string;
		}> = [];

		for (const project of projects) {
			const latestResult = await getLatestStatusByFeature(project.path)();
			if (!isLeft(latestResult)) {
				for (const record of latestResult.right) {
					results.push({
						projectId: project.id,
						feature: record.feature,
						status: record.status,
					});
				}
			}
		}

		return results;
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
