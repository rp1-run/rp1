/**
 * Tool detection module for the rp1 init command.
 * Detects which agentic tools (Claude Code, OpenCode, etc.) are installed
 * and validates their versions against minimum requirements.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../config/supported-tools.js";
import {
	getEnabledTools,
	getToolSupportLevel,
} from "../config/supported-tools.js";

/**
 * A detected tool with its version information.
 */
export interface DetectedTool {
	/** The tool definition from the registry */
	readonly tool: SupportedTool;
	/** The raw version string returned by the tool */
	readonly version: string;
	/** Whether the detected version meets the minimum requirement */
	readonly meetsMinVersion: boolean;
}

/**
 * Result of tool detection across all registered tools.
 */
export interface ToolDetectionResult {
	/** Tools that were found and their version information */
	readonly detected: readonly DetectedTool[];
	/** Tools that were not found in PATH */
	readonly missing: readonly SupportedTool[];
}

/**
 * Parsed semantic version as a tuple [major, minor, patch].
 */
type ParsedVersion = [number, number, number];

interface ToolCommandResult {
	readonly exitCode: number;
	readonly output: string;
}

/**
 * Parse a version string into a semantic version tuple.
 * Extracts the first X.Y.Z pattern found in the string.
 *
 * Handles various formats:
 * - "1.0.33"
 * - "claude 1.0.33"
 * - "OpenCode version 0.8.0"
 *
 * @param versionStr - Raw version string from tool
 * @returns Parsed version tuple or null if parsing fails
 */
const parseVersion = (versionStr: string): ParsedVersion | null => {
	const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;

	const major = parseInt(match[1], 10);
	const minor = parseInt(match[2], 10);
	const patch = parseInt(match[3], 10);

	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
		return null;
	}

	return [major, minor, patch];
};

/**
 * Compare two semantic versions.
 *
 * @param actual - The actual installed version
 * @param minimum - The minimum required version
 * @returns true if actual >= minimum
 */
const compareVersions = (
	actual: ParsedVersion,
	minimum: ParsedVersion,
): boolean => {
	// Compare major version
	if (actual[0] !== minimum[0]) {
		return actual[0] > minimum[0];
	}
	// Compare minor version
	if (actual[1] !== minimum[1]) {
		return actual[1] > minimum[1];
	}
	// Compare patch version
	return actual[2] >= minimum[2];
};

const runToolCommand = async (
	binary: string,
	args: readonly string[],
): Promise<ToolCommandResult> => {
	const proc = Bun.spawn([binary, ...args], {
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

/**
 * Detect a single tool from the registry.
 * Uses Bun.which() to check PATH and Bun.spawn() to get version.
 *
 * @param tool - Tool definition from registry
 * @returns DetectedTool if found and version obtained, null otherwise
 */
const detectSingleTool = async (
	tool: SupportedTool,
): Promise<DetectedTool | null> => {
	try {
		// Use Bun.which() to check if binary exists in PATH
		const binaryPath = Bun.which(tool.binary);
		if (!binaryPath) {
			return null;
		}

		const versionResult = await runToolCommand(
			tool.binary,
			tool.version_command ?? ["--version"],
		);

		if (tool.detect_command) {
			const detectResult = await runToolCommand(
				tool.binary,
				tool.detect_command,
			);
			if (detectResult.exitCode !== 0) {
				return null;
			}
		}

		if (versionResult.exitCode !== 0) {
			// Binary exists but --version failed
			// Still consider it detected but with unknown version
			return {
				tool,
				version: "unknown",
				meetsMinVersion: true, // Assume OK if can't determine
			};
		}

		const version = versionResult.output;
		const parsedActual = parseVersion(version);
		const parsedMin = parseVersion(tool.min_version);

		const meetsMinVersion =
			parsedActual && parsedMin
				? compareVersions(parsedActual, parsedMin)
				: true; // Assume OK if can't parse

		return { tool, version, meetsMinVersion };
	} catch {
		// Any error means tool not accessible
		return null;
	}
};

/**
 * Detect all tools from the registry.
 * Iterates through all registered tools and checks each one.
 *
 * Never fails - returns empty detected array if all checks fail.
 *
 * @param registry - The tools registry to check against
 * @returns TaskEither that always succeeds with detection results
 */
export const detectTools = (
	registry: ToolsRegistry,
): TE.TaskEither<never, ToolDetectionResult> =>
	TE.tryCatch(
		async () => {
			const enabledTools = getEnabledTools(registry);

			// Run all detections in parallel for speed
			const results = await Promise.all(
				enabledTools.map((tool) => detectSingleTool(tool)),
			);

			const detected: DetectedTool[] = [];
			const missing: SupportedTool[] = [];

			for (let i = 0; i < enabledTools.length; i++) {
				const result = results[i];
				if (result) {
					detected.push(result);
				} else {
					missing.push(enabledTools[i]);
				}
			}

			return { detected, missing };
		},
		// This function never fails - we catch all errors
		() =>
			({
				detected: [],
				missing: [...getEnabledTools(registry)],
			}) as never,
	);

/**
 * Check if any tools were detected.
 *
 * @param result - Tool detection result
 * @returns true if at least one tool was detected
 */
export const hasDetectedTools = (result: ToolDetectionResult): boolean =>
	result.detected.length > 0;

/**
 * Get the primary detected tool (first one found).
 * Useful when the init flow needs to pick one tool for instruction file injection.
 *
 * @param result - Tool detection result
 * @returns The first detected tool or undefined if none
 */
export const getPrimaryTool = (
	result: ToolDetectionResult,
): DetectedTool | undefined => result.detected[0];

/**
 * Get all tools that don't meet minimum version requirements.
 *
 * @param result - Tool detection result
 * @returns Array of detected tools that are below minimum version
 */
export const getOutdatedTools = (
	result: ToolDetectionResult,
): readonly DetectedTool[] => result.detected.filter((d) => !d.meetsMinVersion);

/**
 * Format a detection result for display.
 *
 * @param detected - A detected tool
 * @returns Human-readable status string
 */
export const formatDetectedTool = (detected: DetectedTool): string => {
	const versionInfo =
		detected.version === "unknown"
			? "(version unknown)"
			: `v${detected.version}`;
	const status = detected.meetsMinVersion
		? ""
		: ` (requires >= ${detected.tool.min_version})`;
	const supportLevel = getToolSupportLevel(detected.tool);
	const support = supportLevel === "stable" ? "" : ` (${supportLevel})`;
	return `${detected.tool.name} ${versionInfo}${support}${status}`;
};
