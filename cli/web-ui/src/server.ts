import { FileWatcherPool } from "./server/file-watcher";
import { startServer } from "./server/http";
import { WebSocketHub } from "./server/websocket";

export interface ServerOptions {
	port?: number;
	projectPath: string;
	isDev?: boolean;
	webUIDir?: string;
}

export function createServer(options: ServerOptions) {
	const { port = 7710, projectPath, isDev = false, webUIDir } = options;
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
