/**
 * REST API endpoints for artifact file operations.
 * Provides save-to-disk functionality for edited artifacts with path validation,
 * on-demand unified diff computation for agent consumption, and doc_id-based
 * path reconciliation when files have been moved (e.g., by the archiver).
 */

import type { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import {
	getArtifactBaseline,
	getArtifactByDocId,
	getArtifactByRunAndDocId,
	getArtifactsForRun,
	getEmitDatabase,
	getRunById,
	normalizeArtifactStorage,
	resolveArtifactPathForRun,
	setArtifactBaseline,
	updateArtifactStorage,
} from "../../../../src/agent-tools/emit/database.js";
import {
	findArtifactByRequestedPath,
	getRunDirectories,
	type ProjectDirectories,
	resolveArtifactAbsolutePath,
	resolveProjectDirectories,
	toArtifactDisplayPathFromAbsolute,
} from "../project-paths";
import { getAllProjects } from "../registry";
import type { WebSocketHub } from "../websocket";
import { type ApiContext, errorResponse, jsonResponse } from "./content-utils";

function getEffectiveProjectPath(record: {
	projectPath: string;
	rp1ProjectRoot?: string | null;
}): string {
	return record.rp1ProjectRoot ?? record.projectPath;
}

function findProjectByPathSet<T extends { path: string }>(
	projects: readonly T[],
	projectPath: string,
	fallbackPath?: string,
): T | undefined {
	return (
		projects.find((project) => project.path === projectPath) ??
		(fallbackPath
			? projects.find((project) => project.path === fallbackPath)
			: undefined)
	);
}

export interface ArtifactsApiDependencies {
	readonly getDb: () => Promise<Database>;
	readonly getArtifactBaseline: typeof getArtifactBaseline;
	readonly getArtifactByDocId: typeof getArtifactByDocId;
	readonly getArtifactByRunAndDocId: typeof getArtifactByRunAndDocId;
	readonly getArtifactsForRun: typeof getArtifactsForRun;
	readonly getAllProjects: typeof getAllProjects;
	readonly getRunById: typeof getRunById;
	readonly normalizeArtifactStorage: typeof normalizeArtifactStorage;
	readonly resolveArtifactPathForRun: typeof resolveArtifactPathForRun;
	readonly setArtifactBaseline: typeof setArtifactBaseline;
	readonly updateArtifactStorage: typeof updateArtifactStorage;
}

export type ArtifactsApiDependencyOverrides = Partial<ArtifactsApiDependencies>;

async function getDefaultDb(): Promise<Database> {
	const result = await getEmitDatabase()();
	if (E.isLeft(result)) {
		throw new Error(`Database unavailable: ${formatError(result.left, false)}`);
	}
	return result.right;
}

const defaultArtifactsApiDependencies: ArtifactsApiDependencies = {
	getDb: getDefaultDb,
	getArtifactBaseline,
	getArtifactByDocId,
	getArtifactByRunAndDocId,
	getArtifactsForRun,
	getAllProjects,
	getRunById,
	normalizeArtifactStorage,
	resolveArtifactPathForRun,
	setArtifactBaseline,
	updateArtifactStorage,
};

const resolveDependencies = (
	overrides: ArtifactsApiDependencyOverrides = {},
): ArtifactsApiDependencies => ({
	...defaultArtifactsApiDependencies,
	...overrides,
});

/**
 * Broadcast an artifact_registered event after path reconciliation so the
 * frontend refetches run data and updates the breadcrumb immediately.
 */
export function broadcastPathReconciliation(
	websocketHub: WebSocketHub | undefined,
	projectId: string,
	runId: string,
	featureId: string,
	docId: string,
	newPath: string,
): void {
	if (!websocketHub) return;
	websocketHub.broadcastEvent(
		projectId,
		Date.now(),
		"artifact_registered",
		runId,
		featureId,
		null,
		null,
		null,
		{ docId, path: newPath, reconciled: true },
		new Date().toISOString(),
	);
}

export function validateSavePath(
	filePath: string,
	projectRoot: string,
): string | null {
	if (filePath.includes("..")) {
		return "Invalid path: directory traversal not allowed";
	}

	const resolved = resolve(projectRoot, filePath);
	if (!resolved.startsWith(`${projectRoot}/`)) {
		return "Invalid path: resolves outside project root";
	}

	return null;
}

const hasTraversal = (filePath: string): boolean =>
	filePath.includes("..") || filePath.startsWith("/");

/**
 * Extract rp1_doc_id from YAML frontmatter in a markdown file.
 * Only reads the frontmatter block (between --- delimiters) for efficiency.
 */
export function extractDocIdFromFrontmatter(content: string): string | null {
	if (!content.startsWith("---")) return null;
	const endIdx = content.indexOf("\n---", 3);
	if (endIdx === -1) return null;
	const frontmatter = content.slice(3, endIdx);
	const match = frontmatter.match(/^rp1_doc_id:\s*(.+)$/m);
	return match ? match[1].trim() : null;
}

/**
 * Extract rp1_doc_id from a content string that may contain frontmatter.
 * Used to get the doc_id from request body content during saves.
 */
export function extractDocIdFromContent(content: string): string | null {
	return extractDocIdFromFrontmatter(content);
}

/**
 * Scan a candidate work root for a markdown file containing the given doc_id
 * in its frontmatter. Returns the absolute path if found, null otherwise.
 */
export async function scanForDocId(
	workRoot: string,
	docId: string,
	maxDepth = 8,
): Promise<string | null> {
	async function scanDir(dir: string, depth: number): Promise<string | null> {
		if (depth > maxDepth) return null;

		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return null;
		}

		for (const name of entries) {
			const fullPath = join(dir, name);

			let isDir = false;
			let isFile = false;
			try {
				const s = await stat(fullPath);
				isDir = s.isDirectory();
				isFile = s.isFile();
			} catch {
				continue;
			}

			if (isFile && name.endsWith(".md")) {
				try {
					const file = Bun.file(fullPath);
					const headerBytes = await file.slice(0, 1024).text();
					const foundId = extractDocIdFromFrontmatter(headerBytes);
					if (foundId === docId) {
						return fullPath;
					}
				} catch {
					continue;
				}
			}

			if (isDir) {
				const result = await scanDir(fullPath, depth + 1);
				if (result !== null) return result;
			}
		}

		return null;
	}

	return scanDir(workRoot, 0);
}

const getReconciliationRoots = (
	projectRoot: string,
	workRoot: string,
	storageRoot: "absolute" | "project" | "work_dir",
): readonly string[] => {
	const legacyWorkRoot = join(resolve(projectRoot), ".rp1", "work");
	return Array.from(
		new Set([
			...(storageRoot === "project" ? [resolve(projectRoot)] : []),
			...(storageRoot === "absolute" ? [] : [resolve(workRoot)]),
			...(storageRoot === "absolute" ? [] : [legacyWorkRoot]),
		]),
	);
};

/**
 * Resolve an artifact's on-disk path using doc_id-based reconciliation.
 *
 * Fast path: file exists at the stored (cached) path -- returns immediately.
 * Slow path: scans the resolved work roots for a file with matching
 * rp1_doc_id in frontmatter. On scan hit, updates artifact storage metadata
 * using the current directory model and returns the new path.
 * On scan miss: returns null (file truly gone).
 */
export async function resolveArtifactPath(
	db: Database,
	directories: ProjectDirectories,
	artifact: {
		docId: string;
		locationKind?: "file" | "url";
		path: string;
		storageRoot: "absolute" | "project" | "work_dir";
		type?: string;
	},
	deps: ArtifactsApiDependencyOverrides = {},
): Promise<string | null> {
	const dependencies = resolveDependencies(deps);
	const persistedArtifact =
		artifact.locationKind === undefined && artifact.type !== "link"
			? dependencies.getArtifactByDocId(db, artifact.docId)
			: null;

	if (
		artifact.locationKind === "url" ||
		artifact.type === "link" ||
		persistedArtifact?.locationKind === "url" ||
		persistedArtifact?.type === "link"
	) {
		return null;
	}

	const absolutePath = resolveArtifactAbsolutePath(directories, artifact);
	if (await Bun.file(absolutePath).exists()) {
		return absolutePath;
	}

	for (const rootDir of getReconciliationRoots(
		directories.projectRoot,
		directories.workRoot,
		artifact.storageRoot,
	)) {
		const scannedPath = await scanForDocId(rootDir, artifact.docId);
		if (scannedPath === null) {
			continue;
		}

		const normalized = dependencies.normalizeArtifactStorage(
			scannedPath,
			{
				rp1ProjectRoot: directories.projectRoot,
				rp1WorkRoot: directories.workRoot,
			},
			artifact.storageRoot,
		);

		dependencies.updateArtifactStorage(db, artifact.docId, normalized);
		console.log(
			`[path-reconciliation] Updated artifact path for ${artifact.docId}: ${artifact.path} -> ${normalized.path} (${normalized.storageRoot})`,
		);

		return scannedPath;
	}

	return null;
}

export async function handleArtifactSaveRequest(
	runId: string,
	req: Request,
	apiContext: ApiContext,
	deps: ArtifactsApiDependencyOverrides = {},
): Promise<Response> {
	try {
		const dependencies = resolveDependencies(deps);
		const db = await dependencies.getDb();
		const record = dependencies.getRunById(db, runId);

		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await dependencies.getAllProjects(db);
		const project = findProjectByPathSet(
			projects,
			getEffectiveProjectPath(record),
			record.projectPath,
		);
		if (!project) {
			return errorResponse(`Project not found for run: ${runId}`, 404);
		}

		const body = (await req.json()) as { path?: string; content?: string };

		if (typeof body.path !== "string" || typeof body.content !== "string") {
			return errorResponse(
				"Invalid request body: path and content are required strings",
				400,
			);
		}
		const requestedPath = body.path;
		const nextContent = body.content;

		if (hasTraversal(requestedPath)) {
			return errorResponse(
				"Invalid path: directory traversal not allowed",
				400,
			);
		}

		const directories = getRunDirectories(record);
		const artifactRecords = dependencies.getArtifactsForRun(db, runId);
		let artifactRecord = findArtifactByRequestedPath(
			directories,
			artifactRecords,
			requestedPath,
		);
		let artifactBaseline =
			artifactRecord != null
				? (dependencies.getArtifactBaseline(db, artifactRecord.docId)
						?.baseline ?? null)
				: null;

		// Fallback: if path-based lookup missed (file was moved), try by run_id + doc_id
		// extracted from the content being saved (which contains the frontmatter)
		if (!artifactRecord) {
			const contentDocId = extractDocIdFromContent(nextContent);
			if (contentDocId) {
				artifactRecord = dependencies.getArtifactByRunAndDocId(
					db,
					runId,
					contentDocId,
				);
				if (artifactRecord) {
					const baselineInfo = dependencies.getArtifactBaseline(
						db,
						contentDocId,
					);
					if (baselineInfo) {
						artifactBaseline = baselineInfo.baseline;
					}
				}
			}
		}

		if (!artifactRecord) {
			return errorResponse("Artifact not found for save request", 404);
		}

		let absolutePath = await dependencies.resolveArtifactPathForRun(
			db,
			record,
			artifactRecord,
		);

		if (!absolutePath) {
			const resolvedPath = await resolveArtifactPath(
				db,
				directories,
				artifactRecord,
				dependencies,
			);
			if (resolvedPath) {
				absolutePath = resolvedPath;
			} else {
				return errorResponse(
					"File does not exist: only existing files can be saved",
					404,
				);
			}
		}

		if (!absolutePath) {
			return errorResponse(
				"File does not exist: only existing files can be saved",
				404,
			);
		}

		const resolvedDisplayPath = toArtifactDisplayPathFromAbsolute(
			directories,
			absolutePath,
		);
		if (resolvedDisplayPath !== requestedPath) {
			broadcastPathReconciliation(
				apiContext.websocketHub,
				project.id,
				runId,
				record.featureId,
				artifactRecord.docId,
				resolvedDisplayPath,
			);
		}

		if (artifactBaseline === null) {
			const originalContent = await Bun.file(absolutePath).text();
			dependencies.setArtifactBaseline(
				db,
				artifactRecord.docId,
				originalContent,
			);
		}

		await Bun.write(absolutePath, nextContent);

		return jsonResponse({ saved: true, path: absolutePath });
	} catch (error) {
		return errorResponse(`Failed to save artifact: ${String(error)}`);
	}
}

export async function handleArtifactPatchRequest(
	docId: string,
	apiContext?: ApiContext,
	deps: ArtifactsApiDependencyOverrides = {},
): Promise<Response> {
	try {
		const dependencies = resolveDependencies(deps);
		const db = await dependencies.getDb();
		const artifact = dependencies.getArtifactBaseline(db, docId);

		if (!artifact) {
			return errorResponse(`Artifact not found: ${docId}`, 404);
		}

		if (artifact.baseline === null) {
			return jsonResponse({ patch: null, message: "No edits recorded" });
		}

		const artifactRecord = dependencies.getArtifactByDocId(db, docId);
		if (!artifactRecord) {
			return errorResponse(`Artifact not found: ${docId}`, 404);
		}

		const run =
			artifactRecord.runId != null
				? dependencies.getRunById(db, artifactRecord.runId)
				: null;
		const directories =
			run != null
				? getRunDirectories(run)
				: resolveProjectDirectories(artifact.projectPath);

		const resolvedPath =
			run != null
				? ((await dependencies.resolveArtifactPathForRun(
						db,
						run,
						artifactRecord,
					)) ??
					(await resolveArtifactPath(
						db,
						directories,
						artifactRecord,
						dependencies,
					)))
				: await resolveArtifactPath(
						db,
						directories,
						artifactRecord,
						dependencies,
					);

		if (!resolvedPath) {
			return jsonResponse({ patch: null, message: "File not found on disk" });
		}

		if (
			apiContext?.websocketHub &&
			resolveArtifactAbsolutePath(directories, artifactRecord) !== resolvedPath
		) {
			const projects = await dependencies.getAllProjects(db);
			const project = run
				? findProjectByPathSet(
						projects,
						getEffectiveProjectPath(run),
						run.projectPath,
					)
				: findProjectByPathSet(projects, artifact.projectPath);
			if (project && run) {
				broadcastPathReconciliation(
					apiContext.websocketHub,
					project.id,
					run.id,
					run.featureId,
					docId,
					toArtifactDisplayPathFromAbsolute(directories, resolvedPath),
				);
			}
		}

		const currentContent = await Bun.file(resolvedPath).text();

		if (artifact.baseline === currentContent) {
			return jsonResponse({ patch: null, message: "No changes" });
		}

		// Use the potentially-updated path for diff headers
		const displayPath = toArtifactDisplayPathFromAbsolute(
			directories,
			resolvedPath,
		);

		const patch = createTwoFilesPatch(
			`a/${displayPath}`,
			`b/${displayPath}`,
			artifact.baseline,
			currentContent,
		);

		return jsonResponse({ patch });
	} catch (error) {
		return errorResponse(`Failed to compute patch: ${String(error)}`);
	}
}
