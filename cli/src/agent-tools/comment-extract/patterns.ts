import path from "node:path";

/**
 * Comment pattern configuration for a file type.
 */
export interface CommentPatterns {
	/** Single-line comment regex patterns */
	readonly single: readonly RegExp[];
	/** Multi-line comment start/end regex pairs */
	readonly multi: readonly [RegExp, RegExp][];
}

/**
 * Comment patterns by file extension.
 * Mirrors the Python patterns for consistency.
 */
export const PATTERNS: Readonly<Record<string, CommentPatterns>> = {
	// Hash-style comments (exclude shebang for .py, .sh)
	".py": { single: [/#(?!!)/], multi: [] },
	".sh": { single: [/#(?!!)/], multi: [] },
	".rb": { single: [/#/], multi: [] },
	".yml": { single: [/#/], multi: [] },
	".yaml": { single: [/#/], multi: [] },

	// C-style comments
	".js": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".ts": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".tsx": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".jsx": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".go": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".rs": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".java": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".kt": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".swift": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".c": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".cpp": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".h": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".hpp": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },

	// HTML-style comments
	".html": { single: [], multi: [[/<!--/, /-->/]] },
	".xml": { single: [], multi: [[/<!--/, /-->/]] },

	// Mixed: C-style + HTML
	".vue": {
		single: [/\/\//],
		multi: [
			[/\/\*/, /\*\//],
			[/<!--/, /-->/],
		],
	},
	".svelte": {
		single: [/\/\//],
		multi: [
			[/\/\*/, /\*\//],
			[/<!--/, /-->/],
		],
	},

	// CSS-style
	".css": { single: [], multi: [[/\/\*/, /\*\//]] },
	".scss": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },
	".less": { single: [/\/\//], multi: [[/\/\*/, /\*\//]] },

	// PHP (multiple single-line styles)
	".php": { single: [/\/\//, /#/], multi: [[/\/\*/, /\*\//]] },
};

export const SUPPORTED_SOURCE_EXTENSIONS: readonly string[] =
	Object.keys(PATTERNS);

export const EXCLUDED_SOURCE_DIRECTORIES: readonly string[] = [
	".git",
	".next",
	".rp1",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"vendor",
];

export const PROTECTED_GENERATED_SOURCE_PATHS: readonly string[] = [
	"catalog/agents.yaml",
	"cli/src/init/templates/generated.ts",
];

const normalizeRelativePath = (filePath: string): string =>
	filePath.replace(/\\/g, "/").split(path.sep).join("/").replace(/^\.\//, "");

/**
 * Check if a file extension is supported.
 */
export const isSupportedExtension = (ext: string): boolean => ext in PATTERNS;

export const isProtectedGeneratedPath = (filePath: string): boolean =>
	PROTECTED_GENERATED_SOURCE_PATHS.includes(normalizeRelativePath(filePath));

export const isExcludedSourcePath = (filePath: string): boolean => {
	const segments = normalizeRelativePath(filePath).split("/");
	return segments.some((segment) =>
		EXCLUDED_SOURCE_DIRECTORIES.includes(segment),
	);
};

export const isSupportedSourcePath = (filePath: string): boolean =>
	isSupportedExtension(path.extname(filePath).toLowerCase()) &&
	!isExcludedSourcePath(filePath) &&
	!isProtectedGeneratedPath(filePath);

/**
 * Get patterns for a file extension.
 * Returns undefined if not supported.
 */
export const getPatterns = (ext: string): CommentPatterns | undefined =>
	PATTERNS[ext];
