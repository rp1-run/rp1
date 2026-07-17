/**
 * Annotation persistence service backed by SQLite.
 * All annotation data is stored in the annotations table of rp1.db,
 * referenced by doc_id (foreign key to artifacts.doc_id).
 */

import type { Database } from "bun:sqlite";
import type {
	AnnotationRecord,
	AnnotationStatus,
} from "../../../src/agent-tools/emit/database.js";
import {
	deleteAnnotation as dbDeleteAnnotation,
	updateAnnotation as dbUpdateAnnotation,
	getAnnotationById,
	getAnnotationsForDocId,
	getAnnotationsForRun,
	getArtifactByDocId,
	getRunById,
	resolveArtifactPathForRun,
	upsertAnnotation,
} from "../../../src/agent-tools/emit/database.js";
import type {
	AddReplyRequest,
	Anchor,
	Annotation,
	AnnotationReply,
	CreateAnnotationRequest,
	HiddenAnchor,
	LineAnchor,
	TextSelectionAnchor,
} from "../types/annotations";
import {
	locateSourceAnchor,
	type MarkdownProjection,
	makeSourceAnchor,
	projectMarkdown,
	resolveSourceAnchor,
} from "./markdown-projection";
import {
	resolveArtifactAbsolutePath,
	resolveProjectDirectories,
} from "./project-paths";

/**
 * Error types for annotation operations.
 */
export type AnnotationServiceError =
	| { readonly _tag: "NotFound"; readonly id: string }
	| { readonly _tag: "DatabaseError"; readonly message: string }
	| { readonly _tag: "ValidationError"; readonly message: string };

/**
 * Data stored in the annotation's JSON `data` column.
 */
interface AnnotationData {
	readonly anchor: Anchor;
	readonly orphaned: boolean;
	readonly artifactPath?: string;
}

/**
 * Convert an AnnotationRecord from the database into the client-facing Annotation type.
 * Fetches child replies from the database for threading.
 */
function recordToAnnotation(
	db: Database,
	record: AnnotationRecord,
): Annotation {
	const data: AnnotationData = record.data
		? (JSON.parse(record.data) as AnnotationData)
		: {
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 0,
					selectedText: "",
					contextBefore: "",
					contextAfter: "",
				},
				orphaned: false,
			};

	const replyRows = db
		.prepare(
			"SELECT * FROM annotations WHERE parent_id = $parentId ORDER BY created_at ASC",
		)
		.all({ $parentId: record.id }) as Array<{
		id: number;
		doc_id: string;
		run_id: string | null;
		content: string;
		data: string | null;
		parent_id: number | null;
		status: string;
		author: string;
		created_at: string;
		updated_at: string;
	}>;

	const replies: AnnotationReply[] = replyRows.map((row) => ({
		id: String(row.id),
		content: row.content,
		author: row.author,
		createdAt: row.created_at,
	}));

	return {
		id: String(record.id),
		docId: record.docId,
		artifactPath: data.artifactPath,
		runId: record.runId ?? undefined,
		anchor: data.anchor,
		content: record.content,
		status: record.status,
		author: record.author,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		replies,
		orphaned: data.orphaned,
	};
}

/**
 * Serialize anchor and orphaned state into the data JSON column.
 */
function buildDataJson(
	anchor: Anchor,
	orphaned: boolean,
	artifactPath?: string,
): string {
	const data: AnnotationData = { anchor, orphaned, artifactPath };
	return JSON.stringify(data);
}

/**
 * Get all annotations, optionally filtered by doc_id and/or run_id.
 */
export function getAnnotations(
	db: Database,
	opts: { docId?: string; runId?: string } = {},
): Annotation[] {
	let records: AnnotationRecord[];

	if (opts.docId && opts.runId) {
		const rows = db
			.prepare(
				"SELECT * FROM annotations WHERE doc_id = $docId AND run_id = $runId AND parent_id IS NULL ORDER BY created_at ASC",
			)
			.all({ $docId: opts.docId, $runId: opts.runId }) as Array<{
			id: number;
			doc_id: string;
			run_id: string | null;
			content: string;
			data: string | null;
			parent_id: number | null;
			status: string;
			author: string;
			created_at: string;
			updated_at: string;
		}>;

		records = rows.map((row) => ({
			id: row.id,
			docId: row.doc_id,
			runId: row.run_id,
			content: row.content,
			data: row.data,
			parentId: row.parent_id,
			status: row.status as AnnotationStatus,
			author: row.author,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	} else if (opts.docId) {
		records = getAnnotationsForDocId(db, opts.docId).filter(
			(r) => r.parentId === null,
		);
	} else if (opts.runId) {
		records = getAnnotationsForRun(db, opts.runId).filter(
			(r) => r.parentId === null,
		);
	} else {
		const rows = db
			.prepare(
				"SELECT * FROM annotations WHERE parent_id IS NULL ORDER BY created_at ASC",
			)
			.all() as Array<{
			id: number;
			doc_id: string;
			run_id: string | null;
			content: string;
			data: string | null;
			parent_id: number | null;
			status: string;
			author: string;
			created_at: string;
			updated_at: string;
		}>;

		records = rows.map((row) => ({
			id: row.id,
			docId: row.doc_id,
			runId: row.run_id,
			content: row.content,
			data: row.data,
			parentId: row.parent_id,
			status: row.status as AnnotationStatus,
			author: row.author,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	return records.map((r) => recordToAnnotation(db, r));
}

/**
 * Get a single annotation by ID.
 */
export function getAnnotation(db: Database, id: string): Annotation | null {
	const numId = Number(id);
	if (Number.isNaN(numId)) {
		return null;
	}

	const record = getAnnotationById(db, numId);
	if (!record || record.parentId !== null) {
		return null;
	}

	return recordToAnnotation(db, record);
}

/**
 * Create a new annotation.
 */
export function createAnnotation(
	db: Database,
	request: CreateAnnotationRequest,
	author?: string,
): Annotation {
	const dataJson = buildDataJson(request.anchor, false, request.artifactPath);

	const record = upsertAnnotation(db, {
		docId: request.docId,
		runId: request.runId,
		content: request.content,
		data: dataJson,
		status: "open",
		author: author ?? "user",
	});

	return recordToAnnotation(db, record);
}

/**
 * Update an existing annotation.
 * Supports updating content and orphaned status.
 */
export function updateAnnotation(
	db: Database,
	id: string,
	updates: Partial<Pick<Annotation, "content" | "orphaned">>,
): Annotation {
	const numId = Number(id);
	if (Number.isNaN(numId)) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = getAnnotationById(db, numId);
	if (!existing) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const updatePayload: { content?: string; data?: string } = {};

	if (updates.content != null) {
		updatePayload.content = updates.content;
	}

	if (updates.orphaned != null) {
		const existingData: AnnotationData = existing.data
			? (JSON.parse(existing.data) as AnnotationData)
			: {
					anchor: {
						type: "text-selection",
						startOffset: 0,
						endOffset: 0,
						selectedText: "",
						contextBefore: "",
						contextAfter: "",
					},
					orphaned: false,
				};

		updatePayload.data = JSON.stringify({
			...existingData,
			orphaned: updates.orphaned,
		});
	}

	const record = dbUpdateAnnotation(db, numId, updatePayload);
	return recordToAnnotation(db, record);
}

/**
 * Mark an annotation as resolved.
 */
export function resolveAnnotation(db: Database, id: string): void {
	const numId = Number(id);
	if (Number.isNaN(numId)) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = getAnnotationById(db, numId);
	if (!existing) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	dbUpdateAnnotation(db, numId, { status: "resolved" });
}

/**
 * Reopen a resolved annotation.
 */
export function reopenAnnotation(db: Database, id: string): void {
	const numId = Number(id);
	if (Number.isNaN(numId)) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = getAnnotationById(db, numId);
	if (!existing) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	dbUpdateAnnotation(db, numId, { status: "open" });
}

/**
 * Delete an annotation and its replies.
 */
export function deleteAnnotation(db: Database, id: string): void {
	const numId = Number(id);
	if (Number.isNaN(numId)) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = getAnnotationById(db, numId);
	if (!existing) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	db.prepare("DELETE FROM annotations WHERE parent_id = $parentId").run({
		$parentId: numId,
	});

	dbDeleteAnnotation(db, numId);
}

/**
 * Add a reply to an annotation thread.
 * Creates a child annotation row with parent_id pointing to the root annotation.
 */
export function addReply(
	db: Database,
	annotationId: string,
	request: AddReplyRequest,
	author?: string,
): AnnotationReply {
	const numId = Number(annotationId);
	if (Number.isNaN(numId)) {
		const error: AnnotationServiceError = {
			_tag: "NotFound",
			id: annotationId,
		};
		throw error;
	}

	const parent = getAnnotationById(db, numId);
	if (!parent) {
		const error: AnnotationServiceError = {
			_tag: "NotFound",
			id: annotationId,
		};
		throw error;
	}

	const record = upsertAnnotation(db, {
		docId: parent.docId,
		runId: parent.runId ?? undefined,
		content: request.content,
		parentId: numId,
		status: "open",
		author: author ?? "user",
	});

	return {
		id: String(record.id),
		content: record.content,
		author: record.author,
		createdAt: record.createdAt,
	};
}

/**
 * Project markdown (or rendered DOM text) onto a whitespace-free plain-text
 * form for anchor matching. Text-selection anchors carry text captured from
 * the rendered DOM, where inline markers (backticks, emphasis), link syntax,
 * HTML tags, and block separators are absent or differ from the markdown
 * source, so a literal `includes` check wrongly orphans any selection that
 * spans formatting. Stripping syntax on both sides and dropping all
 * whitespace makes the match layout-insensitive; false positives only make
 * an annotation count as still-anchored, which is the safe direction.
 */
export function normalizeForAnchorMatch(text: string): string {
	return text
		.replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, "")
		.replace(/<[a-zA-Z/][^>]*>/g, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
		.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
		.replace(/[`*_~|#>]/g, "")
		.replace(/\s+/g, "");
}

/**
 * Check if an anchor can be found in the given content.
 *
 * Text-selection anchors with resolved source coordinates are validated by
 * exact source-domain matching. Legacy anchors (rendered-text only) fall
 * back to literal and then normalized matching until lazy migration in
 * detectOrphanedAnnotations resolves them to source coordinates.
 */
function isAnchorValid(anchor: Anchor, content: string): boolean {
	switch (anchor.type) {
		case "text-selection": {
			const textAnchor = anchor as TextSelectionAnchor;
			if (textAnchor.source) {
				return locateSourceAnchor(textAnchor.source, content) !== null;
			}
			if (content.includes(textAnchor.selectedText)) {
				return true;
			}
			const normalizedSelection = normalizeForAnchorMatch(
				textAnchor.selectedText,
			);
			if (normalizedSelection.length === 0) {
				return false;
			}
			return normalizeForAnchorMatch(content).includes(normalizedSelection);
		}
		case "hidden-anchor": {
			const hiddenAnchor = anchor as HiddenAnchor;
			const anchorPattern = new RegExp(
				`<a\\s+id=["']${escapeRegex(hiddenAnchor.anchorId)}["']`,
				"i",
			);
			return anchorPattern.test(content);
		}
		case "line": {
			const lineAnchor = anchor as LineAnchor;
			const lines = content.split("\n");
			if (lineAnchor.lineNumber < 1 || lineAnchor.lineNumber > lines.length) {
				return false;
			}
			const targetLine = lines[lineAnchor.lineNumber - 1];
			return targetLine.trim() === lineAnchor.lineContent.trim();
		}
		default:
			return false;
	}
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve source coordinates for a text-selection anchor when they are
 * missing or no longer match the content (the document may have been
 * reformatted while the rendered text survived). Existing anchors whose
 * occurrence moved are re-anchored at the located position with fresh
 * contexts. Returns the original anchor when nothing better can be resolved.
 */
export function enrichAnchorWithSource(
	anchor: Anchor,
	content: string,
	projection?: MarkdownProjection,
): Anchor {
	if (anchor.type !== "text-selection") return anchor;
	const textAnchor = anchor as TextSelectionAnchor;
	if (textAnchor.source) {
		const located = locateSourceAnchor(textAnchor.source, content);
		if (located) {
			if (
				located.start === textAnchor.source.start &&
				located.end === textAnchor.source.end
			) {
				return anchor;
			}
			return {
				...textAnchor,
				source: makeSourceAnchor(content, located.start, located.end),
			};
		}
	}
	const resolved = resolveSourceAnchor(textAnchor, content, projection);
	return resolved ? { ...textAnchor, source: resolved } : anchor;
}

/**
 * Detect and mark orphaned annotations for a specific artifact by doc_id.
 * An annotation is orphaned when its anchor text can no longer be found in the content.
 * Text-selection anchors are (re-)resolved to source coordinates as part of
 * the pass, which lazily migrates legacy anchors and re-anchors annotations
 * after the document is reformatted.
 * Returns the list of annotation IDs whose orphaned flag was flipped in this pass.
 */
export function detectOrphanedAnnotations(
	db: Database,
	docId: string,
	content: string,
): string[] {
	const records = getAnnotationsForDocId(db, docId).filter(
		(r) => r.parentId === null,
	);

	const flippedIds: string[] = [];
	let projection: MarkdownProjection | undefined;

	for (const record of records) {
		const data: AnnotationData | null = record.data
			? (JSON.parse(record.data) as AnnotationData)
			: null;

		if (!data) {
			continue;
		}

		let anchor = data.anchor;
		if (anchor.type === "text-selection") {
			projection ??= projectMarkdown(content);
			anchor = enrichAnchorWithSource(anchor, content, projection);
		}

		const isValid = isAnchorValid(anchor, content);
		const shouldBeOrphaned = !isValid;
		const anchorChanged = anchor !== data.anchor;

		if (data.orphaned !== shouldBeOrphaned || anchorChanged) {
			const updatedData: AnnotationData = {
				...data,
				anchor,
				orphaned: shouldBeOrphaned,
			};
			dbUpdateAnnotation(db, record.id, {
				data: JSON.stringify(updatedData),
			});
			if (data.orphaned !== shouldBeOrphaned) {
				flippedIds.push(String(record.id));
			}
		}
	}

	return flippedIds;
}

/**
 * Load the current file content for an artifact identified by doc_id.
 * Looks up the artifact record, resolves its absolute path, and reads the file.
 * Falls back to run-aware resolveArtifactPath when the direct path is missing
 * (e.g. after archive or move operations).
 * Returns null if the artifact is not found or the file cannot be read.
 */
export async function loadContentForDocId(
	db: Database,
	docId: string,
): Promise<string | null> {
	const artifact = getArtifactByDocId(db, docId);
	if (!artifact) {
		return null;
	}

	if (artifact.locationKind === "url") {
		return null;
	}

	try {
		// 1. Run-aware resolution: if the artifact belongs to a run, use
		//    resolveArtifactPathForRun which honours the run's rp1ProjectRoot
		//    and rp1WorkRoot (critical for non-default project roots).
		if (artifact.runId) {
			const run = getRunById(db, artifact.runId);
			if (run) {
				const runResolvedPath = await resolveArtifactPathForRun(
					db,
					run,
					artifact,
				);
				if (runResolvedPath) {
					const runFile = Bun.file(runResolvedPath);
					if (await runFile.exists()) {
						return await runFile.text();
					}
				}
			}
		}

		// 2. Direct path resolution using project directories.
		const directories = resolveProjectDirectories(artifact.projectPath);
		const absolutePath = resolveArtifactAbsolutePath(directories, artifact);
		const file = Bun.file(absolutePath);
		if (await file.exists()) {
			return await file.text();
		}

		// 3. Fallback: dynamic-import resolveArtifactPath for moved/archived artifacts
		if (artifact.path && artifact.storageRoot) {
			const { resolveArtifactPath } = await import("./routes/artifacts-api");
			const resolvedPath = await resolveArtifactPath(db, directories, artifact);
			if (resolvedPath) {
				return await Bun.file(resolvedPath).text();
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Run orphan detection for a given doc_id by loading the artifact's current
 * file content and calling detectOrphanedAnnotations.
 * Logs a warning and returns silently if content cannot be loaded.
 * Returns the list of annotation IDs whose orphaned flag was flipped.
 */
export async function runOrphanDetectionForDoc(
	db: Database,
	docId: string,
): Promise<string[]> {
	try {
		const content = await loadContentForDocId(db, docId);
		if (content === null) {
			console.warn(
				`[orphan-detection] Could not load content for doc ${docId}, skipping detection`,
			);
			return [];
		}
		return detectOrphanedAnnotations(db, docId, content);
	} catch (error) {
		console.warn(
			`[orphan-detection] Failed for doc ${docId}: ${String(error)}`,
		);
		return [];
	}
}

/**
 * Format an annotation service error for display.
 */
export function formatAnnotationServiceError(
	error: AnnotationServiceError,
): string {
	switch (error._tag) {
		case "NotFound":
			return `Annotation not found: ${error.id}`;
		case "DatabaseError":
			return `Database error: ${error.message}`;
		case "ValidationError":
			return `Validation error: ${error.message}`;
	}
}
