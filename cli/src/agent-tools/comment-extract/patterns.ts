/**
 * Comment pattern definitions for various programming languages.
 * Maps file extensions to single-line and multi-line comment patterns.
 */

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

/**
 * Check if a file extension is supported.
 */
export const isSupportedExtension = (ext: string): boolean => ext in PATTERNS;

/**
 * Get patterns for a file extension.
 * Returns undefined if not supported.
 */
export const getPatterns = (ext: string): CommentPatterns | undefined =>
	PATTERNS[ext];
