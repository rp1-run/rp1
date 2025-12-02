import type { Server, ServerWebSocket } from "bun";
import type { WebSocketHub } from "./websocket";

export interface ServerConfig {
  port: number;
  projectPath: string;
  websocketHub: WebSocketHub;
  isDev?: boolean;
}

export interface AppServer {
  server: Server;
  stop: () => void;
}

export function startServer(config: ServerConfig): AppServer {
  const { port, projectPath, websocketHub, isDev = false } = config;

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { projectPath },
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      }

      if (pathname.startsWith("/api/")) {
        return handleApiRequest(req, projectPath);
      }

      return handleStaticRequest(req, isDev);
    },
    websocket: {
      open(ws: ServerWebSocket<{ projectPath: string }>) {
        websocketHub.addClient(ws);
      },
      message(ws: ServerWebSocket<{ projectPath: string }>, message) {
        websocketHub.handleMessage(ws, message);
      },
      close(ws: ServerWebSocket<{ projectPath: string }>) {
        websocketHub.removeClient(ws);
      },
    },
  });

  console.log(`Server running at http://127.0.0.1:${port}`);

  return {
    server,
    stop: () => server.stop(),
  };
}

async function handleApiRequest(
  req: Request,
  projectPath: string
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/api/project") {
    const { handleProjectRequest } = await import("./routes/api");
    return handleProjectRequest(projectPath);
  }

  if (pathname === "/api/files") {
    const { handleFilesRequest } = await import("./routes/api");
    return handleFilesRequest(projectPath);
  }

  if (pathname.startsWith("/api/content/")) {
    const { handleContentRequest } = await import("./routes/api");
    const filePath = decodeURIComponent(pathname.slice("/api/content/".length));
    return handleContentRequest(projectPath, filePath);
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleStaticRequest(
  req: Request,
  isDev: boolean
): Promise<Response> {
  const { handleStaticRequest: staticHandler } = await import(
    "./routes/static"
  );
  return staticHandler(req, isDev);
}
