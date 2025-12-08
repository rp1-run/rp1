import type {
  CatppuccinFlavor,
  MermaidThemeConfig,
  MermaidThemeVariables,
  CatppuccinColor,
} from './types';
import { allMappings, staticValues, lightOverrides, darkOverrides } from './mappings';

/**
 * Resolve a Catppuccin color name to its hex value for a given flavor
 */
function resolveColor(flavor: CatppuccinFlavor, colorName: CatppuccinColor): string {
  return flavor.colors[colorName];
}

/**
 * Generate Mermaid theme variables for a Catppuccin flavor
 * Applies theme-specific overrides for light vs dark themes to ensure WCAG AA contrast
 */
export function getThemeVariables(flavor: CatppuccinFlavor): MermaidThemeVariables {
  const variables: Record<string, string> = {};

  // Apply all base color mappings
  for (const [varName, colorName] of Object.entries(allMappings)) {
    variables[varName] = resolveColor(flavor, colorName as CatppuccinColor);
  }

  // Apply theme-specific overrides for contrast compliance
  const overrides = flavor.isDark ? darkOverrides : lightOverrides;
  for (const [varName, colorName] of Object.entries(overrides)) {
    variables[varName] = resolveColor(flavor, colorName as CatppuccinColor);
  }

  // Apply static (non-color) values
  for (const [varName, value] of Object.entries(staticValues)) {
    variables[varName] = value;
  }

  return variables as unknown as MermaidThemeVariables;
}

/**
 * Create a complete Mermaid theme configuration for a Catppuccin flavor
 */
export function createTheme(flavor: CatppuccinFlavor): MermaidThemeConfig {
  return {
    theme: 'base',
    themeVariables: getThemeVariables(flavor),
  };
}

/**
 * Get a Mermaid initialize configuration object
 * Includes startOnLoad: false by default for manual control
 */
export function getMermaidConfig(
  flavor: CatppuccinFlavor,
  options: { startOnLoad?: boolean } = {}
): MermaidThemeConfig & { startOnLoad: boolean } {
  return {
    startOnLoad: options.startOnLoad ?? false,
    ...createTheme(flavor),
  };
}
