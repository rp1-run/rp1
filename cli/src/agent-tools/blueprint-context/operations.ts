import { randomBytes } from "node:crypto";
import {
	lstat,
	mkdir,
	readFile,
	realpath,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	runtimeError,
	usageError,
} from "../../../shared/errors.js";
import {
	BLUEPRINT_CONTEXT_SUBDIR,
	BLUEPRINT_CONTEXT_VERSION,
	type BlueprintContextDeleteResult,
	type BlueprintContextReadResult,
	type BlueprintContextWriteInput,
	type BlueprintContextWriteResult,
	validateContextKey,
} from "./models.js";

const contextDirOf = (workRoot: string): string =>
	join(resolve(workRoot), ...BLUEPRINT_CONTEXT_SUBDIR);

// Lexical path used by read/delete. Writes recompute this against the realpath
// of the context directory so a symlinked work root cannot redirect the write.
const contextFileOf = (workRoot: string, key: string): string =>
	join(contextDirOf(workRoot), `${key}.json`);

const isEnoent = (error: unknown): boolean =>
	(error as NodeJS.ErrnoException).code === "ENOENT";

/** Filesystem dependencies for the atomic write, injectable for failure-path testing. */
export interface BlueprintContextWriteDeps {
	readonly rename: typeof rename;
	readonly writeFile: typeof writeFile;
}

const DEFAULT_WRITE_DEPS: BlueprintContextWriteDeps = { rename, writeFile };

/**
 * Persist a context payload atomically (review M3). The content arrives as an
 * opaque string (carried over stdin by callers, never through the shell), is
 * wrapped in a versioned JSON envelope so a reader can detect truncation, and
 * is written to a random owner-only temporary file that is atomically renamed
 * into place. Callers therefore never observe a partial or interpreted payload.
 */
export const writeBlueprintContext = (
	input: BlueprintContextWriteInput,
	deps: BlueprintContextWriteDeps = DEFAULT_WRITE_DEPS,
): TE.TaskEither<CLIError, BlueprintContextWriteResult> => {
	const keyCheck = validateContextKey(input.key);
	if (!keyCheck.valid) {
		return TE.left(usageError(`context key ${keyCheck.message}`));
	}
	if (typeof input.content !== "string") {
		return TE.left(usageError("content must be a string"));
	}
	if (!input.workRoot || input.workRoot.trim() === "") {
		return TE.left(usageError("work-root is required and must be non-empty"));
	}

	const contextDir = contextDirOf(input.workRoot);

	return TE.tryCatch(
		async () => {
			await mkdir(contextDir, { recursive: true });

			// Bind the write to the physical context directory so a symlinked
			// work root or context dir cannot redirect it outside the boundary.
			const canonicalDir = await realpath(contextDir);
			const dest = join(canonicalDir, `${input.key}.json`);

			// Never write through a symlink planted at the destination leaf.
			const destStat = await lstat(dest).catch(() => null);
			if (destStat?.isSymbolicLink()) {
				throw new Error(
					`Context file '${dest}' is a symlink; refusing to write across the store boundary`,
				);
			}

			const payload = JSON.stringify(
				{
					version: BLUEPRINT_CONTEXT_VERSION,
					key: input.key,
					content: input.content,
				},
				null,
				2,
			);

			const tmp = join(
				canonicalDir,
				`.${input.key}.${randomBytes(8).toString("hex")}.tmp`,
			);

			try {
				// `wx` = O_CREAT | O_EXCL | O_WRONLY: fails if the temp path already
				// exists (including as a symlink). mode 0600 keeps the sidecar
				// owner-only. The rename is atomic, so no reader ever sees a partial
				// file even if the process is interrupted mid-write.
				await deps.writeFile(tmp, payload, {
					encoding: "utf-8",
					flag: "wx",
					mode: 0o600,
				});
				await deps.rename(tmp, dest);
			} catch (error) {
				await unlink(tmp).catch(() => {});
				throw error;
			}

			return {
				key: input.key,
				path: dest,
				bytes: Buffer.byteLength(payload, "utf-8"),
			};
		},
		(error): CLIError =>
			runtimeError(
				`Failed to write blueprint context: ${error instanceof Error ? error.message : String(error)}`,
				error,
			),
	);
};

/**
 * Read a context payload. A missing sidecar is reported as `found: false`
 * (never an error) so the coordinator treats "no saved context" gracefully. A
 * present-but-unparseable or version/key-mismatched file is reported as
 * `valid: false` so a truncated or foreign payload is never treated as
 * authoritative resume context (review M3).
 */
export const readBlueprintContext = (
	workRoot: string,
	key: string,
): TE.TaskEither<CLIError, BlueprintContextReadResult> => {
	const keyCheck = validateContextKey(key);
	if (!keyCheck.valid) {
		return TE.left(usageError(`context key ${keyCheck.message}`));
	}
	if (!workRoot || workRoot.trim() === "") {
		return TE.left(usageError("work-root is required and must be non-empty"));
	}

	const path = contextFileOf(workRoot, key);

	return TE.tryCatch(
		async () => {
			const leafStat = await lstat(path).catch(() => null);
			if (leafStat?.isSymbolicLink()) {
				return {
					found: true,
					valid: false,
					error:
						"Context file is a symlink; refusing to read across the store boundary",
					path,
				};
			}

			let raw: string;
			try {
				raw = await readFile(path, "utf-8");
			} catch (error) {
				if (isEnoent(error)) {
					return { found: false, path };
				}
				throw error;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return {
					found: true,
					valid: false,
					error: "Context file contains invalid JSON (possibly truncated)",
					path,
				};
			}

			if (
				typeof parsed !== "object" ||
				parsed === null ||
				Array.isArray(parsed)
			) {
				return {
					found: true,
					valid: false,
					error: "Context file must be a JSON object",
					path,
				};
			}

			const obj = parsed as Record<string, unknown>;

			if (obj.version !== BLUEPRINT_CONTEXT_VERSION) {
				return {
					found: true,
					valid: false,
					error: `Unsupported context version: ${String(obj.version)} (expected ${BLUEPRINT_CONTEXT_VERSION})`,
					path,
				};
			}

			if (obj.key !== key) {
				return {
					found: true,
					valid: false,
					error: `Context key mismatch: file records '${String(obj.key)}' but '${key}' was requested`,
					path,
				};
			}

			if (typeof obj.content !== "string") {
				return {
					found: true,
					valid: false,
					error: "Context 'content' field is missing or not a string",
					path,
				};
			}

			return {
				found: true,
				valid: true,
				key,
				content: obj.content,
				path,
			};
		},
		(error): CLIError =>
			runtimeError(
				`Failed to read blueprint context: ${error instanceof Error ? error.message : String(error)}`,
				error,
			),
	);
};

/**
 * Delete a context payload idempotently. `unlink` removes the link itself (not
 * a symlink target), so this never mutates anything outside the store.
 */
export const deleteBlueprintContext = (
	workRoot: string,
	key: string,
): TE.TaskEither<CLIError, BlueprintContextDeleteResult> => {
	const keyCheck = validateContextKey(key);
	if (!keyCheck.valid) {
		return TE.left(usageError(`context key ${keyCheck.message}`));
	}
	if (!workRoot || workRoot.trim() === "") {
		return TE.left(usageError("work-root is required and must be non-empty"));
	}

	const path = contextFileOf(workRoot, key);

	return TE.tryCatch(
		async () => {
			try {
				await unlink(path);
				return { deleted: true, path };
			} catch (error) {
				if (isEnoent(error)) {
					return { deleted: false, path };
				}
				throw error;
			}
		},
		(error): CLIError =>
			runtimeError(
				`Failed to delete blueprint context: ${error instanceof Error ? error.message : String(error)}`,
				error,
			),
	);
};
