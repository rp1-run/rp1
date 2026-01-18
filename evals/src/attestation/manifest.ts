/**
 * Attestation manifest I/O operations.
 * Provides functions to load, save, and update the attestation.json manifest
 * that tracks content hashes for prompt files.
 */

import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type {
	AttestationManifest,
	CommandAttestation,
	HashResult,
} from "./types.js";

const MANIFEST_PATH = "evals/attestation.json";
const SCHEMA_VERSION = "1.0.0";

/**
 * Create empty manifest.
 */
export function emptyManifest(): AttestationManifest {
	return {
		schema_version: SCHEMA_VERSION,
		commands: {},
		files: {},
	};
}

/**
 * Load attestation manifest from disk.
 * Returns empty manifest if file doesn't exist.
 */
export function loadManifest(): TE.TaskEither<Error, AttestationManifest> {
	return pipe(
		TE.tryCatch(
			async () => {
				const file = Bun.file(MANIFEST_PATH);
				if (!(await file.exists())) {
					return emptyManifest();
				}
				const content = await file.json();
				return content as AttestationManifest;
			},
			(error) => new Error(`Failed to load manifest: ${error}`),
		),
	);
}

/**
 * Save attestation manifest to disk.
 */
export function saveManifest(
	manifest: AttestationManifest,
): TE.TaskEither<Error, void> {
	return pipe(
		TE.tryCatch(
			async () => {
				const content = JSON.stringify(manifest, null, 2) + "\n";
				await Bun.write(MANIFEST_PATH, content);
			},
			(error) => new Error(`Failed to save manifest: ${error}`),
		),
	);
}

/**
 * Update manifest with new attestation for a command.
 */
export function updateManifest(
	manifest: AttestationManifest,
	commandKey: string,
	attestation: CommandAttestation,
	fileHashes: readonly HashResult[],
): AttestationManifest {
	// Update files map
	const updatedFiles = { ...manifest.files };
	for (const fh of fileHashes) {
		updatedFiles[fh.path] = fh.hash;
	}

	return {
		...manifest,
		commands: {
			...manifest.commands,
			[commandKey]: attestation,
		},
		files: updatedFiles,
	};
}
