/**
 * Output formatter for transform-args module.
 * Generates deterministic VARIABLE=value output for prompt interpolation.
 */

import { version as RP1_VERSION } from "../../../package.json";
import type { TransformResult } from "./models.js";

/**
 * Characters that require quoting in shell variable values.
 * Includes space, tab, newline, and common shell metacharacters.
 */
const NEEDS_QUOTING_REGEX = /[\s"'\\$`!*?#~<>|;&()[\]{}]/;

/**
 * Escape special characters within a quoted value.
 * Handles double quotes, backslashes, and dollar signs.
 *
 * @param value - Raw value to escape
 * @returns Escaped value safe for double quotes
 */
export const escapeValue = (value: string): string =>
	value.replace(/["\\$`]/g, (char) => `\\${char}`);

/**
 * Determine if a value needs to be quoted.
 *
 * @param value - Value to check
 * @returns True if value contains special characters requiring quotes
 */
export const needsQuoting = (value: string): boolean =>
	NEEDS_QUOTING_REGEX.test(value) || value === "";

/**
 * Format a single variable value for output.
 *
 * Rules:
 * 1. Boolean values: lowercase `true`/`false`
 * 2. Values with special chars: wrapped in double quotes, escaped
 * 3. Empty strings: wrapped in double quotes
 * 4. Simple values: output as-is
 *
 * @param value - Value to format
 * @returns Formatted value string
 */
export const formatValue = (value: string): string => {
	const lowerValue = value.toLowerCase();
	if (lowerValue === "true" || lowerValue === "false") {
		return lowerValue;
	}

	if (needsQuoting(value)) {
		return `"${escapeValue(value)}"`;
	}

	return value;
};

/**
 * Format a variable assignment line.
 *
 * @param name - Variable name (should already be UPPER_SNAKE_CASE)
 * @param value - Variable value
 * @returns Formatted line: `NAME=value` or `NAME="quoted value"`
 */
export const formatLine = (name: string, value: string): string =>
	`${name}=${formatValue(value)}`;

/**
 * Format transform result as VARIABLE=value lines.
 *
 * Rules:
 * 1. Sort variables alphabetically for deterministic output
 * 2. Quote values containing spaces or special characters
 * 3. Escape quotes within values
 * 4. Boolean values as lowercase true/false
 * 5. One variable per line
 * 6. Always include RP1_VERSION for version gating
 *
 * @param result - Transform result containing variables
 * @returns Formatted output string with newline-separated lines
 */
export const formatOutput = (result: TransformResult): string => {
	const { variables } = result;

	// Add RP1_VERSION to variables for version gating
	const allVariables = { ...variables, RP1_VERSION };

	const sortedKeys = Object.keys(allVariables).sort();
	const lines = sortedKeys.map((key) => formatLine(key, allVariables[key]));

	return lines.join("\n");
};

/**
 * Format transform result with warnings included as comments.
 *
 * Includes any warnings from the transformation as shell comments
 * before the variable output.
 *
 * @param result - Transform result containing variables and warnings
 * @returns Formatted output string with warnings and variables
 */
export const formatOutputWithWarnings = (result: TransformResult): string => {
	const { warnings } = result;
	const lines: string[] = [];

	if (warnings.length > 0) {
		for (const warning of warnings) {
			lines.push(`# Warning: ${warning}`);
		}
		lines.push("");
	}

	lines.push(formatOutput(result));

	return lines.join("\n");
};
