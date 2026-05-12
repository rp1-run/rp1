/**
 * Prerequisite checks for Copilot CLI installation.
 * Validates GitHub Copilot CLI, plugin lifecycle support, and marketplace write permissions.
 */

import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError } from "../../../shared/errors.js";
import type { PrerequisiteResult } from "../models.js";
import { MARKETPLACE_NAME } from "./marketplace.js";
import type { CopilotPaths } from "./models.js";

const MIN_VERSION = "0.0.0";
const COPILOT_INSTALL_URL =
	"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli";
const VERSION_REQUIREMENT_SUGGESTION =
	"Run `copilot version` and update GitHub Copilot CLI if needed: " +
	COPILOT_INSTALL_URL;
const COPILOT_INSTALL_SUGGESTION =
	"Install or update GitHub Copilot CLI, then verify with `copilot version` and `copilot plugin --help`: " +
	COPILOT_INSTALL_URL;
const COPILOT_PLUGIN_SUPPORT_SUGGESTION =
	"Install or update GitHub Copilot CLI, then verify with `copilot version` and `copilot plugin --help`. " +
	"If plugin commands remain unavailable, check your Copilot subscription and organization policy.";

export interface CommandResult {
	readonly exitCode: number;
	readonly output: string;
}

const findCopilotBinary = (): string | null => {
	for (const pathDir of (process.env.PATH ?? "").split(delimiter)) {
		if (!pathDir) {
			continue;
		}
		const candidate = join(pathDir, "copilot");
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	const bunPath = Bun.which("copilot");
	if (bunPath) {
		return bunPath;
	}

	return null;
};

export const runCopilotCommand = async (
	args: readonly string[],
): Promise<CommandResult> => {
	const copilotBinary = findCopilotBinary() ?? "copilot";
	const proc = Bun.spawn([copilotBinary, ...args], {
		env: process.env,
		stdout: "pipe",
		stderr: "pipe",
	});

	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	return {
		exitCode,
		output: `${stdout}${stderr}`.trim(),
	};
};

export const checkCopilotInstalled = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	TE.tryCatch(
		async () => {
			const binaryPath = findCopilotBinary();
			if (!binaryPath) {
				throw prerequisiteError(
					"copilot-installed",
					"GitHub Copilot CLI (copilot) not found in PATH",
					COPILOT_INSTALL_SUGGESTION,
				);
			}

			const result = await runCopilotCommand(["version"]);
			if (result.exitCode !== 0) {
				return {
					check: "copilot-installed",
					passed: true,
					message: "GitHub Copilot CLI found (version unknown)",
					value: "unknown",
				};
			}

			const versionMatch = result.output.match(/(\d+\.\d+\.\d+)/);
			const version = versionMatch ? versionMatch[1] : "unknown";

			return {
				check: "copilot-installed",
				passed: true,
				message: `GitHub Copilot CLI found: ${version}`,
				value: version,
			};
		},
		(e) => {
			if (
				typeof e === "object" &&
				e !== null &&
				"_tag" in e &&
				(e as CLIError)._tag === "PrerequisiteError"
			) {
				return e as CLIError;
			}
			return prerequisiteError(
				"copilot-installed",
				"GitHub Copilot CLI (copilot) not found in PATH",
				COPILOT_INSTALL_SUGGESTION,
			);
		},
	);

export const checkCopilotVersion = (
	versionStr: string,
): E.Either<CLIError, PrerequisiteResult> => {
	if (versionStr === "unknown") {
		return E.left(
			prerequisiteError(
				"copilot-version",
				"Could not determine GitHub Copilot CLI version",
				VERSION_REQUIREMENT_SUGGESTION,
			),
		);
	}

	const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return E.left(
			prerequisiteError(
				"copilot-version",
				`Could not parse GitHub Copilot CLI version: ${versionStr}`,
				VERSION_REQUIREMENT_SUGGESTION,
			),
		);
	}

	const major = parseInt(match[1], 10);
	const minor = parseInt(match[2], 10);
	const patch = parseInt(match[3], 10);

	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
		return E.left(
			prerequisiteError(
				"copilot-version",
				`Could not parse GitHub Copilot CLI version: ${versionStr}`,
				VERSION_REQUIREMENT_SUGGESTION,
			),
		);
	}

	const minMatch = MIN_VERSION.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!minMatch) {
		return E.right({
			check: "copilot-version",
			passed: true,
			message: `GitHub Copilot CLI version ${versionStr}`,
			value: versionStr,
		});
	}

	const minMajor = parseInt(minMatch[1], 10);
	const minMinor = parseInt(minMatch[2], 10);
	const minPatch = parseInt(minMatch[3], 10);

	const meetsMin =
		major > minMajor ||
		(major === minMajor && minor > minMinor) ||
		(major === minMajor && minor === minMinor && patch >= minPatch);

	if (!meetsMin) {
		return E.left(
			prerequisiteError(
				"copilot-version",
				`GitHub Copilot CLI version ${major}.${minor}.${patch} is below minimum required`,
				`Minimum required: ${MIN_VERSION}. ${VERSION_REQUIREMENT_SUGGESTION}`,
			),
		);
	}

	return E.right({
		check: "copilot-version",
		passed: true,
		message: `GitHub Copilot CLI version ${major}.${minor}.${patch} supported`,
		value: `${major}.${minor}.${patch}`,
	});
};

export const checkCopilotPluginSupport = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	TE.tryCatch(
		async () => {
			const result = await runCopilotCommand(["plugin", "--help"]);
			if (result.exitCode !== 0) {
				throw prerequisiteError(
					"copilot-plugin-support",
					"GitHub Copilot plugin lifecycle commands are unavailable",
					COPILOT_PLUGIN_SUPPORT_SUGGESTION,
				);
			}

			return {
				check: "copilot-plugin-support",
				passed: true,
				message: "GitHub Copilot plugin lifecycle commands available",
				value: "supported",
			};
		},
		(e) => {
			if (
				typeof e === "object" &&
				e !== null &&
				"_tag" in e &&
				(e as CLIError)._tag === "PrerequisiteError"
			) {
				return e as CLIError;
			}
			return prerequisiteError(
				"copilot-plugin-support",
				`Failed to verify GitHub Copilot plugin lifecycle commands: ${e}`,
				COPILOT_PLUGIN_SUPPORT_SUGGESTION,
			);
		},
	);

export const getCopilotPaths = (): CopilotPaths => {
	const home = homedir();
	const marketplaceDir = join(home, ".rp1", "copilot", "marketplace");
	const legacyConfigDir = join(home, ".config", "github-copilot");
	const legacySkillsDir = join(legacyConfigDir, "skills");
	const legacyAgentsDir = join(legacyConfigDir, "agents");
	const nativeInstalledPluginsDir = join(home, ".copilot", "installed-plugins");

	return {
		marketplaceDir,
		marketplacePluginsDir: join(marketplaceDir, "plugins"),
		marketplaceMetadataPath: join(marketplaceDir, "marketplace.json"),
		nativeInstalledPluginsDir,
		nativeMarketplaceDir: join(nativeInstalledPluginsDir, MARKETPLACE_NAME),
		legacyConfigDir,
		legacySkillsDir,
		legacyAgentsDir,
		configDir: legacyConfigDir,
		skillsDir: legacySkillsDir,
		agentsDir: legacyAgentsDir,
	};
};

export const checkWritePermissions = (
	targetDir: string,
): TE.TaskEither<CLIError, PrerequisiteResult> =>
	TE.tryCatch(
		async () => {
			await mkdir(targetDir, { recursive: true });

			const testFile = join(targetDir, ".rp1-write-test");
			await writeFile(testFile, "test");
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
