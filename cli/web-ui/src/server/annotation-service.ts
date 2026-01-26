/**
 * Annotation persistence service with atomic JSON file operations.
 * Uses open-tasks.json as the single source of truth for annotations.
 */

import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * Schema version for the open-tasks.json file.
 */
const SCHEMA_VERSION = "1.0.0" as const;

/**
 * Root structure for the open-tasks.json file.
 */
export interface OpenTasksFile {
	readonly version: typeof SCHEMA_VERSION;
	readonly lastModified: string;
	readonly annotations: readonly Annotation[];
}

/**
 * Error types for annotation operations.
 */
export type AnnotationServiceError =
	| { readonly _tag: "NotFound"; readonly id: string }
	| { readonly _tag: "FileSystemError"; readonly message: string }
	| { readonly _tag: "ValidationError"; readonly message: string };

/**
 * Generate a unique annotation ID.
 * Uses ANN prefix with timestamp and random suffix for uniqueness.
 */
function generateAnnotationId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `ANN-${timestamp}-${random}`;
}

/**
 * Generate a unique reply ID.
 */
function generateReplyId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 6);
	return `REP-${timestamp}-${random}`;
}

/**
 * Get the path to the open-tasks.json file for a project.
 */
function getOpenTasksPath(projectPath: string): string {
	return join(projectPath, ".rp1", "open-tasks.json");
}

/**
 * Create an empty open-tasks file structure.
 */
function createEmptyOpenTasksFile(): OpenTasksFile {
	return {
		version: SCHEMA_VERSION,
		lastModified: new Date().toISOString(),
		annotations: [],
	};
}

/**
 * Validate the open-tasks file schema.
 */
function isValidOpenTasksFile(data: unknown): data is OpenTasksFile {
	if (typeof data !== "object" || data === null) {
		return false;
	}

	const file = data as Record<string, unknown>;

	if (file.version !== SCHEMA_VERSION) {
		return false;
	}

	if (typeof file.lastModified !== "string") {
		return false;
	}

	if (!Array.isArray(file.annotations)) {
		return false;
	}

	return true;
}

/**
 * Load the open-tasks.json file, creating empty if missing or corrupted.
 */
async function loadOpenTasksFile(projectPath: string): Promise<OpenTasksFile> {
	const filePath = getOpenTasksPath(projectPath);

	try {
		const content = await readFile(filePath, "utf-8");
		const parsed: unknown = JSON.parse(content);

		if (!isValidOpenTasksFile(parsed)) {
			console.warn("open-tasks.json has invalid schema, creating new file");
			return createEmptyOpenTasksFile();
		}

		return parsed;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return createEmptyOpenTasksFile();
		}

		console.warn("Failed to read open-tasks.json, creating new:", error);
		return createEmptyOpenTasksFile();
	}
}

/**
 * Save the open-tasks.json file atomically using temp file + rename.
 */
async function saveOpenTasksFile(
	projectPath: string,
	file: OpenTasksFile,
): Promise<void> {
	const filePath = getOpenTasksPath(projectPath);
	const tempPath = `${filePath}.tmp.${Date.now()}`;

	const updatedFile: OpenTasksFile = {
		...file,
		lastModified: new Date().toISOString(),
	};

	try {
		await writeFile(tempPath, JSON.stringify(updatedFile, null, 2), {
			mode: 0o644,
		});

		await rename(tempPath, filePath);
	} catch (error) {
		try {
			await unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	}
}

/**
 * Get all annotations, optionally filtered by artifact path.
 */
export async function getAnnotations(
	projectPath: string,
	artifactPath?: string,
): Promise<Annotation[]> {
	const file = await loadOpenTasksFile(projectPath);

	if (artifactPath) {
		return file.annotations.filter(
			(a) => a.artifactPath === artifactPath,
		) as Annotation[];
	}

	return file.annotations as Annotation[];
}

/**
 * Get a single annotation by ID.
 */
export async function getAnnotation(
	projectPath: string,
	id: string,
): Promise<Annotation | null> {
	const file = await loadOpenTasksFile(projectPath);
	const annotation = file.annotations.find((a) => a.id === id);
	return (annotation as Annotation) ?? null;
}

/**
 * Create a new annotation.
 */
export async function createAnnotation(
	projectPath: string,
	request: CreateAnnotationRequest,
	author?: string,
): Promise<Annotation> {
	const file = await loadOpenTasksFile(projectPath);
	const now = new Date().toISOString();

	const annotation: Annotation = {
		id: generateAnnotationId(),
		artifactPath: request.artifactPath,
		anchor: request.anchor,
		annotationType: request.annotationType,
		content: request.content,
		suggestion: request.suggestion ?? null,
		status: "open",
		author: author ?? "user",
		createdAt: now,
		updatedAt: now,
		replies: [],
		orphaned: false,
	};

	const updatedFile: OpenTasksFile = {
		...file,
		annotations: [...file.annotations, annotation],
	};

	await saveOpenTasksFile(projectPath, updatedFile);
	return annotation;
}

/**
 * Update an existing annotation.
 * Only allows updating content, suggestion, and orphaned status.
 */
export async function updateAnnotation(
	projectPath: string,
	id: string,
	updates: Partial<Pick<Annotation, "content" | "suggestion" | "orphaned">>,
): Promise<Annotation> {
	const file = await loadOpenTasksFile(projectPath);
	const index = file.annotations.findIndex((a) => a.id === id);

	if (index === -1) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = file.annotations[index];
	const updated: Annotation = {
		...existing,
		...updates,
		updatedAt: new Date().toISOString(),
	};

	const annotations = [...file.annotations];
	annotations[index] = updated;

	const updatedFile: OpenTasksFile = {
		...file,
		annotations,
	};

	await saveOpenTasksFile(projectPath, updatedFile);
	return updated;
}

/**
 * Mark an annotation as resolved.
 */
export async function resolveAnnotation(
	projectPath: string,
	id: string,
): Promise<void> {
	const file = await loadOpenTasksFile(projectPath);
	const index = file.annotations.findIndex((a) => a.id === id);

	if (index === -1) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = file.annotations[index];
	const updated: Annotation = {
		...existing,
		status: "resolved",
		updatedAt: new Date().toISOString(),
	};

	const annotations = [...file.annotations];
	annotations[index] = updated;

	const updatedFile: OpenTasksFile = {
		...file,
		annotations,
	};

	await saveOpenTasksFile(projectPath, updatedFile);
}

/**
 * Reopen a resolved annotation.
 */
export async function reopenAnnotation(
	projectPath: string,
	id: string,
): Promise<void> {
	const file = await loadOpenTasksFile(projectPath);
	const index = file.annotations.findIndex((a) => a.id === id);

	if (index === -1) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const existing = file.annotations[index];
	const updated: Annotation = {
		...existing,
		status: "open",
		updatedAt: new Date().toISOString(),
	};

	const annotations = [...file.annotations];
	annotations[index] = updated;

	const updatedFile: OpenTasksFile = {
		...file,
		annotations,
	};

	await saveOpenTasksFile(projectPath, updatedFile);
}

/**
 * Delete an annotation.
 */
export async function deleteAnnotation(
	projectPath: string,
	id: string,
): Promise<void> {
	const file = await loadOpenTasksFile(projectPath);
	const index = file.annotations.findIndex((a) => a.id === id);

	if (index === -1) {
		const error: AnnotationServiceError = { _tag: "NotFound", id };
		throw error;
	}

	const annotations = file.annotations.filter((a) => a.id !== id);

	const updatedFile: OpenTasksFile = {
		...file,
		annotations,
	};

	await saveOpenTasksFile(projectPath, updatedFile);
}

/**
 * Add a reply to an annotation thread.
 */
export async function addReply(
	projectPath: string,
	annotationId: string,
	request: AddReplyRequest,
	author?: string,
): Promise<AnnotationReply> {
	const file = await loadOpenTasksFile(projectPath);
	const index = file.annotations.findIndex((a) => a.id === annotationId);

	if (index === -1) {
		const error: AnnotationServiceError = {
			_tag: "NotFound",
			id: annotationId,
		};
		throw error;
	}

	const now = new Date().toISOString();
	const reply: AnnotationReply = {
		id: generateReplyId(),
		content: request.content,
		author: author ?? "user",
		createdAt: now,
	};

	const existing = file.annotations[index];
	const updated: Annotation = {
		...existing,
		replies: [...existing.replies, reply],
		updatedAt: now,
	};

	const annotations = [...file.annotations];
	annotations[index] = updated;

	const updatedFile: OpenTasksFile = {
		...file,
		annotations,
	};

	await saveOpenTasksFile(projectPath, updatedFile);
	return reply;
}

/**
 * Check if an anchor can be found in the given content.
 */
function isAnchorValid(anchor: Anchor, content: string): boolean {
	switch (anchor.type) {
		case "text-selection": {
			const textAnchor = anchor as TextSelectionAnchor;
			return content.includes(textAnchor.selectedText);
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
 * Detect and mark orphaned annotations for a specific artifact.
 * An annotation is orphaned when its anchor text can no longer be found in the content.
 */
export async function detectOrphanedAnnotations(
	projectPath: string,
	artifactPath: string,
	content: string,
): Promise<void> {
	const file = await loadOpenTasksFile(projectPath);
	let hasChanges = false;

	const updatedAnnotations = file.annotations.map((annotation) => {
		if (annotation.artifactPath !== artifactPath) {
			return annotation;
		}

		const isValid = isAnchorValid(annotation.anchor, content);
		const shouldBeOrphaned = !isValid;

		if (annotation.orphaned !== shouldBeOrphaned) {
			hasChanges = true;
			return {
				...annotation,
				orphaned: shouldBeOrphaned,
				updatedAt: new Date().toISOString(),
			};
		}

		return annotation;
	});

	if (hasChanges) {
		const updatedFile: OpenTasksFile = {
			...file,
			annotations: updatedAnnotations,
		};

		await saveOpenTasksFile(projectPath, updatedFile);
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
		case "FileSystemError":
			return `File system error: ${error.message}`;
		case "ValidationError":
			return `Validation error: ${error.message}`;
	}
}
