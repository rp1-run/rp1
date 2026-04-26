import type { ToolError, ToolResult } from "../models.js";

export const WORK_SEARCH_DEFAULT_LIMIT = 10;
export const WORK_SEARCH_MAX_LIMIT = 50;

export type WorkSearchStorageRoot = "work_dir";

export type WorkSearchErrorCode =
	| "invalid_query"
	| "invalid_limit"
	| "unresolved_project"
	| "unavailable_index"
	| "schema_migration_failed"
	| "refresh_failed"
	| "search_failed";

export interface WorkSearchToolError extends ToolError {
	readonly code: WorkSearchErrorCode;
}

export interface WorkSearchCommandInput {
	readonly query?: string | null;
	readonly project?: string;
	readonly limit?: string | number | null;
	readonly refresh?: boolean;
	readonly refreshOnly?: boolean;
	readonly refresh_only?: boolean;
}

export interface WorkSearchResolvedInput {
	readonly query: string | null;
	readonly project?: string;
	readonly limit: number;
	readonly refresh: boolean;
	readonly refreshOnly: boolean;
}

export interface WorkSearchProjectScope {
	readonly projectId: string;
	readonly projectRoot: string;
	readonly workRoot: string;
}

export interface WorkSearchRefreshSummary {
	readonly scannedDocuments: number;
	readonly indexedDocuments: number;
	readonly skippedDocuments: number;
	readonly deletedDocuments: number;
	readonly failedDocuments: number;
	readonly indexedAt: string;
}

export interface WorkSearchHitMetadata {
	readonly docId?: string;
	readonly runId?: string;
	readonly workflow?: string;
	readonly feature?: string;
	readonly step?: string;
	readonly title?: string;
}

export interface WorkSearchHitChunk {
	readonly heading?: string;
	readonly startLine: number;
	readonly endLine: number;
}

export interface WorkSearchHit {
	readonly rank: number;
	readonly score: number;
	readonly snippet: string;
	readonly path: string;
	readonly displayPath: string;
	readonly storageRoot: WorkSearchStorageRoot;
	readonly projectId: string;
	readonly metadata: WorkSearchHitMetadata;
	readonly chunk: WorkSearchHitChunk;
}

export interface WorkSearchResult {
	readonly query: string | null;
	readonly project: WorkSearchProjectScope;
	readonly refresh: WorkSearchRefreshSummary | null;
	readonly results: readonly WorkSearchHit[];
}

export type WorkSearchToolResult = ToolResult<WorkSearchResult | null>;
