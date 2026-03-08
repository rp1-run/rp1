import { extname, join, resolve } from "node:path";
import { isLeft } from "../../lib/fp";
import { formatProjectError, getProjectMetadata } from "../project";
import {
	getAllProjects,
	getLastInvokedProjectId,
	getProject,
	isValidProject,
	loadRegistry,
	registerProject,
	removeProject,
} from "../registry";
import {
	type ApiContext,
	buildFileTree,
	errorResponse,
	type FileContent,
	type FileNode,
	getMimeType,
	jsonResponse,
	parseFrontmatter,
	resolveWithArchiveFallback,
	validateFilePath,
} from "./content-utils";

export type { FileNode, FileContent, ApiContext };

export interface StatusUpdate {
	id: number;
	step: string | null;
	status: string;
	message: string | null;
	createdAt: string;
}

export interface FeatureStatus {
	feature: string;
	status:
		| "started"
		| "in_progress"
		| "waiting-input"
		| "needs-review"
		| "completed"
		| "failed";
	currentStep: string | null;
	message: string | null;
	lastUpdate: string;
	updates: StatusUpdate[];
}

export interface CompletedStep {
	feature: string;
	step: string;
	message: string | null;
	completedAt: string;
}

export interface StatusResponse {
	projectId: string;
	projectName: string;
	active: FeatureStatus[];
	recentlyCompleted: FeatureStatus[];
	recentlyCompletedSteps: CompletedStep[];
	lastUpdated: string | null;
}

export async function handleProjectRequest(
	projectPath: string,
): Promise<Response> {
	const result = await getProjectMetadata(projectPath)();

	if (isLeft(result)) {
		return errorResponse(formatProjectError(result.left), 400);
	}

	return jsonResponse(result.right);
}

export async function handleFilesRequest(
	projectPath: string,
): Promise<Response> {
	try {
		const rp1Path = join(projectPath, ".rp1");

		const sections: FileNode[] = [];

		const workPath = join(rp1Path, "work");
		const workTree = await buildFileTree(workPath, "work");
		if (workTree) {
			sections.push(workTree);
		}

		const contextPath = join(rp1Path, "context");
		const contextTree = await buildFileTree(contextPath, "context");
		if (contextTree) {
			sections.push(contextTree);
		}

		return jsonResponse(sections);
	} catch (error) {
		return errorResponse(`Failed to read file tree: ${String(error)}`);
	}
}

export async function handleContentRequest(
	projectPath: string,
	filePath: string,
): Promise<Response> {
	const validationError = validateFilePath(filePath);
	if (validationError) {
		const status = validationError.includes("Access denied") ? 403 : 400;
		return errorResponse(validationError, status);
	}

	const rp1Path = join(projectPath, ".rp1");

	try {
		const resolvedPath = await resolveWithArchiveFallback(rp1Path, filePath);
		if (!resolvedPath) {
			return errorResponse("File not found", 404);
		}

		const content = await Bun.file(resolvedPath).text();
		const mimeType = getMimeType(filePath);

		let frontmatter: Record<string, unknown> | undefined;

		if (extname(filePath) === ".md") {
			const parsed = parseFrontmatter(content);
			frontmatter = parsed.frontmatter;
		}

		const response: FileContent = {
			path: filePath,
			content,
			mimeType,
			frontmatter,
		};

		return jsonResponse(response);
	} catch (error) {
		return errorResponse(`Failed to read file: ${String(error)}`);
	}
}

/**
 * Handle GET /api/health - daemon health check.
 */
export async function handleHealthRequest(ctx: ApiContext): Promise<Response> {
	if (ctx.webUIDir) {
		const indexPath = join(ctx.webUIDir, "client", "index.html");
		const file = Bun.file(indexPath);
		if (!(await file.exists())) {
			return jsonResponse(
				{ status: "starting", reason: "assets not ready" },
				503,
			);
		}
	}

	const registry = await loadRegistry();
	const projectCount = Object.keys(registry.projects).length;
	const uptime = Math.floor((Date.now() - ctx.startTime) / 1000);

	return jsonResponse({
		status: "ok",
		uptime,
		port: ctx.port,
		projectCount,
	});
}

/**
 * Handle POST /api/shutdown - graceful daemon shutdown.
 */
export async function handleShutdownRequest(
	ctx: ApiContext,
): Promise<Response> {
	if (ctx.shutdownCallback) {
		// Schedule shutdown after response is sent
		setTimeout(() => ctx.shutdownCallback?.(), 100);
	}
	return jsonResponse({ status: "shutting_down" });
}

/**
 * Handle GET /api/projects - list all registered projects.
 */
export async function handleProjectsListRequest(): Promise<Response> {
	try {
		const projects = await getAllProjects();
		const lastInvoked = await getLastInvokedProjectId();

		// Fetch active feature counts for all projects in parallel
		const { getActiveFeatureCount } = await import(
			"../../../../src/agent-tools/work/database"
		);
		const { isLeft } = await import("fp-ts/lib/Either.js");

		const projectsWithStatus = await Promise.all(
			projects.map(async (project) => {
				const countResult = await getActiveFeatureCount(project.path)();
				const activeFeatureCount = isLeft(countResult) ? 0 : countResult.right;
				return {
					...project,
					activeFeatureCount,
				};
			}),
		);

		return jsonResponse({
			projects: projectsWithStatus,
			lastInvoked,
		});
	} catch (error) {
		return errorResponse(`Failed to load projects: ${String(error)}`);
	}
}

/**
 * Handle POST /api/projects/register - register a new project.
 */
export async function handleProjectRegisterRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const body = (await req.json()) as { path?: string };

		if (!body.path || typeof body.path !== "string") {
			return errorResponse("Missing required field: path", 400);
		}

		const projectPath = body.path;

		const valid = await isValidProject(projectPath);
		if (!valid) {
			return errorResponse(
				`Invalid project: ${projectPath} does not contain .rp1/ directory`,
				400,
			);
		}

		const project = await registerProject(projectPath);
		ctx.websocketHub?.broadcastProjectsChanged();

		const url = `http://127.0.0.1:${ctx.port}/projects/${project.id}`;

		return jsonResponse({ project, url });
	} catch (error) {
		return errorResponse(`Failed to register project: ${String(error)}`);
	}
}

/**
 * Handle GET /api/projects/:id - get single project metadata.
 */
export async function handleProjectGetRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const available = await isValidProject(project.path);

		return jsonResponse({
			...project,
			available,
		});
	} catch (error) {
		return errorResponse(`Failed to get project: ${String(error)}`);
	}
}

/**
 * Handle DELETE /api/projects/:id - remove project from registry.
 */
export async function handleProjectDeleteRequest(
	projectId: string,
	ctx?: ApiContext,
): Promise<Response> {
	try {
		const removed = await removeProject(projectId);

		if (!removed) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		ctx?.websocketHub?.broadcastProjectsChanged();

		return jsonResponse({ removed: true });
	} catch (error) {
		return errorResponse(`Failed to remove project: ${String(error)}`);
	}
}

/**
 * Handle GET /api/projects/:id/files - get file tree for a project.
 */
export async function handleProjectFilesRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const available = await isValidProject(project.path);
		if (!available) {
			return errorResponse(`Project unavailable: ${projectId}`, 410);
		}

		const rp1Path = join(project.path, ".rp1");
		const sections: FileNode[] = [];

		const workPath = join(rp1Path, "work");
		const workTree = await buildFileTree(workPath, "work");
		if (workTree) {
			sections.push(workTree);
		}

		const contextPath = join(rp1Path, "context");
		const contextTree = await buildFileTree(contextPath, "context");
		if (contextTree) {
			sections.push(contextTree);
		}

		return jsonResponse(sections);
	} catch (error) {
		return errorResponse(`Failed to read file tree: ${String(error)}`);
	}
}

/**
 * Handle GET /api/projects/:id/content/* - get file content for a project.
 */
export async function handleProjectContentRequest(
	projectId: string,
	filePath: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const available = await isValidProject(project.path);
		if (!available) {
			return errorResponse(`Project unavailable: ${projectId}`, 410);
		}

		const validationError = validateFilePath(filePath);
		if (validationError) {
			const status = validationError.includes("Access denied") ? 403 : 400;
			return errorResponse(validationError, status);
		}

		const rp1Path = resolve(project.path, ".rp1");

		const resolvedPath = await resolveWithArchiveFallback(rp1Path, filePath);
		if (!resolvedPath) {
			return errorResponse("File not found", 404);
		}

		const content = await Bun.file(resolvedPath).text();
		const mimeType = getMimeType(filePath);

		let frontmatter: Record<string, unknown> | undefined;
		if (extname(filePath) === ".md") {
			const parsed = parseFrontmatter(content);
			frontmatter = parsed.frontmatter;
		}

		const response: FileContent = {
			path: filePath,
			content,
			mimeType,
			frontmatter,
		};

		return jsonResponse(response);
	} catch (error) {
		return errorResponse(`Failed to read file: ${String(error)}`);
	}
}

/**
 * Handle GET /api/projects/:id/status - get status updates for a project.
 */
/**
 * Handle POST /api/status/notify - notify WebSocket clients of a status change.
 * Called by CLI after writing status update to trigger immediate broadcast.
 */
export async function handleStatusNotifyRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const body = (await req.json()) as {
			projectPath?: string;
			feature?: string;
			status?: string;
			workflow?: string;
			runId?: string;
			previousState?: string | null;
			newState?: string;
		};

		if (!body.projectPath || !body.feature || !body.status) {
			return errorResponse(
				"Missing required fields: projectPath, feature, status",
				400,
			);
		}

		// Look up project ID from path
		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === body.projectPath);

		if (!project) {
			// Project not registered, nothing to broadcast
			return jsonResponse({
				notified: false,
				reason: "project_not_registered",
			});
		}

		// Broadcast status change to WebSocket clients, including step/runStatus
		// when available for optimistic UI updates
		const step = body.newState ?? undefined;
		const runStatus =
			body.workflow && body.status
				? mapStatusToRunStatus(body.status)
				: undefined;

		ctx.websocketHub?.broadcastStatusChange(
			project.id,
			body.feature,
			body.status,
			step,
			runStatus,
		);

		return jsonResponse({ notified: true, projectId: project.id });
	} catch (error) {
		return errorResponse(`Failed to process notification: ${String(error)}`);
	}
}

/**
 * Map raw StatusValue to frontend RunStatus for optimistic WebSocket updates.
 */
function mapStatusToRunStatus(status: string): string {
	switch (status) {
		case "started":
		case "in_progress":
			return "running";
		case "waiting-input":
			return "waiting-input";
		case "needs-review":
			return "needs-review";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		default:
			return "running";
	}
}

export async function handleProjectStatusRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const {
			getLatestStatusByFeature,
			queryStatusUpdatesForFeatures,
			getRecentlyCompletedSteps,
		} = await import("../../../../src/agent-tools/work/database");
		const { isLeft } = await import("fp-ts/lib/Either.js");

		const latestResult = await getLatestStatusByFeature(project.path)();

		if (isLeft(latestResult)) {
			const { formatError } = await import("../../../../shared/errors");
			return errorResponse(
				`Failed to query status: ${formatError(latestResult.left, false)}`,
			);
		}

		const latestStatuses = latestResult.right;

		const completedTasksResult = await getRecentlyCompletedSteps(
			project.path,
			24,
		)();

		const recentlyCompletedSteps: CompletedStep[] = isLeft(completedTasksResult)
			? []
			: completedTasksResult.right.map((record) => ({
					feature: record.feature,
					step: record.step as string, // step is guaranteed non-null from query
					message: record.message,
					completedAt: record.createdAt,
				}));

		// Return early with null lastUpdated if no statuses exist
		if (latestStatuses.length === 0) {
			const response: StatusResponse = {
				projectId,
				projectName: project.name,
				active: [],
				recentlyCompleted: [],
				recentlyCompletedSteps,
				lastUpdated: null,
			};
			return jsonResponse(response);
		}

		const now = new Date();
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		// Batch query: fetch updates for all features in a single query
		const featureNames = latestStatuses.map((r) => r.feature);
		const updatesResult = await queryStatusUpdatesForFeatures(
			project.path,
			featureNames,
			10,
		)();

		const updatesMap = isLeft(updatesResult)
			? new Map<string, StatusUpdate[]>()
			: updatesResult.right;

		const featureMap = new Map<string, FeatureStatus>();

		for (const record of latestStatuses) {
			const rawUpdates = updatesMap.get(record.feature) ?? [];
			const updates: StatusUpdate[] = rawUpdates.map((update) => ({
				id: update.id,
				step: update.step,
				status: update.status,
				message: update.message,
				createdAt: update.createdAt,
			}));

			featureMap.set(record.feature, {
				feature: record.feature,
				status: record.status,
				currentStep: record.step,
				message: record.message,
				lastUpdate: record.createdAt,
				updates,
			});
		}

		const active: FeatureStatus[] = [];
		const recentlyCompleted: FeatureStatus[] = [];

		for (const status of featureMap.values()) {
			if (status.status !== "completed") {
				active.push(status);
			} else {
				const completedAt = new Date(status.lastUpdate);
				if (completedAt >= twentyFourHoursAgo) {
					recentlyCompleted.push(status);
				}
			}
		}

		active.sort(
			(a, b) =>
				new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
		);
		recentlyCompleted.sort(
			(a, b) =>
				new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
		);

		const response: StatusResponse = {
			projectId,
			projectName: project.name,
			active,
			recentlyCompleted,
			recentlyCompletedSteps,
			lastUpdated: latestStatuses[0].createdAt,
		};

		return jsonResponse(response);
	} catch (error) {
		return errorResponse(`Failed to get status: ${String(error)}`);
	}
}
