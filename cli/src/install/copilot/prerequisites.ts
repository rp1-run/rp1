/**
 * Prerequisite checks for Copilot CLI installation.
 * Validates GitHub CLI with Copilot extension, version, paths, and write permissions.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError } from "../../../shared/errors.js";
import type { PrerequisiteResult } from "../models.js";
import type { CopilotPaths } from "./models.js";

/**
 * Minimum supported GitHub CLI version (from supported-tools.yaml).
 */
const MIN_VERSION = "2.74.0";

/**
 * Check if GitHub CLI is installed and in PATH.
 * Uses Bun.which() for binary detection and Bun.spawn() for version retrieval.
 */
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

			const proc = Bun.spawn(["gh", "--version"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				return {
					check: "copilot-installed",
					passed: true,
					message: "GitHub CLI found (version unknown)",
					value: "unknown",
				};
			}

			const output = (await new Response(proc.stdout).text()).trim();
			const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
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

/**
 * Validate GitHub CLI version meets minimum requirement.
 * Parses version string and compares against MIN_VERSION.
 */
export const checkCopilotVersion = (
	versionStr: string,
): E.Either<CLIError, PrerequisiteResult> => {
	if (versionStr === "unknown") {
		return E.right({
			check: "copilot-version",
			passed: true,
			message: "GitHub CLI version unknown, assuming compatible",
			value: versionStr,
		});
	}

	const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return E.left(
			prerequisiteError(
				"copilot-version",
				`Could not parse GitHub CLI version: ${versionStr}`,
				"Expected format: X.Y.Z",
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
				"Expected format: X.Y.Z",
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

/**
 * Get resolved Copilot installation paths.
 * All paths use the user's home directory.
 */
export const getCopilotPaths = (): CopilotPaths => {
	const home = homedir();
	return {
		skillsDir: join(home, ".config", "github-copilot", "skills"),
		agentsDir: join(home, ".config", "github-copilot", "agents"),
		configDir: join(home, ".config", "github-copilot"),
		backupDir: join(home, ".config", "github-copilot-rp1-backups"),
	};
};

/**
 * Check write permissions to a target directory.
 * Creates the directory if it does not exist, writes a test file, then removes it.
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
