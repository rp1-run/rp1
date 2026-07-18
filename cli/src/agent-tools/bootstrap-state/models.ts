export const BOOTSTRAP_STATE_VERSION = 1;
export const BOOTSTRAP_STATE_FILENAME = "bootstrap-state.json";

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
