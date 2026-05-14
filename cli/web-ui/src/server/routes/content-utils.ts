import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { FileWatcherPool } from "../file-watcher";
import { parseCanonicalProjectSectionPath } from "../project-paths";
import type { WebSocketHub } from "../websocket";

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
	readonly isDev?: boolean;
	readonly version?: string;
	readonly websocketHub?: WebSocketHub;
	readonly fileWatcherPool?: FileWatcherPool;
	readonly shutdownCallback?: () => void;
	readonly webUIDir?: string;
}

export function jsonResponse(
	data: unknown,
	status = 200,
	additionalHeaders: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...additionalHeaders,
		},
	});
}

export function errorResponse(message: string, status = 500): Response {
	return jsonResponse({ error: message }, status);
}

export function getMimeType(filePath: string): string {
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

export function parseFrontmatter(content: string): {
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

export async function buildFileTree(
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
				if (await isGitWorktreeRoot(entryPath)) {
					continue;
				}
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

async function isGitWorktreeRoot(dirPath: string): Promise<boolean> {
	try {
		const gitPath = join(dirPath, ".git");
		const gitStat = await stat(gitPath);

		if (!gitStat.isFile()) {
			return false;
		}

		const gitPointer = await readFile(gitPath, "utf-8");
		if (!gitPointer.startsWith("gitdir:")) {
			return false;
		}

		const gitDir = resolve(
			dirPath,
			gitPointer.slice("gitdir:".length).trim(),
		).replaceAll("\\", "/");
		return gitDir.includes("/.git/worktrees/");
	} catch {
		return false;
	}
}

/**
 * Validate a file path for security: reject path traversal and paths outside allowed directories.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateFilePath(filePath: string): string | null {
	if (filePath.includes("..") || filePath.startsWith("/")) {
		return "Invalid file path";
	}

	if (parseCanonicalProjectSectionPath(filePath) === null) {
		return "Access denied: path outside allowed directories";
	}

	return null;
}

/**
 * Resolve a file path with archive fallback for archivable paths.
 * Tries the original path first, then falls back to archive directories:
 *   work/features/X -> work/archives/features/X
 *   work/prds/X -> work/archives/prds/X
 *
 * Returns the resolved full path, or null if the file was not found.
 */
export async function resolveWithArchiveFallback(
	rp1Path: string,
	filePath: string,
): Promise<string | null> {
	const fullPath = resolve(rp1Path, filePath);

	// Security: ensure resolved path is within rp1 directory
	if (!fullPath.startsWith(`${rp1Path}/`)) {
		return null;
	}

	const file = Bun.file(fullPath);
	if (await file.exists()) {
		return fullPath;
	}

	const archivablePrefixes = ["work/features/", "work/prds/"];
	for (const prefix of archivablePrefixes) {
		if (filePath.startsWith(prefix)) {
			const archivePath = filePath.replace(
				prefix,
				`work/archives/${prefix.slice("work/".length)}`,
			);
			const archiveFullPath = resolve(rp1Path, archivePath);
			if (
				archiveFullPath.startsWith(`${rp1Path}/`) &&
				(await Bun.file(archiveFullPath).exists())
			) {
				return archiveFullPath;
			}
		}
	}

	return null;
}
