/**
 * Attestation manifest I/O operations.
 * Provides functions to load, save, and update the attestation.json manifest
 * that tracks content hashes for prompt files.
 */

import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type {
	AttestationManifest,
	HashResult,
	SkillAttestation,
} from "./types.js";

const MANIFEST_PATH = "evals/attestation.json";
const SCHEMA_VERSION = "2.0.0";

/**
 * Create empty manifest.
 */
export function emptyManifest(): AttestationManifest {
	return {
		schema_version: SCHEMA_VERSION,
		skills: {},
		files: {},
	};
}

/**
 * Migrate a v1 manifest to v2 format.
 * V1 skill keys have no platform suffix (e.g., "rp1-dev:build-fast").
 * V2 skill keys include platform (e.g., "rp1-dev:build-fast@claude-code").
 * Existing v1 entries are treated as claude-code platform.
 */
function migrateV1ToV2(manifest: AttestationManifest): AttestationManifest {
	const migratedSkills: Record<string, SkillAttestation> = {};

	for (const [key, attestation] of Object.entries(manifest.skills)) {
		if (key.includes("@")) {
			migratedSkills[key] = attestation;
		} else {
			const migratedKey = `${key}@claude-code`;
			migratedSkills[migratedKey] = {
				...attestation,
				platform: attestation.platform ?? "claude-code",
			};
		}
	}

	return {
		schema_version: SCHEMA_VERSION,
		skills: migratedSkills,
		files: manifest.files,
	};
}

/**
 * Load attestation manifest from disk.
 * Returns empty manifest if file doesn't exist.
 * Auto-migrates v1 manifests to v2 format.
 */
export function loadManifest(): TE.TaskEither<Error, AttestationManifest> {
	return pipe(
		TE.tryCatch(
			async () => {
				const file = Bun.file(MANIFEST_PATH);
				if (!(await file.exists())) {
					return emptyManifest();
				}
				const content = (await file.json()) as AttestationManifest;

				if (
					content.schema_version === "1.0.0" ||
					!content.schema_version?.startsWith("2.")
				) {
					return migrateV1ToV2(content);
				}

				return content;
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
				const content = `${JSON.stringify(manifest, null, 2)}\n`;
				await Bun.write(MANIFEST_PATH, content);
			},
			(error) => new Error(`Failed to save manifest: ${error}`),
		),
	);
}

/**
 * Update manifest with new attestation for a skill.
 */
export function updateManifest(
	manifest: AttestationManifest,
	skillKey: string,
	attestation: SkillAttestation,
	fileHashes: readonly HashResult[],
): AttestationManifest {
	const updatedFiles = { ...manifest.files };
	for (const fh of fileHashes) {
		updatedFiles[fh.path] = fh.hash;
	}

	return {
		...manifest,
		skills: {
			...manifest.skills,
			[skillKey]: attestation,
		},
		files: updatedFiles,
	};
}

export { migrateV1ToV2 };
