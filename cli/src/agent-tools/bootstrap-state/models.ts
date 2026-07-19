export const BOOTSTRAP_STATE_VERSION = 1;
export const BOOTSTRAP_STATE_FILENAME = "bootstrap-state.json";

/** Upper bound on a project name; matches npm's package-name length cap. */
export const PROJECT_NAME_MAX_LENGTH = 214;

// Bootstrap's documented project-name domain: lowercase letters, numbers, and
// hyphens, starting with a letter or number (e.g. `my-awesome-app`). One shared
// definition so the CLI writer, reader, and argument resolution agree on the
// accepted domain (review L1) — a name the writer accepts must round-trip
// through the reader, and neither side may carry control or shell-significant
// characters into a prompt.
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface ProjectNameValidation {
	readonly valid: boolean;
	readonly message?: string;
}

export const validateProjectName = (name: unknown): ProjectNameValidation => {
	if (typeof name !== "string" || name.trim() === "") {
		return { valid: false, message: "must be a non-empty string" };
	}
	if (name.length > PROJECT_NAME_MAX_LENGTH) {
		return {
			valid: false,
			message: `must be at most ${PROJECT_NAME_MAX_LENGTH} characters`,
		};
	}
	if (!PROJECT_NAME_PATTERN.test(name)) {
		return {
			valid: false,
			message:
				"must contain only lowercase letters, numbers, and hyphens, starting with a letter or number",
		};
	}
	return { valid: true };
};

export type BootstrapStateErrorType = "malformed" | "stale" | "conflicting";

export interface BootstrapState {
	readonly version: number;
	readonly projectName: string;
	readonly targetDir: string;
	readonly createdAt: string;
}

export interface BootstrapWriteInput {
	readonly projectName: string;
	readonly targetDir: string;
}

export interface BootstrapReadError {
	readonly type: BootstrapStateErrorType;
	readonly message: string;
}

export interface BootstrapReadResultValid {
	readonly valid: true;
	readonly state: BootstrapState;
}

export interface BootstrapReadResultInvalid {
	readonly valid: false;
	readonly error: BootstrapReadError;
}

export type BootstrapReadResult =
	| BootstrapReadResultValid
	| BootstrapReadResultInvalid;

export interface BootstrapDeleteResult {
	readonly deleted: boolean;
	readonly path: string;
}
