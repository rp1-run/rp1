/**
 * REST API endpoints for annotation operations.
 * Provides CRUD operations for annotations with WebSocket broadcast on mutations.
 * All annotation data is stored in SQLite via the emit database module.
 */

import type { Database } from "bun:sqlite";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import { getEmitDatabase } from "../../../../src/agent-tools/emit/database.js";
import type {
	AddReplyRequest,
	Annotation,
	CreateAnnotationRequest,
} from "../../types/annotations";
import {
	type AnnotationServiceError,
	addReply,
	createAnnotation,
	deleteAnnotation,
	getAnnotation,
	getAnnotations,
	reopenAnnotation,
	resolveAnnotation,
	updateAnnotation,
} from "../annotation-service";
import type { WebSocketHub } from "../websocket";

/**
 * Context for annotation API handlers.
 */
export interface AnnotationApiContext {
	readonly projectPath: string;
	readonly websocketHub?: WebSocketHub;
}

/**
 * Acquire the emit database connection.
 */
async function getDb(): Promise<Database> {
	const result = await getEmitDatabase()();
	if (E.isLeft(result)) {
		throw new Error(`Database unavailable: ${formatError(result.left, false)}`);
	}
	return result.right;
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

/**
 * Check if an error is an AnnotationServiceError.
 */
function isAnnotationServiceError(
	error: unknown,
): error is AnnotationServiceError {
	return (
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		typeof (error as { _tag: unknown })._tag === "string"
	);
}

/**
 * Handle AnnotationServiceError and return appropriate response.
 */
function handleServiceError(error: unknown): Response {
	if (isAnnotationServiceError(error)) {
		switch (error._tag) {
			case "NotFound":
				return errorResponse(`Annotation not found: ${error.id}`, 404);
			case "ValidationError":
				return errorResponse(error.message, 400);
			case "DatabaseError":
				return errorResponse(error.message, 500);
		}
	}
	return errorResponse(String(error), 500);
}

/**
 * Validate a single LineDiffEntry structure.
 */
function isValidLineDiffEntry(entry: unknown): boolean {
	if (typeof entry !== "object" || entry === null) return false;

	const e = entry as Record<string, unknown>;
	const validTypes = ["added", "modified", "deleted", "unchanged"];
	return (
		typeof e.type === "string" &&
		validTypes.includes(e.type) &&
		typeof e.line === "number" &&
		(e.before === null || typeof e.before === "string") &&
		(e.after === null || typeof e.after === "string")
	);
}

/**
 * Validate anchor structure.
 */
export function isValidAnchor(anchor: unknown): boolean {
	if (typeof anchor !== "object" || anchor === null) return false;

	const anchorObj = anchor as Record<string, unknown>;
	const type = anchorObj.type;

	switch (type) {
		case "text-selection":
			return (
				typeof anchorObj.startOffset === "number" &&
				typeof anchorObj.endOffset === "number" &&
				typeof anchorObj.selectedText === "string" &&
				typeof anchorObj.contextBefore === "string" &&
				typeof anchorObj.contextAfter === "string"
			);
		case "hidden-anchor":
			return (
				typeof anchorObj.anchorId === "string" &&
				typeof anchorObj.anchorText === "string"
			);
		case "line":
			return (
				typeof anchorObj.lineNumber === "number" &&
				typeof anchorObj.lineContent === "string"
			);
		case "edit-diff":
			return (
				Array.isArray(anchorObj.diffs) &&
				anchorObj.diffs.every(isValidLineDiffEntry) &&
				typeof anchorObj.baselineHash === "string"
			);
		default:
			return false;
	}
}

/**
 * Validate CreateAnnotationRequest body.
 * Requires docId as the primary artifact identifier.
 */
function validateCreateRequest(body: unknown): {
	valid: boolean;
	error?: string;
	request?: CreateAnnotationRequest;
} {
	if (typeof body !== "object" || body === null) {
		return { valid: false, error: "Request body must be an object" };
	}

	const req = body as Record<string, unknown>;

	if (typeof req.docId !== "string" || req.docId.trim() === "") {
		return {
			valid: false,
			error: "docId is required and must be a non-empty string",
		};
	}

	if (!isValidAnchor(req.anchor)) {
		return {
			valid: false,
			error: "anchor is required and must be a valid anchor object",
		};
	}

	if (typeof req.content !== "string") {
		return { valid: false, error: "content is required and must be a string" };
	}

	const artifactPath =
		typeof req.artifactPath === "string" ? req.artifactPath : undefined;
	const runId = typeof req.runId === "string" ? req.runId : undefined;

	return {
		valid: true,
		request: {
			docId: req.docId as string,
			artifactPath,
			anchor: req.anchor as CreateAnnotationRequest["anchor"],
			content: req.content as string,
			runId,
		},
	};
}

/**
 * GET /api/v2/annotations - list annotations.
 * Query params: docId (optional), runId (optional) - filter by artifact doc_id and/or run.
 */
export async function handleAnnotationsListRequest(
	req: Request,
	_ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const url = new URL(req.url);
		const docId = url.searchParams.get("docId") ?? undefined;
		const runId = url.searchParams.get("runId") ?? undefined;

		const annotations = getAnnotations(db, { docId, runId });
		return jsonResponse({ annotations });
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * GET /api/v2/annotations/:id - get single annotation.
 */
export async function handleAnnotationGetRequest(
	id: string,
	_ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const annotation = getAnnotation(db, id);

		if (!annotation) {
			return errorResponse(`Annotation not found: ${id}`, 404);
		}

		return jsonResponse(annotation);
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * POST /api/v2/annotations - create annotation.
 */
export async function handleAnnotationCreateRequest(
	req: Request,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const body = await req.json();
		const validation = validateCreateRequest(body);

		if (!validation.valid || !validation.request) {
			return errorResponse(validation.error ?? "Invalid request", 400);
		}

		const annotation = createAnnotation(db, validation.request);

		ctx.websocketHub?.broadcastAnnotationCreated(annotation);

		return jsonResponse(annotation, 201);
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * PATCH /api/v2/annotations/:id - update annotation.
 * Supports content, orphaned, and status updates.
 */
export async function handleAnnotationUpdateRequest(
	id: string,
	req: Request,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const body = (await req.json()) as Record<string, unknown>;

		const allowedFields = ["content", "orphaned", "status"];
		const updates: Partial<Pick<Annotation, "content" | "orphaned">> = {};
		let statusUpdate: "open" | "resolved" | undefined;

		for (const field of allowedFields) {
			if (field in body) {
				if (field === "content" && typeof body.content !== "string") {
					return errorResponse("content must be a string", 400);
				}
				if (field === "orphaned" && typeof body.orphaned !== "boolean") {
					return errorResponse("orphaned must be a boolean", 400);
				}
				if (field === "status") {
					if (body.status !== "open" && body.status !== "resolved") {
						return errorResponse('status must be "open" or "resolved"', 400);
					}
					statusUpdate = body.status as "open" | "resolved";
					continue;
				}
				(updates as Record<string, unknown>)[field] = body[field];
			}
		}

		if (Object.keys(updates).length === 0 && statusUpdate === undefined) {
			return errorResponse("No valid update fields provided", 400);
		}

		if (statusUpdate === "resolved") {
			resolveAnnotation(db, id);
		} else if (statusUpdate === "open") {
			reopenAnnotation(db, id);
		}

		let annotation: Annotation;
		if (Object.keys(updates).length > 0) {
			annotation = updateAnnotation(db, id, updates);
		} else {
			const fetched = getAnnotation(db, id);
			if (!fetched) {
				return errorResponse(`Annotation not found: ${id}`, 404);
			}
			annotation = fetched;
		}

		ctx.websocketHub?.broadcastAnnotationUpdated(annotation);

		return jsonResponse(annotation);
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * POST /api/v2/annotations/:id/resolve - mark annotation as resolved.
 */
export async function handleAnnotationResolveRequest(
	id: string,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		resolveAnnotation(db, id);

		ctx.websocketHub?.broadcastAnnotationResolved(id);

		return jsonResponse({ resolved: true });
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * POST /api/v2/annotations/:id/reopen - reopen a resolved annotation.
 */
export async function handleAnnotationReopenRequest(
	id: string,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		reopenAnnotation(db, id);

		const annotation = getAnnotation(db, id);
		if (annotation) {
			ctx.websocketHub?.broadcastAnnotationUpdated(annotation);
		}

		return jsonResponse({ reopened: true });
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * DELETE /api/v2/annotations/:id - delete annotation.
 */
export async function handleAnnotationDeleteRequest(
	id: string,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		deleteAnnotation(db, id);

		ctx.websocketHub?.broadcastAnnotationDeleted(id);

		return jsonResponse({ deleted: true });
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * POST /api/v2/annotations/:id/replies - add reply to annotation thread.
 */
export async function handleAnnotationReplyRequest(
	id: string,
	req: Request,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const body = (await req.json()) as Record<string, unknown>;

		if (typeof body.content !== "string" || body.content.trim() === "") {
			return errorResponse(
				"content is required and must be a non-empty string",
				400,
			);
		}

		const replyRequest: AddReplyRequest = {
			content: body.content as string,
		};

		const reply = addReply(db, id, replyRequest);

		ctx.websocketHub?.broadcastAnnotationReplyAdded(id, reply);

		return jsonResponse(reply, 201);
	} catch (error) {
		return handleServiceError(error);
	}
}
