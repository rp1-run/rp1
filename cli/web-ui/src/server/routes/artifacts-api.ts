/**
 * REST API endpoints for artifact file operations.
 * Provides save-to-disk functionality for edited artifacts with path validation.
 */

import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import {
	getEmitDatabase,
	getRunById,
	setArtifactBaseline,
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

		const absolutePath = resolve(projectRoot, body.path);

		const file = Bun.file(absolutePath);
		if (!(await file.exists())) {
			return errorResponse(
				"File does not exist: only existing files can be saved",
				404,
			);
		}

		const artifactRow = db
			.prepare(
				"SELECT doc_id, baseline FROM artifacts WHERE run_id = $runId AND path = $path LIMIT 1",
			)
			.get({ $runId: runId, $path: body.path }) as {
			doc_id: string;
			baseline: string | null;
		} | null;

		if (artifactRow && artifactRow.baseline === null) {
			const originalContent = await file.text();
			setArtifactBaseline(db, artifactRow.doc_id, originalContent);
		}

		await Bun.write(absolutePath, body.content);

		return jsonResponse({ saved: true, path: absolutePath });
	} catch (error) {
		return errorResponse(`Failed to save artifact: ${String(error)}`);
	}
}
