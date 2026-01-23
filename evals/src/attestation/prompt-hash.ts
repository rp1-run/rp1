/**
 * Hash computation for prompt files.
 * Provides SHA-256 content hashing with YAML frontmatter stripping.
 */

import { createHash } from "node:crypto";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { HashResult } from "./types.js";

/**
 * Regex to match YAML frontmatter (--- at start of file, content, ---)
 */
const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Strip YAML frontmatter from markdown content.
 *
 * @param content - The raw markdown content
 * @returns The content with frontmatter removed
 */
export function stripFrontmatter(content: string): string {
	return content.replace(FRONTMATTER_REGEX, "");
}

/**
 * Compute SHA-256 hash of prompt file, excluding YAML frontmatter.
 *
 * @param filePath - Path to the prompt file
 * @returns TaskEither with HashResult containing sha256-prefixed hash
 */
export function computePromptHash(
	filePath: string,
): TE.TaskEither<Error, HashResult> {
	return pipe(
		TE.tryCatch(
			async () => {
				const file = Bun.file(filePath);
				const content = await file.text();
				const body = stripFrontmatter(content);
				const hash = createHash("sha256").update(body).digest("hex");
				return {
					path: filePath,
					hash: `sha256:${hash}`,
					content_length: body.length,
				};
			},
			(error: unknown) => new Error(`Failed to hash ${filePath}: ${error}`),
		),
	);
}

/**
 * Compute combined hash from multiple file hashes.
 * Sorts paths lexicographically for determinism.
 *
 * @param fileHashes - Array of HashResult objects
 * @returns Combined sha256-prefixed hash string
 */
export function computeDepsHash(fileHashes: readonly HashResult[]): string {
	const sorted = [...fileHashes].sort((a, b) => a.path.localeCompare(b.path));
	const combined = sorted.map((h) => h.hash).join("|");
	const hash = createHash("sha256").update(combined).digest("hex");
	return `sha256:${hash}`;
}
