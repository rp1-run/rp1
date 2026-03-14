/**
 * Liquid filter: escape_yaml
 *
 * Safely escapes a string value for YAML output.
 * Wraps in double quotes when the value contains special YAML characters.
 *
 * Extracts the existing escapeYamlValue() logic from generator.ts
 * and codex/generator.ts into a reusable filter.
 */

/**
 * Escape a string value for safe YAML output.
 *
 * Characters that trigger quoting: brackets, braces, colon, hash, angle
 * brackets, pipes, asterisks, ampersands, exclamation marks, percent signs,
 * at signs, backticks, quotes, backslashes, commas, newlines, leading
 * whitespace/dash, and empty/whitespace-only strings.
 *
 * @param value - Raw string value
 * @returns YAML-safe string, double-quoted if necessary
 */
export const escapeYaml = (value: string): string => {
	const needsQuoting = /[[\]{}:#>|*&!%@`'"\\,\n]|^[\s-]|^\s*$/.test(value);
	if (needsQuoting) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
};
