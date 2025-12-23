/**
 * Shared color utilities for CLI output using chalk.
 * Provides TTY-aware color functions with type safety.
 */

import chalk, { Chalk, type ChalkInstance } from "chalk";

/**
 * Create a chalk instance configured for TTY awareness.
 * Returns a chalk instance with colors enabled/disabled based on TTY.
 *
 * @param isTTY - Whether the output stream is a TTY
 * @returns Configured chalk instance
 */
export const createChalk = (isTTY: boolean): ChalkInstance => {
	return new Chalk({ level: isTTY ? chalk.level : 0 });
};

/**
 * TTY-aware color functions.
 * Use these for conditional coloring based on terminal capability.
 *
 * @param isTTY - Whether the output stream is a TTY
 * @returns Object with color wrapper functions
 */
export const getColorFns = (isTTY: boolean) => {
	const c = createChalk(isTTY);
	return {
		red: (s: string) => c.red(s),
		green: (s: string) => c.green(s),
		yellow: (s: string) => c.yellow(s),
		blue: (s: string) => c.blue(s),
		magenta: (s: string) => c.magenta(s),
		cyan: (s: string) => c.cyan(s),
		white: (s: string) => c.white(s),
		bold: (s: string) => c.bold(s),
		dim: (s: string) => c.dim(s),
		gray: (s: string) => c.gray(s),
		// Composite styles
		boldRed: (s: string) => c.bold.red(s),
		boldGreen: (s: string) => c.bold.green(s),
		boldYellow: (s: string) => c.bold.yellow(s),
		boldBlue: (s: string) => c.bold.blue(s),
		boldCyan: (s: string) => c.bold.cyan(s),
		dimWhite: (s: string) => c.dim.white(s),
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
