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
	} = config;

	let serverInstance: ReturnType<typeof Bun.serve<WebSocketData>>;

	const apiContext: ApiContext = {
		port,
		startTime,
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

	// POST /api/status/notify - immediate WebSocket broadcast for status changes
	if (pathname === "/api/status/notify" && method === "POST") {
		const { handleStatusNotifyRequest } = await import("./routes/api");
		return handleStatusNotifyRequest(req, apiContext);
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
			return handleProjectDeleteRequest(projectId, apiContext);
		}

		// GET /api/projects/:id/files - get file tree for project
		if (subPath === "/files" && method === "GET") {
			const { handleProjectFilesRequest } = await import("./routes/api");
			return handleProjectFilesRequest(projectId);
		}

		// GET /api/projects/:id/status - get status updates for project
		if (subPath === "/status" && method === "GET") {
			const { handleProjectStatusRequest } = await import("./routes/api");
			return handleProjectStatusRequest(projectId);
		}

		// GET /api/projects/:id/content/* - get file content
		if (subPath.startsWith("/content/") && method === "GET") {
			const { handleProjectContentRequest } = await import("./routes/api");
			const filePath = decodeURIComponent(subPath.slice("/content/".length));
			return handleProjectContentRequest(projectId, filePath);
		}
	}

	if (pathname.startsWith("/api/v2/")) {
		return handleV2ApiRequest(req, pathname, method, projectPath, apiContext);
	}

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

async function handleV2ApiRequest(
	req: Request,
	pathname: string,
	method: string,
	projectPath: string,
	apiContext: ApiContext,
): Promise<Response> {
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
	if (projectDetailMatch && method === "GET") {
		const { handleV2ProjectDetailRequest } = await import("./routes/v2-api");
		const projectId = decodeURIComponent(projectDetailMatch[1]);
		return handleV2ProjectDetailRequest(projectId);
	}

	if (pathname === "/api/v2/projects" && method === "GET") {
		const { handleV2ProjectsListRequest } = await import("./routes/v2-api");
		return handleV2ProjectsListRequest();
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
