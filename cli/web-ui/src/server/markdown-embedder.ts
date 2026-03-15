/**
 * Markdown embedding service for annotations.
 * Derives markdown embedding from JSON source of truth (open-tasks.json).
 * Embeds annotations as HTML comments at anchor positions.
 */

import type { Database } from "bun:sqlite";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	Annotation,
	HiddenAnchor,
	LineAnchor,
	TextSelectionAnchor,
} from "../types/annotations";
import { getAnnotations } from "./annotation-service";

/**
 * Regex patterns for parsing embedded annotations.
 */
const ANNOTATION_START_PATTERN = /<!-- rp1:annotation:([A-Z0-9-]+) -->/g;

/**
 * Format an annotation as HTML comment markers.
 */
function formatAnnotationMarker(annotation: Annotation): {
	start: string;
	end: string;
} {
	return {
		start: `<!-- rp1:annotation:${annotation.id} -->`,
		end: `<!-- /rp1:annotation:${annotation.id} -->`,
	};
}

/**
 * Find the position to insert annotation marker based on anchor type.
 * Returns the start and end indices for wrapping text.
 */
function findAnchorPosition(
	content: string,
	annotation: Annotation,
): { start: number; end: number } | null {
	const anchor = annotation.anchor;

	switch (anchor.type) {
		case "text-selection": {
			const textAnchor = anchor as TextSelectionAnchor;
			const searchText = textAnchor.selectedText;
			const contextBefore = textAnchor.contextBefore;
			const contextAfter = textAnchor.contextAfter;

			// Try to find with context for more precise matching
			if (contextBefore && contextAfter) {
				const fullPattern = contextBefore + searchText + contextAfter;
				const fullIndex = content.indexOf(fullPattern);
				if (fullIndex !== -1) {
					const start = fullIndex + contextBefore.length;
					return { start, end: start + searchText.length };
				}
			}

			// Fallback to just the selected text
			const index = content.indexOf(searchText);
			if (index !== -1) {
				return { start: index, end: index + searchText.length };
			}
			return null;
		}

		case "hidden-anchor": {
			const hiddenAnchor = anchor as HiddenAnchor;
			// Find the anchor tag and position after it
			const anchorPattern = new RegExp(
				`<a\\s+id=["']${escapeRegex(hiddenAnchor.anchorId)}["'][^>]*>(?:</a>)?`,
				"i",
			);
			const match = content.match(anchorPattern);
			if (match && match.index !== undefined) {
				// Position after the anchor tag
				const end = match.index + match[0].length;
				return { start: end, end };
			}
			return null;
		}

		case "line": {
			const lineAnchor = anchor as LineAnchor;
			const lines = content.split("\n");
			const lineIndex = lineAnchor.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				return null;
			}

			// Calculate the start position of this line
			let start = 0;
			for (let i = 0; i < lineIndex; i++) {
				start += lines[i].length + 1; // +1 for newline
			}
			const end = start + lines[lineIndex].length;
			return { start, end };
		}

		default:
			return null;
	}
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove all annotation markers for a specific annotation ID from content.
 */
function removeAnnotationMarkers(
	content: string,
	annotationId: string,
): string {
	// Remove comment-style markers
	const startPattern = new RegExp(
		`<!-- rp1:annotation:${escapeRegex(annotationId)} -->`,
		"g",
	);
	const endPattern = new RegExp(
		`<!-- /rp1:annotation:${escapeRegex(annotationId)} -->`,
		"g",
	);

	return content.replace(startPattern, "").replace(endPattern, "");
}

/**
 * Parse embedded annotation IDs from markdown content.
 * Returns an array of annotation IDs found in the content.
 */
export function parseEmbeddedAnnotations(content: string): string[] {
	const ids = new Set<string>();

	// Find annotation markers
	let match: RegExpExecArray | null;

	// Reset regex state
	ANNOTATION_START_PATTERN.lastIndex = 0;
	while ((match = ANNOTATION_START_PATTERN.exec(content)) !== null) {
		ids.add(match[1]);
	}

	return Array.from(ids);
}

/**
 * Embed all annotations for an artifact into its markdown content.
 * Reads annotations from the service and inserts HTML comments at anchor positions.
 */
export async function embedAnnotations(
	db: Database,
	projectPath: string,
	artifactPath: string,
): Promise<void> {
	const fullPath = join(projectPath, artifactPath);

	// Read current file content
	let content: string;
	try {
		content = await readFile(fullPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			// File doesn't exist, nothing to embed
			return;
		}
		throw error;
	}

	// Get annotations for this artifact
	const annotations = getAnnotations(db);

	if (annotations.length === 0) {
		// Remove any stale markers if no annotations exist
		const existingIds = parseEmbeddedAnnotations(content);
		if (existingIds.length > 0) {
			let updatedContent = content;
			for (const id of existingIds) {
				updatedContent = removeAnnotationMarkers(updatedContent, id);
			}
			await writeFileAtomic(fullPath, updatedContent);
		}
		return;
	}

	// First, remove any existing markers to prevent duplicates
	let updatedContent = content;
	for (const annotation of annotations) {
		updatedContent = removeAnnotationMarkers(updatedContent, annotation.id);
	}

	// Build insertion map to handle multiple annotations
	// We need to process from end to start to maintain correct positions
	const insertions: Array<{
		annotation: Annotation;
		position: { start: number; end: number };
	}> = [];

	for (const annotation of annotations) {
		// Skip orphaned annotations - they can't be embedded
		if (annotation.orphaned) {
			continue;
		}

		const position = findAnchorPosition(updatedContent, annotation);
		if (position) {
			insertions.push({ annotation, position });
		}
	}

	// Sort by position descending so we can insert without affecting earlier positions
	insertions.sort((a, b) => b.position.start - a.position.start);

	// Insert markers
	for (const { annotation, position } of insertions) {
		// Insert comment markers wrapping the text
		const markers = formatAnnotationMarker(annotation);
		updatedContent =
			updatedContent.slice(0, position.start) +
			markers.start +
			updatedContent.slice(position.start, position.end) +
			markers.end +
			updatedContent.slice(position.end);
	}

	// Write updated content if changed
	if (updatedContent !== content) {
		await writeFileAtomic(fullPath, updatedContent);
	}
}

/**
 * Remove embedding markers for a specific annotation from an artifact.
 */
export async function removeEmbedding(
	projectPath: string,
	artifactPath: string,
	annotationId: string,
): Promise<void> {
	const fullPath = join(projectPath, artifactPath);

	// Read current file content
	let content: string;
	try {
		content = await readFile(fullPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			// File doesn't exist, nothing to remove
			return;
		}
		throw error;
	}

	// Remove markers for this annotation
	const updatedContent = removeAnnotationMarkers(content, annotationId);

	// Write if changed
	if (updatedContent !== content) {
		await writeFileAtomic(fullPath, updatedContent);
	}
}

/**
 * Write file atomically using temp file + rename pattern.
 */
async function writeFileAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	const tempPath = `${filePath}.tmp.${Date.now()}`;

	try {
		await writeFile(tempPath, content, { mode: 0o644 });
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
 * Synchronize all annotations for an artifact.
 * This is a convenience function that re-embeds all annotations.
 */
export async function syncAnnotations(
	db: Database,
	projectPath: string,
	artifactPath: string,
): Promise<void> {
	await embedAnnotations(db, projectPath, artifactPath);
}
