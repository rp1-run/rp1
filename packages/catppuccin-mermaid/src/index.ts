// Flavor exports (tree-shakeable)
export { latte, frappe, macchiato, mocha } from './flavors';

// Theme generation utilities
export { createTheme, getThemeVariables, getMermaidConfig } from './theme';

// Palette utilities
export { flavors, getFlavor } from './palette';

// Contrast utilities
export {
  hexToRgb,
  relativeLuminance,
  wcagContrastRatio,
  meetsWcagAA,
  meetsWcagAAA,
  meetsWcagAALarge,
  formatContrastRatio,
} from './utils';

// Type exports
export type {
  CatppuccinColor,
  FlavorId,
  ColorPalette,
  CatppuccinFlavor,
  MermaidThemeConfig,
  MermaidThemeVariables,
  FlavorExport,
  SemanticMapping,
} from './types';

// Default export with all flavors
import { latte, frappe, macchiato, mocha } from './flavors';

export default {
  latte,
  frappe,
  macchiato,
  mocha,
} as const;
