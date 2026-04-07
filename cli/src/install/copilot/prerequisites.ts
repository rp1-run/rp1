/**
 * Prerequisite checks for Copilot CLI installation.
 * Validates GitHub CLI, Copilot plugin lifecycle support, and marketplace write permissions.
 */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError } from "../../../shared/errors.js";
import type { PrerequisiteResult } from "../models.js";
import { MARKETPLACE_NAME } from "./marketplace.js";
import type { CopilotPaths } from "./models.js";

const MIN_VERSION = "2.74.0";
const VERSION_REQUIREMENT_SUGGESTION =
	`GitHub Copilot native install requires gh >= ${MIN_VERSION}. ` +
	"Run `gh --version` and update GitHub CLI if needed: https://cli.github.com/";

export interface CommandResult {
	readonly exitCode: number;
	readonly output: string;
}

export const runGhCommand = async (
	args: readonly string[],
): Promise<CommandResult> => {
	const proc = Bun.spawn(["gh", ...args], {
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
			const binaryPath = Bun.which("gh");
			if (!binaryPath) {
				throw prerequisiteError(
					"copilot-installed",
					"GitHub CLI (gh) not found in PATH",
					"Install GitHub CLI: https://cli.github.com/ then enable Copilot: gh extension install github/gh-copilot",
				);
			}

			const result = await runGhCommand(["--version"]);
			if (result.exitCode !== 0) {
				return {
					check: "copilot-installed",
					passed: true,
					message: "GitHub CLI found (version unknown)",
					value: "unknown",
				};
			}

			const versionMatch = result.output.match(/(\d+\.\d+\.\d+)/);
			const version = versionMatch ? versionMatch[1] : "unknown";

			return {
				check: "copilot-installed",
				passed: true,
				message: `GitHub CLI found: ${version}`,
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
				"GitHub CLI (gh) not found in PATH",
				"Install GitHub CLI: https://cli.github.com/ then enable Copilot: gh extension install github/gh-copilot",
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
				"Could not determine GitHub CLI version",
				VERSION_REQUIREMENT_SUGGESTION,
			),
		);
	}

	const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return E.left(
			prerequisiteError(
				"copilot-version",
				`Could not parse GitHub CLI version: ${versionStr}`,
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
				`Could not parse GitHub CLI version: ${versionStr}`,
				VERSION_REQUIREMENT_SUGGESTION,
			),
		);
	}

	const minMatch = MIN_VERSION.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!minMatch) {
		return E.right({
			check: "copilot-version",
			passed: true,
			message: `GitHub CLI version ${versionStr}`,
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
				`GitHub CLI version ${major}.${minor}.${patch} is below minimum required`,
				`Minimum required: ${MIN_VERSION}. Update GitHub CLI: https://cli.github.com/`,
			),
		);
	}

	return E.right({
		check: "copilot-version",
		passed: true,
		message: `GitHub CLI version ${major}.${minor}.${patch} supported`,
		value: `${major}.${minor}.${patch}`,
	});
};

export const checkCopilotPluginSupport = (): TE.TaskEither<
	CLIError,
	PrerequisiteResult
> =>
	TE.tryCatch(
		async () => {
			const result = await runGhCommand(["copilot", "--", "plugin", "--help"]);
			if (result.exitCode !== 0) {
				throw prerequisiteError(
					"copilot-plugin-support",
					"GitHub Copilot plugin lifecycle commands are unavailable",
					"Update GitHub CLI to >= 2.74.0 and ensure Copilot CLI support is enabled: gh extension install github/gh-copilot",
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
				"Run `gh copilot -- plugin --help` and update GitHub CLI if the command is unavailable",
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
