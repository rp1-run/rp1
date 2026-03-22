/**
 * REST API endpoints for artifact file operations.
 * Provides save-to-disk functionality for edited artifacts with path validation,
 * on-demand unified diff computation for agent consumption, and doc_id-based
 * path reconciliation when files have been moved (e.g., by the archiver).
 */

import type { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import {
	getArtifactBaseline,
	getArtifactByRunAndDocId,
	getEmitDatabase,
	getRunById,
	setArtifactBaseline,
	updateArtifactPath,
} from "../../../../src/agent-tools/emit/database.js";
import { getAllProjects } from "../registry";
import { type ApiContext, errorResponse, jsonResponse } from "./content-utils";

async function getDb(): Promise<Database> {
	const result = await getEmitDatabase()();
	if (E.isLeft(result)) {
		throw new Error(`Database unavailable: ${formatError(result.left, false)}`);
	}
	return result.right;
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
 * Scan .rp1/work/ for a markdown file containing the given doc_id in its frontmatter.
 * Returns the relative path (from projectRoot) if found, null otherwise.
 * Bounded to .rp1/work/ and only scans .md files. Stops on first match.
 */
export async function scanForDocId(
	projectRoot: string,
	docId: string,
	maxDepth = 8,
): Promise<string | null> {
	const workDir = join(projectRoot, ".rp1", "work");

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
						return relative(projectRoot, fullPath);
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

	return scanDir(workDir, 0);
}

/**
 * Resolve an artifact's on-disk path using doc_id-based reconciliation.
 *
 * Fast path: file exists at the stored (cached) path -- returns immediately.
 * Slow path: scans .rp1/work/ for a file with matching rp1_doc_id in frontmatter.
 * On scan hit: updates the path column in the DB (cache refresh) and returns the new path.
 * On scan miss: returns null (file truly gone).
 */
export async function resolveArtifactPath(
	db: Database,
	projectRoot: string,
	storedPath: string,
	docId: string,
): Promise<string | null> {
	const absolutePath = resolve(projectRoot, storedPath);
	if (await Bun.file(absolutePath).exists()) {
		return absolutePath;
	}

	const newRelativePath = await scanForDocId(projectRoot, docId);
	if (newRelativePath === null) {
		return null;
	}

	updateArtifactPath(db, docId, newRelativePath);
	console.log(
		`[path-reconciliation] Updated artifact path for ${docId}: ${storedPath} -> ${newRelativePath}`,
	);

	return resolve(projectRoot, newRelativePath);
}

export async function handleArtifactSaveRequest(
	runId: string,
	req: Request,
	_apiContext: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const record = getRunById(db, runId);

		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === record.projectPath);
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

		const projectRoot = resolve(project.path);
		const validationError = validateSavePath(body.path, projectRoot);
		if (validationError) {
			return errorResponse(validationError, 400);
		}

		// Primary lookup: by run_id + path
		let artifactRow = db
			.prepare(
				"SELECT doc_id, baseline FROM artifacts WHERE run_id = $runId AND path = $path LIMIT 1",
			)
			.get({ $runId: runId, $path: body.path }) as {
			doc_id: string;
			baseline: string | null;
		} | null;

		// Fallback: if path-based lookup missed (file was moved), try by run_id + doc_id
		// extracted from the content being saved (which contains the frontmatter)
		if (!artifactRow) {
			const contentDocId = extractDocIdFromContent(body.content);
			if (contentDocId) {
				const fallbackRecord = getArtifactByRunAndDocId(
					db,
					runId,
					contentDocId,
				);
				if (fallbackRecord) {
					artifactRow = {
						doc_id: fallbackRecord.docId,
						baseline: null,
					};
					// Read baseline from DB since we have a fresh record
					const baselineInfo = getArtifactBaseline(db, contentDocId);
					if (baselineInfo) {
						artifactRow.baseline = baselineInfo.baseline;
					}
					updateArtifactPath(db, contentDocId, body.path);
					console.log(
						`[path-reconciliation] Save handler updated path for ${contentDocId}: ${fallbackRecord.path} -> ${body.path}`,
					);
				}
			}
		}

		let absolutePath = resolve(projectRoot, body.path);
		const fileExists = await Bun.file(absolutePath).exists();

		if (!fileExists && artifactRow) {
			const resolvedPath = await resolveArtifactPath(
				db,
				projectRoot,
				body.path,
				artifactRow.doc_id,
			);
			if (resolvedPath) {
				absolutePath = resolvedPath;
			} else {
				return errorResponse(
					"File does not exist: only existing files can be saved",
					404,
				);
			}
		} else if (!fileExists) {
			return errorResponse(
				"File does not exist: only existing files can be saved",
				404,
			);
		}

		if (artifactRow && artifactRow.baseline === null) {
			const originalContent = await Bun.file(absolutePath).text();
			setArtifactBaseline(db, artifactRow.doc_id, originalContent);
		}

		await Bun.write(absolutePath, body.content);

		return jsonResponse({ saved: true, path: absolutePath });
	} catch (error) {
		return errorResponse(`Failed to save artifact: ${String(error)}`);
	}
}

export async function handleArtifactPatchRequest(
	docId: string,
): Promise<Response> {
	try {
		const db = await getDb();
		const artifact = getArtifactBaseline(db, docId);

		if (!artifact) {
			return errorResponse(`Artifact not found: ${docId}`, 404);
		}

		if (artifact.baseline === null) {
			return jsonResponse({ patch: null, message: "No edits recorded" });
		}

		// Use path reconciliation instead of direct file check
		const resolvedPath = await resolveArtifactPath(
			db,
			artifact.projectPath,
			artifact.path,
			docId,
		);

		if (!resolvedPath) {
			return jsonResponse({ patch: null, message: "File not found on disk" });
		}

		const currentContent = await Bun.file(resolvedPath).text();

		if (artifact.baseline === currentContent) {
			return jsonResponse({ patch: null, message: "No changes" });
		}

		// Use the potentially-updated path for diff headers
		const displayPath = relative(artifact.projectPath, resolvedPath);

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
