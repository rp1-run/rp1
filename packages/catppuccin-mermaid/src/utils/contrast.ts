/**
 * WCAG Contrast Ratio Utilities
 *
 * Implements WCAG 2.1 contrast ratio calculation per:
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */

/**
 * Parse a hex color string to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');

  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }

  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Convert an sRGB color channel to linear RGB
 * Formula from WCAG 2.1 spec
 */
function sRgbToLinear(value: number): number {
  const normalized = value / 255;

  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance of a color per WCAG 2.1
 *
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are in linear RGB space
 *
 * @param hex - Hex color string (e.g., "#1e1e2e")
 * @returns Relative luminance value between 0 and 1
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const linearR = sRgbToLinear(r);
  const linearG = sRgbToLinear(g);
  const linearB = sRgbToLinear(b);

  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}

/**
 * Calculate WCAG 2.1 contrast ratio between two colors
 *
 * Contrast ratio = (L1 + 0.05) / (L2 + 0.05)
 * where L1 is the lighter color's luminance
 *
 * @param fg - Foreground color hex
 * @param bg - Background color hex
 * @returns Contrast ratio (1 to 21)
 */
export function wcagContrastRatio(fg: string, bg: string): number {
  const fgLuminance = relativeLuminance(fg);
  const bgLuminance = relativeLuminance(bg);

  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a contrast ratio meets WCAG AA for normal text (4.5:1)
 */
export function meetsWcagAA(fg: string, bg: string): boolean {
  return wcagContrastRatio(fg, bg) >= 4.5;
}

/**
 * Check if a contrast ratio meets WCAG AAA for normal text (7:1)
 */
export function meetsWcagAAA(fg: string, bg: string): boolean {
  return wcagContrastRatio(fg, bg) >= 7;
}

/**
 * Check if a contrast ratio meets WCAG AA for large text (3:1)
 */
export function meetsWcagAALarge(fg: string, bg: string): boolean {
  return wcagContrastRatio(fg, bg) >= 3;
}

/**
 * Format a contrast ratio for display
 */
export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
