import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
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

export interface FileNode {
	path: string;
	name: string;
	type: "file" | "directory";
	size?: number;
	modifiedAt?: string;
	children?: FileNode[];
}

export interface FileContent {
	path: string;
	content: string;
	mimeType: string;
	frontmatter?: Record<string, unknown>;
}

/**
 * Context for API handlers.
 */
export interface ApiContext {
	readonly port: number;
	readonly startTime: number;
	readonly shutdownCallback?: () => void;
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(message: string, status = 500): Response {
	return jsonResponse({ error: message }, status);
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

async function buildFileTree(
	dirPath: string,
	relativePath: string,
): Promise<FileNode | null> {
	try {
		const entries = await readdir(dirPath, { withFileTypes: true });

		const children: FileNode[] = [];

		for (const entry of entries) {
			const entryPath = join(dirPath, entry.name);
			const entryRelativePath = join(relativePath, entry.name);

			if (entry.isDirectory()) {
				const subTree = await buildFileTree(entryPath, entryRelativePath);
				if (subTree) {
					children.push(subTree);
				}
			} else if (entry.isFile()) {
				const fileStat = await stat(entryPath);
				children.push({
					path: entryRelativePath,
					name: entry.name,
					type: "file",
					size: fileStat.size,
					modifiedAt: fileStat.mtime?.toISOString(),
				});
			}
		}

		children.sort((a, b) => {
			if (a.type !== b.type) {
				return a.type === "directory" ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});

		return {
			path: relativePath,
			name: basename(relativePath),
			type: "directory",
			children,
		};
	} catch {
		return null;
	}
}

export async function handleContentRequest(
	projectPath: string,
	filePath: string,
): Promise<Response> {
	if (filePath.includes("..") || filePath.startsWith("/")) {
		return errorResponse("Invalid file path", 400);
	}

	const allowedPrefixes = ["work/", "context/"];
	if (!allowedPrefixes.some((prefix) => filePath.startsWith(prefix))) {
		return errorResponse(
			"Access denied: path outside allowed directories",
			403,
		);
	}

	const fullPath = join(projectPath, ".rp1", filePath);

	try {
		const file = Bun.file(fullPath);
		const exists = await file.exists();

		if (!exists) {
			return errorResponse("File not found", 404);
		}

		const content = await file.text();
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

function getMimeType(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	const mimeTypes: Record<string, string> = {
		".md": "text/markdown",
		".json": "application/json",
		".yaml": "text/yaml",
		".yml": "text/yaml",
		".txt": "text/plain",
		".html": "text/html",
		".css": "text/css",
		".js": "application/javascript",
		".ts": "application/typescript",
	};
	return mimeTypes[ext] ?? "text/plain";
}

function parseFrontmatter(content: string): {
	frontmatter?: Record<string, unknown>;
	content: string;
} {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return { content };
	}

	try {
		const yamlContent = match[1];
		const frontmatter: Record<string, unknown> = {};

		const lines = yamlContent.split("\n");
		for (const line of lines) {
			const colonIndex = line.indexOf(":");
			if (colonIndex > 0) {
				const key = line.slice(0, colonIndex).trim();
				const value = line.slice(colonIndex + 1).trim();
				frontmatter[key] = value;
			}
		}

		return {
			frontmatter,
			content: content.slice(match[0].length),
		};
	} catch {
		return { content };
	}
}

/**
 * Handle GET /api/health - daemon health check.
 */
export async function handleHealthRequest(ctx: ApiContext): Promise<Response> {
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

		return jsonResponse({
			projects,
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

		// Validate that .rp1/ exists
		const valid = await isValidProject(projectPath);
		if (!valid) {
			return errorResponse(
				`Invalid project: ${projectPath} does not contain .rp1/ directory`,
				400,
			);
		}

		// Register the project
		const project = await registerProject(projectPath);

		// Build the URL for this project
		const url = `http://127.0.0.1:${ctx.port}/project/${project.id}`;

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

		// Refresh availability status
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
): Promise<Response> {
	try {
		const removed = await removeProject(projectId);

		if (!removed) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

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

		// Use the existing handleFilesRequest logic but with the project path
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

		// Path traversal prevention
		if (filePath.includes("..") || filePath.startsWith("/")) {
			return errorResponse("Invalid file path", 400);
		}

		// Only allow access to work/ and context/ directories
		const allowedPrefixes = ["work/", "context/"];
		if (!allowedPrefixes.some((prefix) => filePath.startsWith(prefix))) {
			return errorResponse(
				"Access denied: path outside allowed directories",
				403,
			);
		}

		// Resolve and validate the path is within .rp1/
		const rp1Path = resolve(project.path, ".rp1");
		const fullPath = resolve(rp1Path, filePath);

		// Security: ensure resolved path is within .rp1/
		if (!fullPath.startsWith(`${rp1Path}/`)) {
			return errorResponse("Access denied: path traversal detected", 403);
		}

		const file = Bun.file(fullPath);
		const exists = await file.exists();

		if (!exists) {
			return errorResponse("File not found", 404);
		}

		const content = await file.text();
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
