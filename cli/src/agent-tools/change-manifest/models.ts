export const CHANGE_MANIFEST_VERSION = 1;

export const CHANGE_MANIFEST_SOURCES = [
	"build",
	"build-fast",
	"code-clean-comments",
] as const;

export type ChangeManifestSource = (typeof CHANGE_MANIFEST_SOURCES)[number];

export type ManifestStatusValue = "created" | "skipped";

export type ManifestSkipReason =
	| "baseline_code_root_mismatch"
	| "invalid_baseline"
	| "invalid_scope"
	| "missing_baseline"
	| "no_supported_source_hunks"
	| "pre_existing_dirty_paths_overlap"
	| "scope_outside_code_root"
	| "unsupported_scope";

export interface ChangeManifestHunk {
	readonly startLine: number;
	readonly endLine: number;
}

export interface ChangeManifestFile {
	readonly path: string;
	readonly ownedHunks: readonly ChangeManifestHunk[];
	readonly allowedOperations: readonly ["remove_comments"];
}

export interface ChangeManifest {
	readonly version: typeof CHANGE_MANIFEST_VERSION;
	readonly source: ChangeManifestSource;
	readonly codeRoot: string;
	readonly generatedAt: string;
	readonly files: readonly ChangeManifestFile[];
}

export interface BaselineSnapshot {
	readonly version: typeof CHANGE_MANIFEST_VERSION;
	readonly codeRoot: string;
	readonly head: string;
	readonly dirtyPaths: readonly string[];
	readonly generatedAt: string;
}

export interface ManifestStatus {
	readonly version: typeof CHANGE_MANIFEST_VERSION;
	readonly status: ManifestStatusValue;
	readonly source: ChangeManifestSource;
	readonly codeRoot: string;
	readonly generatedAt: string;
	readonly manifestPath: string | null;
	readonly files: number;
	readonly ownedLineCount: number;
	readonly skipReason: ManifestSkipReason | null;
	readonly dirtyPaths?: readonly string[];
	readonly overlappedDirtyPaths?: readonly string[];
}

export interface SnapshotOptions {
	readonly codeRoot: string;
	readonly out: string;
	readonly now?: () => Date;
}

export interface SnapshotResult {
	readonly snapshotPath: string;
	readonly codeRoot: string;
	readonly head: string;
	readonly dirtyPaths: readonly string[];
}

export interface GenerateChangeManifestOptions {
	readonly codeRoot: string;
	readonly out: string;
	readonly statusOut: string;
	readonly source: ChangeManifestSource;
	readonly baseline?: string;
	readonly scope?: string;
	readonly now?: () => Date;
}

export interface GenerateChangeManifestResult {
	readonly status: ManifestStatusValue;
	readonly manifestPath: string | null;
	readonly statusPath: string;
	readonly files: number;
	readonly ownedLineCount: number;
	readonly skipReason: ManifestSkipReason | null;
}
