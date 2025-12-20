/**
 * Prerequisites checking module for Claude Code installation.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError } from "../../../shared/errors.js";
import type { ClaudeCodePrerequisiteResult } from "./models.js";

const execAsync = promisify(exec);

/**
 * Minimum Claude Code version required for plugin CLI support.
 */
export const MINIMUM_CLAUDE_VERSION = { major: 1, minor: 0, patch: 33 };

/**
 * Parsed version structure.
 */
export interface ParsedVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

/**
 * Check if Claude Code CLI is installed and accessible.
 * Returns the version string if installed.
 */
export const checkClaudeCodeInstalled = (): TE.TaskEither<
	CLIError,
	ClaudeCodePrerequisiteResult
> =>
	pipe(
		TE.tryCatch(
			async () => {
				const { stdout } = await execAsync("claude --version", {
					timeout: 10000,
				});
				return stdout.trim();
			},
			() =>
				prerequisiteError(
					"claude-installed",
					"Claude Code CLI not found in PATH",
					"Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started",
				),
		),
		TE.map((version) => ({
			check: "claude-installed",
			passed: true,
			message: `Claude Code found: ${version}`,
			value: version,
		})),
	);

/**
 * Parse Claude Code version from version string.
 * Handles various formats:
 * - "claude 1.0.33"
 * - "Claude Code CLI version 1.2.0"
 * - "1.0.33"
 */
export const parseClaudeCodeVersion = (
	versionStr: string,
): E.Either<CLIError, ParsedVersion> => {
	// Try to extract version pattern (X.Y.Z) from anywhere in the string
	const versionMatch = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);

	if (!versionMatch) {
		return E.left(
			prerequisiteError(
				"claude-version",
				`Could not parse Claude Code version from: ${versionStr}`,
				"Expected version format: X.Y.Z (e.g., 1.0.33)",
			),
		);
	}

	const major = parseInt(versionMatch[1], 10);
	const minor = parseInt(versionMatch[2], 10);
	const patch = parseInt(versionMatch[3], 10);

	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
		return E.left(
			prerequisiteError(
				"claude-version",
				`Invalid version numbers in: ${versionStr}`,
				"Expected version format: X.Y.Z (e.g., 1.0.33)",
			),
		);
	}

	return E.right({ major, minor, patch });
};

/**
 * Compare two versions.
 * Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 */
export const compareVersions = (a: ParsedVersion, b: ParsedVersion): number => {
	if (a.major !== b.major) {
		return a.major < b.major ? -1 : 1;
	}
	if (a.minor !== b.minor) {
		return a.minor < b.minor ? -1 : 1;
	}
	if (a.patch !== b.patch) {
		return a.patch < b.patch ? -1 : 1;
	}
	return 0;
};

/**
 * Format a version object as a string.
 */
export const formatVersion = (v: ParsedVersion): string =>
	`${v.major}.${v.minor}.${v.patch}`;

/**
 * Check if Claude Code version supports plugin CLI commands.
 * Requires version >= 1.0.33 based on documentation.
 */
export const checkPluginCommandSupport = (
	versionStr: string,
): E.Either<CLIError, ClaudeCodePrerequisiteResult> =>
	pipe(
		parseClaudeCodeVersion(versionStr),
		E.chain((parsed) => {
			const comparison = compareVersions(parsed, MINIMUM_CLAUDE_VERSION);

			if (comparison < 0) {
				return E.left(
					prerequisiteError(
						"claude-version",
						`Claude Code version ${formatVersion(parsed)} does not support plugin CLI commands`,
						`Update Claude Code to version ${formatVersion(MINIMUM_CLAUDE_VERSION)} or later: https://docs.anthropic.com/en/docs/claude-code/getting-started`,
					),
				);
			}

			return E.right({
				check: "claude-version",
				passed: true,
				message: `Claude Code version ${formatVersion(parsed)} supports plugin commands`,
				value: formatVersion(parsed),
			});
		}),
	);

/**
 * Run all prerequisite checks for Claude Code installation.
 * Returns all results (both passed and failed).
 */
export const runAllPrerequisiteChecks = (): TE.TaskEither<
	CLIError,
	readonly ClaudeCodePrerequisiteResult[]
> =>
	pipe(
		checkClaudeCodeInstalled(),
		TE.chain((installResult) =>
			pipe(
				checkPluginCommandSupport(installResult.value ?? ""),
				E.fold(
					(err) => TE.left(err),
					(versionResult) => TE.right([installResult, versionResult] as const),
				),
			),
		),
	);
