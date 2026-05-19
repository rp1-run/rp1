/**
 * Liquid filter: escape_toml
 *
 * Safely escapes a string value for TOML output.
 * Handles double-quote escaping and backslash escaping.
 */

/**
 * Escape a string value for safe TOML output.
 *
 * TOML basic strings use double quotes and require escaping of
 * backslashes and double quotes within them.
 *
 * @param value - Raw string value
 * @returns TOML-safe escaped string (without surrounding quotes)
 */
export const escapeToml = (value: string): string => {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/\t/g, "\\t");
};
