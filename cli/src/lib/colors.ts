/**
 * Shared ANSI color utilities for CLI output.
 * Provides both raw color codes and TTY-aware color functions.
 */

/**
 * Raw ANSI escape codes for terminal colors.
 * Use these when you need direct control over color application.
 */
export const codes = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
} as const;

/**
 * TTY-aware color codes that return empty strings when not in a TTY.
 * Use these for conditional coloring based on terminal capability.
 *
 * @param isTTY - Whether the output stream is a TTY
 * @returns Object with color codes (or empty strings if not TTY)
 */
export const getColors = (isTTY: boolean) => ({
	reset: isTTY ? codes.reset : "",
	bold: isTTY ? codes.bold : "",
	dim: isTTY ? codes.dim : "",
	red: isTTY ? codes.red : "",
	green: isTTY ? codes.green : "",
	yellow: isTTY ? codes.yellow : "",
	blue: isTTY ? codes.blue : "",
	magenta: isTTY ? codes.magenta : "",
	cyan: isTTY ? codes.cyan : "",
	white: isTTY ? codes.white : "",
});

/**
 * Color type derived from getColors return type.
 */
export type Colors = ReturnType<typeof getColors>;

/**
 * Color wrapper functions that apply color and reset.
 * Convenient for wrapping text in a single color.
 *
 * @param isTTY - Whether the output stream is a TTY
 * @returns Object with color wrapper functions
 */
export const getColorFns = (isTTY: boolean) => {
	const c = getColors(isTTY);
	return {
		red: (s: string) => `${c.red}${s}${c.reset}`,
		green: (s: string) => `${c.green}${s}${c.reset}`,
		yellow: (s: string) => `${c.yellow}${s}${c.reset}`,
		blue: (s: string) => `${c.blue}${s}${c.reset}`,
		magenta: (s: string) => `${c.magenta}${s}${c.reset}`,
		cyan: (s: string) => `${c.cyan}${s}${c.reset}`,
		white: (s: string) => `${c.white}${s}${c.reset}`,
		bold: (s: string) => `${c.bold}${s}${c.reset}`,
		dim: (s: string) => `${c.dim}${s}${c.reset}`,
	};
};

/**
 * ColorFns type derived from getColorFns return type.
 */
export type ColorFns = ReturnType<typeof getColorFns>;

/**
 * Simple color functions that always apply colors (no TTY check).
 * Use for contexts where colors should always be applied.
 */
export const colorFns = getColorFns(true);
