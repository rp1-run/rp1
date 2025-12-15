/**
 * Prerequisites checking module for OpenCode installation.
 */

import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
 * Check if opencode-skills plugin is configured in opencode.json.
 * This is non-blocking because skills are optional.
 */
export const checkOpenCodeSkillsPlugin = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	pipe(
		TE.tryCatch(
			async () => {
				const configPath = join(
					homedir(),
					".config",
					"opencode",
					"opencode.json",
				);
				const content = await readFile(configPath, "utf-8");
				const config = JSON.parse(content) as Record<string, unknown>;

				if ("plugin" in config) {
					const plugins = config.plugin;
					if (Array.isArray(plugins)) {
						const hasPlugin = plugins.some((p) =>
							String(p).includes("opencode-skills"),
						);
						return hasPlugin;
					}
					if (typeof plugins === "string") {
						return plugins.includes("opencode-skills");
					}
				}
				return false;
			},
			() => false as unknown as CLIError,
		),
		TE.fold(
			() =>
				TE.right<CLIError, PrerequisiteResult>({
					check: "opencode-skills",
					passed: true,
					message: "opencode-skills plugin not configured (optional)",
					value: "false",
				}),
			(hasPlugin) =>
				TE.right<CLIError, PrerequisiteResult>({
					check: "opencode-skills",
					passed: true,
					message: hasPlugin
						? "opencode-skills plugin detected"
						: "opencode-skills plugin not configured (optional)",
					value: String(hasPlugin),
				}),
		),
	);

/**
 * Install opencode-skills plugin by adding it to opencode.json.
 * OpenCode will automatically install the plugin on next startup.
 */
export const installOpenCodeSkillsPlugin = (): TE.TaskEither<
	CLIError,
	boolean
> =>
	TE.tryCatch(
		async () => {
			const configDir = join(homedir(), ".config", "opencode");
			const configPath = join(configDir, "opencode.json");

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
			const alreadyPresent = plugins.some((p) =>
				String(p).includes("opencode-skills"),
			);

			if (!alreadyPresent) {
				plugins.push("opencode-skills");
				await writeFile(configPath, JSON.stringify(config, null, 2));
				return true;
			}

			return false;
		},
		(e) =>
			prerequisiteError(
				"install-skills-plugin",
				`Failed to configure opencode-skills: ${e}`,
				"Manually add 'opencode-skills' to ~/.config/opencode/opencode.json plugins array",
			),
	);

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
 * Get the default OpenCode config directory.
 */
export const getOpenCodeConfigDir = (): string =>
	join(homedir(), ".config", "opencode");

/**
 * Get the default OpenCode config file path.
 */
export const getOpenCodeConfigPath = (): string =>
	join(getOpenCodeConfigDir(), "opencode.json");
