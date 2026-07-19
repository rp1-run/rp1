export const BLUEPRINT_CONTEXT_VERSION = 1;

/** Path of the context store relative to the work root. */
export const BLUEPRINT_CONTEXT_SUBDIR = ["blueprint", "context"] as const;

/** Upper bound on a context key; matches npm's package-name length cap. */
export const CONTEXT_KEY_MAX_LENGTH = 214;

// A context key (the effective PRD name) becomes a single path segment under
// the context directory, so it must be a safe slug: letters, numbers, hyphen,
// and underscore only, starting with a letter or number. This rejects path
// separators, traversal (`..`), whitespace, globs, quotes, and shell
// metacharacters before the value is ever joined onto a filesystem path
// (review M2, M3). One shared definition so the blueprint skill and the helper
// agree on the accepted domain.
const CONTEXT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface ContextKeyValidation {
	readonly valid: boolean;
	readonly message?: string;
}

export const validateContextKey = (key: unknown): ContextKeyValidation => {
	if (typeof key !== "string" || key.trim() === "") {
		return { valid: false, message: "must be a non-empty string" };
	}
	if (key.length > CONTEXT_KEY_MAX_LENGTH) {
		return {
			valid: false,
			message: `must be at most ${CONTEXT_KEY_MAX_LENGTH} characters`,
		};
	}
	if (!CONTEXT_KEY_PATTERN.test(key)) {
		return {
			valid: false,
			message:
				"must contain only letters, numbers, hyphens, and underscores, starting with a letter or number",
		};
	}
	return { valid: true };
};

export interface BlueprintContextWriteInput {
	readonly key: string;
	readonly content: string;
	readonly workRoot: string;
}

export interface BlueprintContextWriteResult {
	readonly key: string;
	readonly path: string;
	readonly bytes: number;
}

export interface BlueprintContextReadNotFound {
	readonly found: false;
	readonly path: string;
}

export interface BlueprintContextReadValid {
	readonly found: true;
	readonly valid: true;
	readonly key: string;
	readonly content: string;
	readonly path: string;
}

export interface BlueprintContextReadInvalid {
	readonly found: true;
	readonly valid: false;
	readonly error: string;
	readonly path: string;
}

export type BlueprintContextReadResult =
	| BlueprintContextReadNotFound
	| BlueprintContextReadValid
	| BlueprintContextReadInvalid;

export interface BlueprintContextDeleteResult {
	readonly deleted: boolean;
	readonly path: string;
}
