/**
 * REST API endpoints for annotation operations.
 * Provides CRUD operations for annotations with WebSocket broadcast on mutations.
 */

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
			case "FileSystemError":
				return errorResponse(error.message, 500);
		}
	}
	return errorResponse(String(error), 500);
}

/**
 * Validate anchor structure.
 */
function isValidAnchor(anchor: unknown): boolean {
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
		default:
			return false;
	}
}

/**
 * Validate CreateAnnotationRequest body.
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

	if (typeof req.artifactPath !== "string" || req.artifactPath.trim() === "") {
		return {
			valid: false,
			error: "artifactPath is required and must be a non-empty string",
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

	return {
		valid: true,
		request: {
			artifactPath: req.artifactPath as string,
			anchor: req.anchor as CreateAnnotationRequest["anchor"],
			content: req.content as string,
		},
	};
}

/**
 * GET /api/v2/annotations - list annotations.
 * Query params: artifactPath (optional) - filter by artifact path.
 */
export async function handleAnnotationsListRequest(
	req: Request,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const url = new URL(req.url);
		const artifactPath = url.searchParams.get("artifactPath") ?? undefined;

		const annotations = await getAnnotations(ctx.projectPath, artifactPath);
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
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const annotation = await getAnnotation(ctx.projectPath, id);

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
		const body = await req.json();
		const validation = validateCreateRequest(body);

		if (!validation.valid || !validation.request) {
			return errorResponse(validation.error ?? "Invalid request", 400);
		}

		const annotation = await createAnnotation(
			ctx.projectPath,
			validation.request,
		);

		// Broadcast annotation created
		ctx.websocketHub?.broadcastAnnotationCreated(annotation);

		return jsonResponse(annotation, 201);
	} catch (error) {
		return handleServiceError(error);
	}
}

/**
 * PATCH /api/v2/annotations/:id - update annotation.
 */
export async function handleAnnotationUpdateRequest(
	id: string,
	req: Request,
	ctx: AnnotationApiContext,
): Promise<Response> {
	try {
		const body = (await req.json()) as Record<string, unknown>;

		// Validate allowed update fields
		const allowedFields = ["content", "orphaned"];
		const updates: Partial<Pick<Annotation, "content" | "orphaned">> = {};

		for (const field of allowedFields) {
			if (field in body) {
				if (field === "content" && typeof body.content !== "string") {
					return errorResponse("content must be a string", 400);
				}
				if (field === "orphaned" && typeof body.orphaned !== "boolean") {
					return errorResponse("orphaned must be a boolean", 400);
				}
				(updates as Record<string, unknown>)[field] = body[field];
			}
		}

		if (Object.keys(updates).length === 0) {
			return errorResponse("No valid update fields provided", 400);
		}

		const annotation = await updateAnnotation(ctx.projectPath, id, updates);

		// Broadcast annotation updated
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
		await resolveAnnotation(ctx.projectPath, id);

		// Broadcast annotation resolved
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
		await reopenAnnotation(ctx.projectPath, id);

		// Fetch updated annotation for broadcast
		const annotation = await getAnnotation(ctx.projectPath, id);
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
		await deleteAnnotation(ctx.projectPath, id);

		// Broadcast annotation deleted
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

		const reply = await addReply(ctx.projectPath, id, replyRequest);

		// Broadcast reply added
		ctx.websocketHub?.broadcastAnnotationReplyAdded(id, reply);

		return jsonResponse(reply, 201);
	} catch (error) {
		return handleServiceError(error);
	}
}
