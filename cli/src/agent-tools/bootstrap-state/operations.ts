import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	notFoundError,
	runtimeError,
	usageError,
} from "../../../shared/errors.js";
import {
	BOOTSTRAP_STATE_FILENAME,
	BOOTSTRAP_STATE_VERSION,
	type BootstrapDeleteResult,
	type BootstrapReadResult,
	type BootstrapState,
	type BootstrapWriteInput,
} from "./models.js";

const RP1_DIR = ".rp1";

const markerPath = (canonicalTargetDir: string): string =>
	join(canonicalTargetDir, RP1_DIR, BOOTSTRAP_STATE_FILENAME);

const tempMarkerPath = (canonicalTargetDir: string): string =>
	join(canonicalTargetDir, RP1_DIR, `.${BOOTSTRAP_STATE_FILENAME}.tmp`);

const validateRawState = (
	raw: string,
	expectedTargetDir: string,
): BootstrapReadResult => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			valid: false,
			error: {
				type: "malformed",
				message: "Bootstrap state file contains invalid JSON",
			},
		};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return {
			valid: false,
			error: {
				type: "malformed",
				message: "Bootstrap state must be a JSON object",
			},
		};
	}

	const obj = parsed as Record<string, unknown>;

	if (typeof obj.version !== "number") {
		return {
			valid: false,
			error: {
				type: "malformed",
				message: "Missing or invalid 'version' field (expected number)",
			},
		};
	}

	if (typeof obj.projectName !== "string" || obj.projectName.trim() === "") {
		return {
			valid: false,
			error: {
				type: "malformed",
				message:
					"Missing or invalid 'projectName' field (expected non-empty string)",
			},
		};
	}

	if (typeof obj.targetDir !== "string" || obj.targetDir.trim() === "") {
		return {
			valid: false,
			error: {
				type: "malformed",
				message:
					"Missing or invalid 'targetDir' field (expected non-empty string)",
			},
		};
	}

	if (typeof obj.createdAt !== "string") {
		return {
			valid: false,
			error: {
				type: "malformed",
				message: "Missing or invalid 'createdAt' field (expected string)",
			},
		};
	}

	if (obj.version !== BOOTSTRAP_STATE_VERSION) {
		return {
			valid: false,
			error: {
				type: "stale",
				message: `Unsupported bootstrap state version: ${obj.version} (expected ${BOOTSTRAP_STATE_VERSION})`,
			},
		};
	}

	const recordedTargetDir = resolve(obj.targetDir as string);
	if (recordedTargetDir !== expectedTargetDir) {
		return {
			valid: false,
			error: {
				type: "conflicting",
				message: `Recorded target directory '${recordedTargetDir}' does not match marker location '${expectedTargetDir}'`,
			},
		};
	}

	return {
		valid: true,
		state: {
			version: obj.version as number,
			projectName: obj.projectName as string,
			targetDir: obj.targetDir as string,
			createdAt: obj.createdAt as string,
		},
	};
};

/** Filesystem dependencies for the atomic write, injectable for failure-path testing. */
export interface WriteBootstrapStateDeps {
	readonly rename: typeof rename;
	readonly writeFile: typeof writeFile;
}

const DEFAULT_WRITE_DEPS: WriteBootstrapStateDeps = { rename, writeFile };

export const writeBootstrapState = (
	input: BootstrapWriteInput,
	deps: WriteBootstrapStateDeps = DEFAULT_WRITE_DEPS,
): TE.TaskEither<CLIError, BootstrapState> => {
	if (!input.projectName || input.projectName.trim() === "") {
		return TE.left(
			usageError("project-name is required and must be non-empty"),
		);
	}
	if (!input.targetDir || input.targetDir.trim() === "") {
		return TE.left(usageError("target-dir is required and must be non-empty"));
	}

	const canonicalTargetDir = resolve(input.targetDir);
	const rp1Dir = join(canonicalTargetDir, RP1_DIR);
	const dest = markerPath(canonicalTargetDir);
	const tmp = tempMarkerPath(canonicalTargetDir);

	const state: BootstrapState = {
		version: BOOTSTRAP_STATE_VERSION,
		projectName: input.projectName,
		targetDir: canonicalTargetDir,
		createdAt: new Date().toISOString(),
	};

	return TE.tryCatch(
		async () => {
			await mkdir(rp1Dir, { recursive: true });
			const json = JSON.stringify(state, null, 2);
			await deps.writeFile(tmp, json, "utf-8");
			await deps.rename(tmp, dest);
			return state;
		},
		(error): CLIError => {
			unlink(tmp).catch(() => {});
			return runtimeError(
				`Failed to write bootstrap state: ${error instanceof Error ? error.message : String(error)}`,
				error,
			);
		},
	);
};

export const readBootstrapState = (
	targetDir: string,
): TE.TaskEither<CLIError, BootstrapReadResult> => {
	if (!targetDir || targetDir.trim() === "") {
		return TE.left(usageError("target-dir is required and must be non-empty"));
	}

	const canonicalTargetDir = resolve(targetDir);
	const path = markerPath(canonicalTargetDir);

	return pipe(
		TE.tryCatch(
			() => readFile(path, "utf-8"),
			(error): CLIError => {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return notFoundError(
						`Bootstrap state marker at ${path}`,
						"No bootstrap-state marker exists at this location.",
					);
				}
				return runtimeError(
					`Failed to read bootstrap state: ${error instanceof Error ? error.message : String(error)}`,
					error,
				);
			},
		),
		TE.map((raw) => validateRawState(raw, canonicalTargetDir)),
	);
};

export const deleteBootstrapState = (
	targetDir: string,
): TE.TaskEither<CLIError, BootstrapDeleteResult> => {
	if (!targetDir || targetDir.trim() === "") {
		return TE.left(usageError("target-dir is required and must be non-empty"));
	}

	const canonicalTargetDir = resolve(targetDir);
	const path = markerPath(canonicalTargetDir);

	return TE.tryCatch(
		async () => {
			try {
				await unlink(path);
				return { deleted: true, path };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return { deleted: false, path };
				}
				throw error;
			}
		},
		(error): CLIError =>
			runtimeError(
				`Failed to delete bootstrap state: ${error instanceof Error ? error.message : String(error)}`,
				error,
			),
	);
};
