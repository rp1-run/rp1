/**
 * Theme constants for the Ink.js wizard UI.
 * Provides type-safe color palette matching the design spec.
 *
 * @see design.md Appendix B: Color Palette
 */

/**
 * Color palette for UI elements.
 * Values are color names compatible with Ink's Text component.
 */
export const colors = {
	/** Success states - green (#4CAF50) */
	success: "green",
	/** Error states - red (#F44336) */
	error: "red",
	/** Warning states - yellow (#FFC107) */
	warning: "yellow",
	/** Informational - cyan (#00BCD4) */
	info: "cyan",
	/** Dimmed/secondary text - gray (#9E9E9E) */
	dim: "gray",
	/** Accent/highlight - blue (#2196F3) */
	accent: "blue",
} as const;

/**
 * Type for theme color keys.
 */
export type ThemeColor = keyof typeof colors;

/**
 * Get a theme color value by key.
 */
export const getColor = (key: ThemeColor): string => colors[key];

/**
 * Border styles for UI boxes.
 */
export const borders = {
	/** Standard rounded border for containers */
	standard: "round",
	/** Single line border for sections */
	section: "single",
	/** Double line border for emphasis */
	emphasis: "double",
} as const;

/**
 * Type for border style keys.
 */
export type BorderStyle = keyof typeof borders;

/**
 * Spacing constants for consistent layout.
 */
export const spacing = {
	/** No padding/margin */
	none: 0,
	/** Small spacing (1) */
	small: 1,
	/** Medium spacing (2) */
	medium: 2,
	/** Large spacing (3) */
	large: 3,
} as const;

/**
 * Type for spacing keys.
 */
export type Spacing = keyof typeof spacing;
