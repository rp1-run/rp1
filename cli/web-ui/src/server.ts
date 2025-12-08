import { startServer } from "./server/http";
import { WebSocketHub } from "./server/websocket";
import { FileWatcher } from "./server/file-watcher";

export interface ServerOptions {
  port?: number;
  projectPath: string;
  isDev?: boolean;
  webUIDir?: string;
}

export function createServer(options: ServerOptions) {
  const { port = 7710, projectPath, isDev = false, webUIDir } = options;

  const websocketHub = new WebSocketHub();
  const fileWatcher = new FileWatcher(projectPath, websocketHub);

  const server = startServer({
    port,
    projectPath,
    websocketHub,
    isDev,
    webUIDir,
  });

  fileWatcher.start();

  console.log(`rp1 Web UI server started`);
  console.log(`  Project: ${projectPath}`);
  console.log(`  URL: http://127.0.0.1:${port}`);
  console.log(`  WebSocket: ws://127.0.0.1:${port}/ws`);

  return {
    server: server.server,
    websocketHub,
    fileWatcher,
    stop: () => {
      fileWatcher.stop();
      websocketHub.stop();
      server.stop();
    },
  };
}
