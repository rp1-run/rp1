/**
 * Type-safe data models for comment-extract agent tool.
 * Provides structures for comment extraction from git-changed files.
 */

/**
 * Single extracted comment with context.
 */
export interface ExtractedComment {
	readonly file: string;
	readonly line: number;
	readonly type: "single" | "multi";
	readonly content: string;
	readonly contextBefore: string;
	readonly contextAfter: string;
}

/**
 * Result of comment extraction operation.
 */
export interface CommentExtractResult {
	readonly scope: string;
	readonly base: string;
	readonly filesScanned: number;
	readonly linesAdded: number;
	readonly lineScoped?: boolean;
	readonly changeManifest?: string;
	readonly comments: readonly ExtractedComment[];
}

/**
 * Options for comment extraction.
 */
export interface CommentExtractOptions {
	readonly scope: string;
	readonly base: string;
	readonly lineScoped?: boolean;
	readonly changeManifest?: string;
	readonly codeRoot?: string;
}

export interface ChangeManifestFile {
	readonly path: string;
	readonly ownedLines?: readonly number[];
	readonly ownedHunks?: readonly ChangeManifestHunk[];
	readonly allowedOperations?: readonly string[];
}

export interface ChangeManifestHunk {
	readonly startLine: number;
	readonly endLine: number;
}

export interface ChangeManifest {
	readonly version: 1;
	readonly source?: string;
	readonly codeRoot?: string;
	readonly files: readonly ChangeManifestFile[];
}
