import type { ServerWebSocket } from "bun";
import type { FileWatcherPool } from "./file-watcher";
import type { ApiContext } from "./routes/content-utils";
import type { WebSocketHub } from "./websocket";

interface WebSocketData {
	projectPath: string;
	projectId?: string;
}

export interface ServerConfig {
	port: number;
	projectPath: string;
	websocketHub: WebSocketHub;
	fileWatcherPool?: FileWatcherPool;
	isDev?: boolean;
	webUIDir?: string;
	startTime?: number;
	version?: string;
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
		fileWatcherPool,
		isDev = false,
		webUIDir,
		startTime = Date.now(),
		version,
	} = config;

	let serverInstance: ReturnType<typeof Bun.serve<WebSocketData>>;

	const apiContext: ApiContext = {
		port,
		startTime,
		version,
		websocketHub,
		fileWatcherPool,
		webUIDir,
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
				const projectIdParam = url.searchParams.get("projectId");
				const upgraded = server.upgrade(req, {
					data: { projectPath, projectId: projectIdParam ?? undefined },
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
				const projectId = ws.data.projectId;
				websocketHub.addClient(ws, projectId);
				if (projectId && fileWatcherPool) {
					const { getProject } = require("./registry");
					getProject(projectId).then((project: { path: string } | null) => {
						if (project) {
							fileWatcherPool.acquireWatcher(projectId, project.path);
						}
					});
				}
			},
			message(ws: ServerWebSocket<WebSocketData>, message) {
				websocketHub.handleMessage(ws, message);
			},
			close(ws: ServerWebSocket<WebSocketData>) {
				const projectId = websocketHub.getClientProject(ws);
				websocketHub.removeClient(ws);
				if (projectId && fileWatcherPool) {
					fileWatcherPool.releaseWatcher(projectId);
				}
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

	if (pathname.startsWith("/api/v2/")) {
		return handleV2ApiRequest(req, pathname, method, projectPath, apiContext);
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

async function handleV2ApiRequest(
	req: Request,
	pathname: string,
	method: string,
	projectPath: string,
	apiContext: ApiContext,
): Promise<Response> {
	if (pathname === "/api/v2/health" && method === "GET") {
		const { handleV2HealthRequest } = await import("./routes/v2-api");
		return handleV2HealthRequest(apiContext);
	}

	if (pathname === "/api/v2/shutdown" && method === "POST") {
		const { handleV2ShutdownRequest } = await import("./routes/v2-api");
		return handleV2ShutdownRequest(apiContext);
	}

	if (pathname === "/api/v2/status/notify" && method === "POST") {
		const { handleV2StatusNotifyRequest } = await import("./routes/v2-api");
		return handleV2StatusNotifyRequest(req, apiContext);
	}

	if (pathname === "/api/v2/runs/attention" && method === "GET") {
		const { handleV2RunsAttentionRequest } = await import("./routes/v2-api");
		return handleV2RunsAttentionRequest();
	}

	// Artifact content must be matched before run detail (more specific route first)
	const artifactMatch = pathname.match(
		/^\/api\/v2\/runs\/([^/]+)\/artifacts\/(.+)$/,
	);
	if (artifactMatch && method === "GET") {
		const { handleV2ArtifactContentRequest } = await import("./routes/v2-api");
		const runId = decodeURIComponent(artifactMatch[1]);
		const artifactPath = decodeURIComponent(artifactMatch[2]);
		return handleV2ArtifactContentRequest(runId, artifactPath);
	}

	const runDetailMatch = pathname.match(/^\/api\/v2\/runs\/([^/]+)$/);
	if (runDetailMatch && method === "GET") {
		const { handleV2RunDetailRequest } = await import("./routes/v2-api");
		const runId = decodeURIComponent(runDetailMatch[1]);
		return handleV2RunDetailRequest(runId);
	}

	if (pathname === "/api/v2/runs" && method === "GET") {
		const { handleV2RunsListRequest } = await import("./routes/v2-api");
		return handleV2RunsListRequest(req);
	}

	// V2 project file browsing routes (must match before project detail)
	const projectFilesMatch = pathname.match(
		/^\/api\/v2\/projects\/([^/]+)\/files$/,
	);
	if (projectFilesMatch && method === "GET") {
		const { handleV2ProjectFilesRequest } = await import("./routes/v2-api");
		const projectId = decodeURIComponent(projectFilesMatch[1]);
		return handleV2ProjectFilesRequest(projectId);
	}

	const projectContentMatch = pathname.match(
		/^\/api\/v2\/projects\/([^/]+)\/content\/(.+)$/,
	);
	if (projectContentMatch && method === "GET") {
		const { handleV2ProjectContentRequest } = await import("./routes/v2-api");
		const projectId = decodeURIComponent(projectContentMatch[1]);
		const filePath = decodeURIComponent(projectContentMatch[2]);
		return handleV2ProjectContentRequest(projectId, filePath);
	}

	const projectDetailMatch = pathname.match(/^\/api\/v2\/projects\/([^/]+)$/);
	if (projectDetailMatch) {
		const projectId = decodeURIComponent(projectDetailMatch[1]);

		if (method === "GET") {
			const { handleV2ProjectDetailRequest } = await import("./routes/v2-api");
			return handleV2ProjectDetailRequest(projectId);
		}

		if (method === "DELETE") {
			const { handleV2ProjectDeleteRequest } = await import("./routes/v2-api");
			return handleV2ProjectDeleteRequest(projectId, apiContext);
		}
	}

	if (pathname === "/api/v2/projects" && method === "GET") {
		const { handleV2ProjectsListRequest } = await import("./routes/v2-api");
		return handleV2ProjectsListRequest();
	}

	if (pathname === "/api/v2/projects" && method === "POST") {
		const { handleV2ProjectRegisterRequest } = await import("./routes/v2-api");
		return handleV2ProjectRegisterRequest(req, apiContext);
	}

	// Workflow state machine API routes
	const workflowDetailMatch = pathname.match(/^\/api\/v2\/workflows\/([^/]+)$/);
	if (workflowDetailMatch && method === "GET") {
		const { handleV2WorkflowDetailRequest } = await import("./routes/v2-api");
		const name = decodeURIComponent(workflowDetailMatch[1]);
		return handleV2WorkflowDetailRequest(name);
	}

	if (pathname === "/api/v2/workflows" && method === "GET") {
		const { handleV2WorkflowsListRequest } = await import("./routes/v2-api");
		return handleV2WorkflowsListRequest();
	}

	// Annotation API routes
	const annotationApiContext = {
		projectPath,
		websocketHub: apiContext.websocketHub,
	};

	// POST /api/v2/annotations/:id/replies - add reply (most specific first)
	const replyMatch = pathname.match(
		/^\/api\/v2\/annotations\/([^/]+)\/replies$/,
	);
	if (replyMatch && method === "POST") {
		const { handleAnnotationReplyRequest } = await import(
			"./routes/annotations-api"
		);
		const id = decodeURIComponent(replyMatch[1]);
		return handleAnnotationReplyRequest(id, req, annotationApiContext);
	}

	// POST /api/v2/annotations/:id/resolve - mark resolved
	const resolveMatch = pathname.match(
		/^\/api\/v2\/annotations\/([^/]+)\/resolve$/,
	);
	if (resolveMatch && method === "POST") {
		const { handleAnnotationResolveRequest } = await import(
			"./routes/annotations-api"
		);
		const id = decodeURIComponent(resolveMatch[1]);
		return handleAnnotationResolveRequest(id, annotationApiContext);
	}

	// POST /api/v2/annotations/:id/reopen - reopen annotation
	const reopenMatch = pathname.match(
		/^\/api\/v2\/annotations\/([^/]+)\/reopen$/,
	);
	if (reopenMatch && method === "POST") {
		const { handleAnnotationReopenRequest } = await import(
			"./routes/annotations-api"
		);
		const id = decodeURIComponent(reopenMatch[1]);
		return handleAnnotationReopenRequest(id, annotationApiContext);
	}

	// GET/PATCH/DELETE /api/v2/annotations/:id - single annotation operations
	const annotationDetailMatch = pathname.match(
		/^\/api\/v2\/annotations\/([^/]+)$/,
	);
	if (annotationDetailMatch) {
		const id = decodeURIComponent(annotationDetailMatch[1]);

		if (method === "GET") {
			const { handleAnnotationGetRequest } = await import(
				"./routes/annotations-api"
			);
			return handleAnnotationGetRequest(id, annotationApiContext);
		}

		if (method === "PATCH") {
			const { handleAnnotationUpdateRequest } = await import(
				"./routes/annotations-api"
			);
			return handleAnnotationUpdateRequest(id, req, annotationApiContext);
		}

		if (method === "DELETE") {
			const { handleAnnotationDeleteRequest } = await import(
				"./routes/annotations-api"
			);
			return handleAnnotationDeleteRequest(id, annotationApiContext);
		}
	}

	// GET /api/v2/annotations - list annotations
	if (pathname === "/api/v2/annotations" && method === "GET") {
		const { handleAnnotationsListRequest } = await import(
			"./routes/annotations-api"
		);
		return handleAnnotationsListRequest(req, annotationApiContext);
	}

	// POST /api/v2/annotations - create annotation
	if (pathname === "/api/v2/annotations" && method === "POST") {
		const { handleAnnotationCreateRequest } = await import(
			"./routes/annotations-api"
		);
		return handleAnnotationCreateRequest(req, annotationApiContext);
	}

	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}
