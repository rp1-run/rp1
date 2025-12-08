import { latte as latteFlavor } from '../palette';
import { createTheme, getThemeVariables } from '../theme';
import type { FlavorExport } from '../types';

/**
 * Catppuccin Latte (light theme) with Mermaid configuration
 */
export const latte: FlavorExport = {
  ...latteFlavor,
  themeConfig: createTheme(latteFlavor),
  themeVariables: getThemeVariables(latteFlavor),
};
