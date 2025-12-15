/**
 * Version library for checking and comparing rp1 versions.
 * Provides functions to get installed version, fetch latest version from GitHub,
 * and compare semantic versions.
 */

// Static import ensures version is bundled at compile time
import pkg from "../../package.json";
import {
	DEFAULT_TTL_HOURS,
	isCacheValid,
	readCacheSync,
	writeCache,
} from "./cache.js";

/**
 * Result of a version check operation.
 */
export interface VersionCheckResult {
	readonly currentVersion: string;
	readonly latestVersion: string | null;
	readonly updateAvailable: boolean;
	readonly releaseUrl: string | null;
	readonly error: string | null;
	readonly cached: boolean;
	readonly cacheAgeHours: number | null;
	readonly cacheExpiresInHours: number | null;
}

/**
 * Options for version check operations.
 */
export interface CheckOptions {
	readonly force?: boolean;
	readonly ttlHours?: number;
	readonly timeoutMs?: number;
}

/**
 * Parsed semantic version components.
 */
interface ParsedVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly prerelease: string | null;
}

/**
 * Get the currently installed version of rp1.
 * Uses statically imported package.json version (bundled at compile time).
 *
 * @returns The installed version string (e.g., "0.2.3") or "unknown" if unavailable.
 */
export const getInstalledVersion = (): string => {
	if (typeof pkg.version === "string") {
		return stripVersionPrefix(pkg.version);
	}
	return "unknown";
};

/**
 * Strip the "v" prefix from a version string if present.
 *
 * @param version - Version string that may have "v" prefix (e.g., "v0.2.3")
 * @returns Version without prefix (e.g., "0.2.3")
 */
export const stripVersionPrefix = (version: string): string => {
	return version.startsWith("v") ? version.slice(1) : version;
};

/**
 * Compare two semantic versions.
 *
 * @param current - Current version string (e.g., "0.2.3")
 * @param latest - Latest version string (e.g., "0.3.0")
 * @returns Negative if current < latest (update available),
 *          Zero if equal,
 *          Positive if current > latest (dev/unreleased build)
 */
export const compareVersions = (current: string, latest: string): number => {
	const currentParsed = parseVersion(current);
	const latestParsed = parseVersion(latest);

	// Compare major.minor.patch
	const majorDiff = currentParsed.major - latestParsed.major;
	if (majorDiff !== 0) return majorDiff;

	const minorDiff = currentParsed.minor - latestParsed.minor;
	if (minorDiff !== 0) return minorDiff;

	const patchDiff = currentParsed.patch - latestParsed.patch;
	if (patchDiff !== 0) return patchDiff;

	// Handle pre-release versions:
	// - Release (no prerelease) > Pre-release
	// - Compare pre-release strings lexicographically if both have them
	return comparePrereleases(currentParsed.prerelease, latestParsed.prerelease);
};

/**
 * Parse a semantic version string into components.
 *
 * @param version - Version string (e.g., "0.2.3", "0.3.0-beta.1")
 * @returns Parsed version components
 */
const parseVersion = (version: string): ParsedVersion => {
	// Strip "v" prefix if present
	const cleanVersion = stripVersionPrefix(version);

	// Split into main version and prerelease
	const [mainPart, ...prereleaseParts] = cleanVersion.split("-");
	const prerelease =
		prereleaseParts.length > 0 ? prereleaseParts.join("-") : null;

	// Parse major.minor.patch
	const parts = mainPart.split(".");
	const major = parseInt(parts[0] || "0", 10);
	const minor = parseInt(parts[1] || "0", 10);
	const patch = parseInt(parts[2] || "0", 10);

	return {
		major: Number.isNaN(major) ? 0 : major,
		minor: Number.isNaN(minor) ? 0 : minor,
		patch: Number.isNaN(patch) ? 0 : patch,
		prerelease,
	};
};

/**
 * Compare prerelease identifiers.
 * A release version (no prerelease) is considered greater than any prerelease.
 *
 * @param current - Current prerelease identifier or null
 * @param latest - Latest prerelease identifier or null
 * @returns Comparison result
 */
const comparePrereleases = (
	current: string | null,
	latest: string | null,
): number => {
	// Both are releases (no prerelease) - equal
	if (current === null && latest === null) {
		return 0;
	}

	// Current is release, latest is prerelease - current is newer
	if (current === null && latest !== null) {
		return 1;
	}

	// Current is prerelease, latest is release - latest is newer
	if (current !== null && latest === null) {
		return -1;
	}

	// Both have prereleases - compare lexicographically
	// This handles cases like: alpha < beta < rc
	// And: beta.1 < beta.2
	// biome-ignore lint/style/noNonNullAssertion: values validated above via early returns
	return comparePrereleaseStrings(current!, latest!);
};

/**
 * Compare two prerelease strings using semver-compliant comparison.
 * Splits by dots and compares each segment.
 *
 * @param a - First prerelease string
 * @param b - Second prerelease string
 * @returns Comparison result
 */
const comparePrereleaseStrings = (a: string, b: string): number => {
	const aParts = a.split(".");
	const bParts = b.split(".");

	const maxLen = Math.max(aParts.length, bParts.length);

	for (let i = 0; i < maxLen; i++) {
		const aPart = aParts[i];
		const bPart = bParts[i];

		// Missing part means end of prerelease - shorter comes first
		if (aPart === undefined && bPart !== undefined) return -1;
		if (aPart !== undefined && bPart === undefined) return 1;
		if (aPart === undefined && bPart === undefined) return 0;

		// Try numeric comparison first
		const aNum = parseInt(aPart, 10);
		const bNum = parseInt(bPart, 10);

		const aIsNum = !Number.isNaN(aNum) && String(aNum) === aPart;
		const bIsNum = !Number.isNaN(bNum) && String(bNum) === bPart;

		if (aIsNum && bIsNum) {
			// Both numeric - compare as numbers
			if (aNum !== bNum) return aNum - bNum;
		} else if (aIsNum && !bIsNum) {
			// Numeric identifiers always have lower precedence than non-numeric
			return -1;
		} else if (!aIsNum && bIsNum) {
			return 1;
		} else {
			// Both non-numeric - compare as strings
			const cmp = aPart.localeCompare(bPart);
			if (cmp !== 0) return cmp;
		}
	}

	return 0;
};

/**
 * GitHub API endpoint for latest release.
 */
const GITHUB_RELEASES_URL =
	"https://api.github.com/repos/rp1-run/rp1/releases/latest";

/**
 * Default timeout for network requests in milliseconds.
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * GitHub release response structure (partial - only fields we use).
 */
interface GitHubRelease {
	readonly tag_name: string;
	readonly html_url: string;
	readonly draft: boolean;
	readonly prerelease: boolean;
}

/**
 * Result from getLatestVersion including cache metadata.
 */
export interface LatestVersionResult {
	readonly version: string;
	readonly releaseUrl: string;
	readonly cached: boolean;
	readonly cacheAgeHours: number | null;
	readonly cacheExpiresInHours: number | null;
}

/**
 * Get the latest version of rp1 from GitHub releases with cache support.
 *
 * Cache behavior:
 * - Results are cached in ~/.config/rp1/version-cache.json
 * - Default TTL is 24 hours
 * - Use options.force to bypass cache
 *
 * @param options - Optional check options (force, ttlHours, timeoutMs)
 * @returns Latest version result with cache metadata, or null on any error
 */
export const getLatestVersion = async (
	options?: CheckOptions,
): Promise<LatestVersionResult | null> => {
	const ttlHours = options?.ttlHours ?? DEFAULT_TTL_HOURS;
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const force = options?.force ?? false;

	try {
		// Check cache first (unless force is set)
		if (!force) {
			const cached = readCacheSync();
			if (cached && isCacheValid(cached)) {
				const checkedAt = new Date(cached.checkedAt);
				const now = new Date();
				const ageMs = now.getTime() - checkedAt.getTime();
				const ageHours = ageMs / (1000 * 60 * 60);
				const expiresInHours = Math.max(0, cached.ttlHours - ageHours);

				return {
					version: cached.latestVersion,
					releaseUrl: cached.releaseUrl,
					cached: true,
					cacheAgeHours: ageHours,
					cacheExpiresInHours: expiresInHours,
				};
			}
		}

		// Fetch from GitHub API with timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		let response: Response;
		try {
			response = await fetch(GITHUB_RELEASES_URL, {
				signal: controller.signal,
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "rp1-cli",
				},
			});
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as GitHubRelease;

		// Exclude draft and pre-release versions
		if (data.draft || data.prerelease) {
			return null;
		}

		// Validate response has required fields
		if (
			typeof data.tag_name !== "string" ||
			typeof data.html_url !== "string"
		) {
			return null;
		}

		const version = stripVersionPrefix(data.tag_name);
		const releaseUrl = data.html_url;

		// Update cache (await but ignore errors - cache is non-critical)
		try {
			await writeCache({
				latestVersion: version,
				releaseUrl: releaseUrl,
				ttlHours: ttlHours,
			})();
		} catch {
			// Ignore cache write errors - non-critical
		}

		return {
			version,
			releaseUrl,
			cached: false,
			cacheAgeHours: null,
			cacheExpiresInHours: null,
		};
	} catch {
		// Graceful degradation: return null on any error
		return null;
	}
};

/**
 * Check for updates by combining getInstalledVersion, getLatestVersion, and compareVersions.
 * This is the main entry point for version checking functionality.
 *
 * @param options - Optional check options (force, ttlHours, timeoutMs)
 * @returns Complete version check result including current/latest versions, update availability, and cache metadata
 */
export const checkForUpdate = async (
	options?: CheckOptions,
): Promise<VersionCheckResult> => {
	// Get currently installed version
	const currentVersion = getInstalledVersion();

	// Handle case where installed version is unknown
	if (currentVersion === "unknown") {
		return {
			currentVersion,
			latestVersion: null,
			updateAvailable: false,
			releaseUrl: null,
			error: "Could not determine installed version",
			cached: false,
			cacheAgeHours: null,
			cacheExpiresInHours: null,
		};
	}

	// Fetch latest version from GitHub (with cache support)
	const latestResult = await getLatestVersion(options);

	// Handle case where latest version fetch failed
	if (latestResult === null) {
		return {
			currentVersion,
			latestVersion: null,
			updateAvailable: false,
			releaseUrl: null,
			error: "Could not fetch latest version from GitHub",
			cached: false,
			cacheAgeHours: null,
			cacheExpiresInHours: null,
		};
	}

	// Compare versions to determine if update is available
	const comparison = compareVersions(currentVersion, latestResult.version);
	const updateAvailable = comparison < 0;

	return {
		currentVersion,
		latestVersion: latestResult.version,
		updateAvailable,
		releaseUrl: latestResult.releaseUrl,
		error: null,
		cached: latestResult.cached,
		cacheAgeHours: latestResult.cacheAgeHours,
		cacheExpiresInHours: latestResult.cacheExpiresInHours,
	};
};
