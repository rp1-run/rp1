/**
 * Version marker module for platform staleness detection.
 * Stores all platform version markers in a single centralized JSON file
 * at ~/.rp1/platform-versions.json, keyed by platform name.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { installError } from "../../shared/errors.js";

export interface VersionMarker {
	readonly version: string;
	readonly installedAt: string;
	readonly platform: string;
}

export interface PlatformVersions {
	readonly [platform: string]: VersionMarker;
}

const getVersionFilePath = (): string =>
	join(process.env.HOME ?? homedir(), ".rp1", "platform-versions.json");

/**
 * Write a version marker for a specific platform into the centralized file.
 * Reads the existing file (if any), updates the entry, and writes back atomically.
 */
export const writeVersionMarker = (
	platform: string,
	version: string,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			const filePath = getVersionFilePath();
			const existing = await readExistingMarkers(filePath);
			const updated: PlatformVersions = {
				...existing,
				[platform]: {
					version,
					installedAt: new Date().toISOString(),
					platform,
				},
			};

			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, JSON.stringify(updated, null, 2), {
				mode: 0o644,
			});
		},
		(e) =>
			installError(
				"version-marker",
				`Failed to write version marker for ${platform}: ${e}`,
			),
	);

/**
 * Read the version marker for a specific platform from the centralized file.
 * Returns null if the file is missing or the platform has no entry.
 */
export const readVersionMarker = (
	platform: string,
): TE.TaskEither<CLIError, VersionMarker | null> =>
	TE.tryCatch(
		async () => {
			const markers = await readExistingMarkers(getVersionFilePath());
			return markers[platform] ?? null;
		},
		(e) =>
			installError(
				"version-marker",
				`Failed to read version marker for ${platform}: ${e}`,
			),
	);

/**
 * Read all platform version markers from the centralized file.
 * Returns an empty object if the file does not exist.
 */
export const readAllVersionMarkers = (): TE.TaskEither<
	CLIError,
	PlatformVersions
> =>
	TE.tryCatch(
		async () => readExistingMarkers(getVersionFilePath()),
		(e) =>
			installError("version-marker", `Failed to read version markers: ${e}`),
	);

/**
 * Determine whether a platform's installed plugins are stale.
 * Returns true when the marker is null (missing) or the version does not match.
 */
export const isStale = (
	marker: VersionMarker | null,
	currentVersion: string,
): boolean => marker === null || marker.version !== currentVersion;

/**
 * Read existing markers from disk, returning an empty object if the file is absent.
 */
const readExistingMarkers = async (
	filePath: string,
): Promise<PlatformVersions> => {
	try {
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content) as PlatformVersions;
	} catch {
		return {};
	}
};
