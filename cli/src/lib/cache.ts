/**
 * Cache library for version check results.
 * Manages persistent cache in ~/.config/rp1/version-cache.json with TTL-based invalidation.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { runtimeError } from "../../shared/errors.js";

/**
 * Version cache data structure.
 */
export interface VersionCache {
	readonly latestVersion: string;
	readonly releaseUrl: string;
	readonly checkedAt: string;
	readonly ttlHours: number;
}

/**
 * Default cache TTL in hours.
 */
export const DEFAULT_TTL_HOURS = 24;

/**
 * Cache file name.
 */
export const CACHE_FILE_NAME = "version-cache.json";

/**
 * Configuration directory name.
 */
export const CONFIG_DIR_NAME = "rp1";

/**
 * Get the platform-appropriate configuration directory path.
 * Returns ~/.config/rp1/ on all platforms (XDG-compliant).
 */
export const getConfigDir = (): string => {
	const home = homedir();
	return join(home, ".config", CONFIG_DIR_NAME);
};

/**
 * Get the full path to the version cache file.
 * Returns ~/.config/rp1/version-cache.json
 */
export const getCachePath = (): string => {
	return join(getConfigDir(), CACHE_FILE_NAME);
};

/**
 * Ensure the configuration directory exists.
 * Creates ~/.config/rp1/ if it doesn't exist.
 */
export const ensureConfigDir = (): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const configDir = getConfigDir();
			if (!existsSync(configDir)) {
				await mkdir(configDir, { recursive: true });
			}
			return configDir;
		},
		(e) => runtimeError(`Failed to create config directory: ${e}`),
	);

/**
 * Read the version cache from disk.
 * Returns null if cache file doesn't exist or is corrupted.
 */
export const readCache = (): TE.TaskEither<CLIError, VersionCache | null> =>
	TE.tryCatch(
		async () => {
			const cachePath = getCachePath();

			if (!existsSync(cachePath)) {
				return null;
			}

			const content = await readFile(cachePath, "utf-8");
			const data = JSON.parse(content) as unknown;

			if (!isValidCacheData(data)) {
				return null;
			}

			return data;
		},
		(e) => {
			// Graceful degradation: treat parse errors as missing cache
			return runtimeError(`Failed to read cache: ${e}`);
		},
	);

/**
 * Read cache synchronously, returning null on any error.
 * Useful for non-critical cache reads where we want graceful degradation.
 */
export const readCacheSync = (): VersionCache | null => {
	try {
		const cachePath = getCachePath();

		if (!existsSync(cachePath)) {
			return null;
		}

		const fs = require("node:fs");
		const content = fs.readFileSync(cachePath, "utf-8");
		const data = JSON.parse(content) as unknown;

		if (!isValidCacheData(data)) {
			return null;
		}

		return data;
	} catch {
		return null;
	}
};

/**
 * Write cache data to disk.
 * Automatically adds checkedAt timestamp.
 */
export const writeCache = (
	data: Omit<VersionCache, "checkedAt">,
): TE.TaskEither<CLIError, void> =>
	pipe(
		ensureConfigDir(),
		TE.chain(() =>
			TE.tryCatch(
				async () => {
					const cachePath = getCachePath();
					const cacheData: VersionCache = {
						...data,
						checkedAt: new Date().toISOString(),
					};
					await writeFile(cachePath, JSON.stringify(cacheData, null, 2));
				},
				(e) => runtimeError(`Failed to write cache: ${e}`),
			),
		),
	);

/**
 * Check if the cache is still valid (not expired).
 */
export const isCacheValid = (cache: VersionCache): boolean => {
	const checkedAt = new Date(cache.checkedAt);
	const now = new Date();
	const ageMs = now.getTime() - checkedAt.getTime();
	const ageHours = ageMs / (1000 * 60 * 60);
	return ageHours < cache.ttlHours;
};

/**
 * Get the age of the cache in hours.
 */
export const getCacheAgeHours = (cache: VersionCache): number => {
	const checkedAt = new Date(cache.checkedAt);
	const now = new Date();
	const ageMs = now.getTime() - checkedAt.getTime();
	return ageMs / (1000 * 60 * 60);
};

/**
 * Get the remaining TTL of the cache in hours.
 * Returns 0 if cache is expired.
 */
export const getCacheExpiresInHours = (cache: VersionCache): number => {
	const ageHours = getCacheAgeHours(cache);
	const remaining = cache.ttlHours - ageHours;
	return Math.max(0, remaining);
};

/**
 * Invalidate (delete) the cache.
 * Called after successful self-update.
 */
export const invalidateCache = (): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			const cachePath = getCachePath();
			if (existsSync(cachePath)) {
				await unlink(cachePath);
			}
		},
		(e) => runtimeError(`Failed to invalidate cache: ${e}`),
	);

/**
 * Type guard to validate cache data structure.
 */
const isValidCacheData = (data: unknown): data is VersionCache => {
	if (typeof data !== "object" || data === null) {
		return false;
	}

	const obj = data as Record<string, unknown>;

	return (
		typeof obj.latestVersion === "string" &&
		typeof obj.releaseUrl === "string" &&
		typeof obj.checkedAt === "string" &&
		typeof obj.ttlHours === "number" &&
		!Number.isNaN(new Date(obj.checkedAt).getTime())
	);
};
