import type { ServerWebSocket } from "bun";
import type { ApiContext } from "./routes/api";
import type { WebSocketHub } from "./websocket";

interface WebSocketData {
	projectPath: string;
}

export interface ServerConfig {
	port: number;
	projectPath: string;
	websocketHub: WebSocketHub;
	isDev?: boolean;
	webUIDir?: string;
	startTime?: number;
}

export interface AppServer {
	server: ReturnType<typeof Bun.serve<WebSocketData>>;
	stop: () => void;
}

export function startServer(config: ServerConfig): AppServer {
	const {
		port,
		projectPath,
		websocketHub,
		isDev = false,
		webUIDir,
		startTime = Date.now(),
	} = config;

	let serverInstance: ReturnType<typeof Bun.serve<WebSocketData>>;

	const apiContext: ApiContext = {
		port,
		startTime,
		shutdownCallback: () => {
			serverInstance.stop();
		},
	};

	serverInstance = Bun.serve<WebSocketData>({
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
				return handleApiRequest(req, projectPath, apiContext);
			}

			return handleStaticRequest(req, isDev, webUIDir);
		},
		websocket: {
			open(ws: ServerWebSocket<WebSocketData>) {
				websocketHub.addClient(ws);
			},
			message(ws: ServerWebSocket<WebSocketData>, message) {
				websocketHub.handleMessage(ws, message);
			},
			close(ws: ServerWebSocket<WebSocketData>) {
				websocketHub.removeClient(ws);
			},
		},
	});

	console.log(`Server running at http://127.0.0.1:${port}`);

	return {
		server: serverInstance,
		stop: () => serverInstance.stop(),
	};
}

async function handleApiRequest(
	req: Request,
	projectPath: string,
	apiContext: ApiContext,
): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;
	const method = req.method;

	// Multi-project API endpoints (new)
	// GET /api/health - daemon health check
	if (pathname === "/api/health" && method === "GET") {
		const { handleHealthRequest } = await import("./routes/api");
		return handleHealthRequest(apiContext);
	}

	// POST /api/shutdown - graceful shutdown
	if (pathname === "/api/shutdown" && method === "POST") {
		const { handleShutdownRequest } = await import("./routes/api");
		return handleShutdownRequest(apiContext);
	}

	// GET /api/projects - list all projects
	if (pathname === "/api/projects" && method === "GET") {
		const { handleProjectsListRequest } = await import("./routes/api");
		return handleProjectsListRequest();
	}

	// POST /api/projects/register - register a new project
	if (pathname === "/api/projects/register" && method === "POST") {
		const { handleProjectRegisterRequest } = await import("./routes/api");
		return handleProjectRegisterRequest(req, apiContext);
	}

	// Routes with project ID parameter: /api/projects/:id/*
	const projectsMatch = pathname.match(/^\/api\/projects\/([^/]+)(.*)$/);
	if (projectsMatch) {
		const projectId = decodeURIComponent(projectsMatch[1]);
		const subPath = projectsMatch[2];

		// GET /api/projects/:id - get single project metadata
		if (subPath === "" && method === "GET") {
			const { handleProjectGetRequest } = await import("./routes/api");
			return handleProjectGetRequest(projectId);
		}

		// DELETE /api/projects/:id - remove project from registry
		if (subPath === "" && method === "DELETE") {
			const { handleProjectDeleteRequest } = await import("./routes/api");
			return handleProjectDeleteRequest(projectId);
		}

		// GET /api/projects/:id/files - get file tree for project
		if (subPath === "/files" && method === "GET") {
			const { handleProjectFilesRequest } = await import("./routes/api");
			return handleProjectFilesRequest(projectId);
		}

		// GET /api/projects/:id/content/* - get file content
		if (subPath.startsWith("/content/") && method === "GET") {
			const { handleProjectContentRequest } = await import("./routes/api");
			const filePath = decodeURIComponent(subPath.slice("/content/".length));
			return handleProjectContentRequest(projectId, filePath);
		}
	}

	// Legacy single-project endpoints (backward compatibility)
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
	isDev: boolean,
	webUIDir?: string,
): Promise<Response> {
	const { handleStaticRequest: staticHandler } = await import(
		"./routes/static"
	);
	return staticHandler(req, isDev, webUIDir);
}
