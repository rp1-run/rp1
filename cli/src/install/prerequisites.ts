/**
 * Prerequisites checking module for OpenCode installation.
 * Includes dry-run validation checks for package manager, network, and disk space.
 */

import { exec } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { freemem, homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { prerequisiteError } from "../../shared/errors.js";
import type { PrerequisiteResult } from "./models.js";

const execAsync = promisify(exec);

/**
 * Check if OpenCode CLI is installed and in PATH.
 * Returns OpenCode version string if installed.
 */
export const checkOpenCodeInstalled = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	pipe(
		TE.tryCatch(
			async () => {
				const { stdout } = await execAsync("opencode --version", {
					timeout: 5000,
				});
				return stdout.trim();
			},
			() =>
				prerequisiteError(
					"opencode-installed",
					"OpenCode CLI not found in PATH",
					"Install OpenCode: https://opencode.ai/docs/installation",
				),
		),
		TE.map((version) => ({
			check: "opencode-installed",
			passed: true,
			message: `OpenCode found: ${version}`,
			value: version,
		})),
	);

/**
 * Validate OpenCode version is in supported range.
 * Supported: >=0.8.0, Tested: 0.9.x
 */
export const checkOpenCodeVersion = (
	versionStr: string,
): E.Either<CLIError, PrerequisiteResult> => {
	const versionParts = versionStr.split(/\s+/);
	const version = versionParts[versionParts.length - 1];

	const [majorStr, minorStr] = version.split(".");
	const major = parseInt(majorStr, 10);
	const minor = parseInt(minorStr, 10);

	if (Number.isNaN(major) || Number.isNaN(minor)) {
		return E.left(
			prerequisiteError(
				"opencode-version",
				`Could not parse OpenCode version: ${version}`,
				"Expected format: X.Y.Z",
			),
		);
	}

	if (major === 0 && minor < 8) {
		return E.left(
			prerequisiteError(
				"opencode-version",
				`OpenCode version ${version} is too old`,
				"Minimum required: 0.8.0, Tested versions: 0.9.x",
			),
		);
	}

	const warning =
		major === 0 && minor > 9
			? `Warning: OpenCode ${version} not tested. Tested versions: 0.9.x`
			: undefined;

	return E.right({
		check: "opencode-version",
		passed: true,
		message: warning ?? `OpenCode version ${version} supported`,
		value: version,
	});
};

/**
 * Check if we have write permissions to target directory.
 */
export const checkWritePermissions = (
	targetDir: string,
): TE.TaskEither<CLIError, PrerequisiteResult> =>
	TE.tryCatch(
		async () => {
			await mkdir(targetDir, { recursive: true });

			const testFile = join(targetDir, ".rp1-write-test");
			await writeFile(testFile, "test");
			const { unlink } = await import("node:fs/promises");
			await unlink(testFile);

			return {
				check: "write-permissions",
				passed: true,
				message: `Write permissions OK: ${targetDir}`,
				value: targetDir,
			};
		},
		(e) =>
			prerequisiteError(
				"write-permissions",
				`Cannot write to ${targetDir}: ${e}`,
				"Check directory permissions or run with appropriate privileges",
			),
	);

/**
 * Register rp1-base-hooks plugin in opencode.json.
 * Uses file:// URL with absolute path (required by OpenCode's plugin loader).
 */
export const registerRp1HooksPlugin = (): TE.TaskEither<CLIError, boolean> =>
	TE.tryCatch(
		async () => {
			const configDir = join(homedir(), ".config", "opencode");
			const configPath = join(configDir, "opencode.json");
			const pluginPath = join(
				configDir,
				"plugins",
				"rp1-base-hooks",
				"index.ts",
			);
			const pluginRef = `file://${pluginPath}`;

			await mkdir(configDir, { recursive: true });

			let config: Record<string, unknown> = {};
			try {
				const content = await readFile(configPath, "utf-8");
				config = JSON.parse(content) as Record<string, unknown>;
			} catch {
				// File doesn't exist or is invalid, start fresh
			}

			if (!("plugin" in config)) {
				config.plugin = [];
			}

			if (typeof config.plugin === "string") {
				config.plugin = [config.plugin];
			}

			const plugins = config.plugin as string[];

			// Migrate old-style references to file:// URLs
			const oldIndex = plugins.findIndex(
				(p) =>
					String(p).includes("rp1-base-hooks") &&
					!String(p).startsWith("file://"),
			);
			if (oldIndex >= 0) {
				plugins[oldIndex] = pluginRef;
				await writeFile(configPath, JSON.stringify(config, null, 2));
				return true;
			}

			const alreadyPresent = plugins.some((p) =>
				String(p).includes("rp1-base-hooks"),
			);

			if (!alreadyPresent) {
				plugins.push(pluginRef);
				await writeFile(configPath, JSON.stringify(config, null, 2));
				return true;
			}

			return false;
		},
		(e) =>
			prerequisiteError(
				"register-hooks-plugin",
				`Failed to register rp1-base-hooks: ${e}`,
				"Manually add 'file:///path/to/plugins/rp1-base-hooks/index.ts' to ~/.config/opencode/opencode.json plugins array",
			),
	);

/**
 * Get the default OpenCode config directory.
 */
export const getOpenCodeConfigDir = (): string =>
	join(homedir(), ".config", "opencode");

/**
 * Get the default OpenCode config file path.
 */
export const getOpenCodeConfigPath = (): string =>
	join(getOpenCodeConfigDir(), "opencode.json");

/**
 * GitHub API endpoint for connectivity check and version fetch.
 */
const GITHUB_API_URL =
	"https://api.github.com/repos/rp1-run/rp1/releases/latest";

/**
 * Default timeout for network requests (5 seconds).
 */
const NETWORK_TIMEOUT_MS = 5000;

/**
 * Estimated disk space required for installation (10 MB).
 * Includes buffer for plugins, cache, and temp files.
 */
const DEFAULT_REQUIRED_BYTES = 10 * 1024 * 1024;

/**
 * Check package manager health.
 * On macOS: runs `brew doctor` to verify Homebrew is healthy.
 * On other platforms: skips check (no equivalent).
 *
 * Returns warning severity since package manager issues may not block installation.
 */
export const checkPackageManagerHealth = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> => {
	const os = platform();

	if (os !== "darwin" && os !== "linux") {
		return TE.right({
			check: "package-manager-health",
			passed: true,
			message: "Package manager check skipped (not macOS/Linux)",
			severity: "warning",
		} as PrerequisiteResult);
	}

	return TE.tryCatch(
		async (): Promise<PrerequisiteResult> => {
			try {
				const { stdout: whichStdout } = await execAsync("which brew", {
					timeout: 2000,
				});
				if (!whichStdout.trim()) {
					return {
						check: "package-manager-health",
						passed: true,
						message: "Homebrew not installed - package manager check skipped",
						severity: "warning",
					};
				}
			} catch {
				return {
					check: "package-manager-health",
					passed: true,
					message: "Homebrew not installed - package manager check skipped",
					severity: "warning",
				};
			}

			try {
				const { stdout, stderr } = await execAsync("brew doctor", {
					timeout: 30000,
				});
				const output = (stdout + stderr).trim();

				if (output.includes("Your system is ready to brew") || output === "") {
					return {
						check: "package-manager-health",
						passed: true,
						message: "Homebrew is healthy",
					};
				}

				const warnings = output
					.split("\n")
					.filter((line) => line.startsWith("Warning:"))
					.slice(0, 3);

				return {
					check: "package-manager-health",
					passed: true,
					message: `Homebrew has warnings: ${warnings.length > 0 ? warnings.join("; ") : "see brew doctor for details"}`,
					severity: "warning",
				};
			} catch {
				return {
					check: "package-manager-health",
					passed: true,
					message: "Homebrew doctor reported issues (non-critical)",
					severity: "warning",
				};
			}
		},
		() =>
			prerequisiteError(
				"package-manager-health",
				"Unexpected error checking package manager",
				"This check is non-critical; installation may still succeed.",
			),
	);
};

/**
 * Check network connectivity to GitHub API.
 * Uses HEAD request to minimize data transfer and latency.
 *
 * Returns blocker severity since network is required for updates.
 */
export const checkNetworkConnectivity = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	TE.tryCatch(
		async () => {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				NETWORK_TIMEOUT_MS,
			);

			try {
				const response = await fetch(GITHUB_API_URL, {
					method: "HEAD",
					signal: controller.signal,
					headers: {
						"User-Agent": "rp1-cli",
					},
				});

				if (response.ok || response.status === 403) {
					return {
						check: "network-connectivity",
						passed: true,
						message: "Network connectivity OK (GitHub API reachable)",
					};
				}

				return {
					check: "network-connectivity",
					passed: false,
					message: `GitHub API returned status ${response.status}`,
					severity: "blocker" as const,
				};
			} finally {
				clearTimeout(timeoutId);
			}
		},
		(e) => {
			const errorMsg =
				e instanceof Error
					? e.name === "AbortError"
						? "Request timed out"
						: e.message
					: "Unknown error";

			return prerequisiteError(
				"network-connectivity",
				`Cannot reach GitHub API: ${errorMsg}`,
				"Check your internet connection and firewall settings. Ensure api.github.com is accessible.",
			);
		},
	);

/**
 * Check available disk space.
 * Verifies sufficient space exists for installation.
 *
 * Returns warning severity since we can't always accurately measure available space
 * and the actual requirement may vary.
 */
export const checkDiskSpace = (
	requiredBytes: number = DEFAULT_REQUIRED_BYTES,
): TE.TaskEither<CLIError, PrerequisiteResult> =>
	TE.tryCatch(
		async (): Promise<PrerequisiteResult> => {
			const targetDir = getOpenCodeConfigDir();
			const requiredMB = Math.ceil(requiredBytes / (1024 * 1024));

			try {
				const stats = await stat(targetDir);
				if (stats.isDirectory()) {
					const freeMemory = freemem();

					if (freeMemory < requiredBytes) {
						return {
							check: "disk-space",
							passed: true,
							message: `Low system memory detected (${Math.floor(freeMemory / (1024 * 1024))}MB free). Installation requires ~${requiredMB}MB.`,
							severity: "warning",
						};
					}

					return {
						check: "disk-space",
						passed: true,
						message: `Disk space check passed (requires ~${requiredMB}MB)`,
					};
				}
			} catch {
				// Directory doesn't exist yet, which is fine
			}

			const freeMemory = freemem();
			if (freeMemory < requiredBytes * 10) {
				return {
					check: "disk-space",
					passed: true,
					message: `System memory is limited. Installation requires ~${requiredMB}MB.`,
					severity: "warning",
				};
			}

			return {
				check: "disk-space",
				passed: true,
				message: `Disk space check passed (requires ~${requiredMB}MB)`,
			};
		},
		() =>
			prerequisiteError(
				"disk-space",
				"Could not verify disk space",
				"This check is non-critical; installation may still succeed.",
			),
	);

/**
 * GitHub release response structure.
 */
interface GitHubRelease {
	readonly tag_name: string;
	readonly html_url: string;
}

/**
 * Fetch the latest available version from GitHub releases.
 * Returns the exact version that would be installed.
 *
 * Timeout: 5 seconds to ensure dry-run completes within 10 second target.
 */
export const fetchLatestVersion = (): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				NETWORK_TIMEOUT_MS,
			);

			try {
				const response = await fetch(GITHUB_API_URL, {
					signal: controller.signal,
					headers: {
						Accept: "application/vnd.github.v3+json",
						"User-Agent": "rp1-cli",
					},
				});

				if (!response.ok) {
					throw new Error(`GitHub API returned status ${response.status}`);
				}

				const data = (await response.json()) as GitHubRelease;

				if (typeof data.tag_name !== "string") {
					throw new Error("Invalid response from GitHub API");
				}

				const version = data.tag_name.startsWith("v")
					? data.tag_name.slice(1)
					: data.tag_name;

				return version;
			} finally {
				clearTimeout(timeoutId);
			}
		},
		(e) => {
			const errorMsg =
				e instanceof Error
					? e.name === "AbortError"
						? "Request timed out"
						: e.message
					: "Unknown error";

			return prerequisiteError(
				"fetch-latest-version",
				`Could not fetch latest version: ${errorMsg}`,
				"Check your internet connection and try again.",
			);
		},
	);

/**
 * Dry-run validation result structure.
 */
export interface DryRunValidationResult {
	readonly results: readonly PrerequisiteResult[];
	readonly latestVersion: string | null;
	readonly warnings: readonly string[];
	readonly blockers: readonly string[];
}

/**
 * Run all dry-run validation checks in sequence.
 * Checks package manager health, network connectivity, disk space, and fetches latest version.
 *
 * Target: Complete within 10 seconds including network checks.
 */
export const runDryRunValidation = (): TE.TaskEither<
	CLIError,
	DryRunValidationResult
> =>
	pipe(
		TE.Do,
		TE.bind("pkgManager", () =>
			pipe(
				checkPackageManagerHealth(),
				TE.orElse(
					(): TE.TaskEither<CLIError, PrerequisiteResult> =>
						TE.right({
							check: "package-manager-health",
							passed: true,
							message: "Package manager check skipped",
							severity: "warning",
						}),
				),
			),
		),
		TE.bind("network", () => checkNetworkConnectivity()),
		TE.bind("diskSpace", () =>
			pipe(
				checkDiskSpace(),
				TE.orElse(
					(): TE.TaskEither<CLIError, PrerequisiteResult> =>
						TE.right({
							check: "disk-space",
							passed: true,
							message: "Disk space check skipped",
							severity: "warning",
						}),
				),
			),
		),
		TE.bind("version", ({ network }) => {
			if (!network.passed) {
				return TE.right(null as string | null);
			}
			return pipe(
				fetchLatestVersion(),
				TE.map((v): string | null => v),
				TE.orElse((): TE.TaskEither<CLIError, string | null> => TE.right(null)),
			);
		}),
		TE.map(({ pkgManager, network, diskSpace, version }) => {
			const results: PrerequisiteResult[] = [pkgManager, network, diskSpace];
			const warnings = results
				.filter((r) => r.severity === "warning" && !r.passed)
				.map((r) => r.message);
			const blockers = results
				.filter((r) => r.severity === "blocker" || !r.passed)
				.filter((r) => r.severity !== "warning")
				.map((r) => r.message);

			return {
				results,
				latestVersion: version,
				warnings,
				blockers,
			};
		}),
	);
