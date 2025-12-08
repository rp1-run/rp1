import { frappe as frappeFlavor } from '../palette';
import { createTheme, getThemeVariables } from '../theme';
import type { FlavorExport } from '../types';

/**
 * Catppuccin Frappé (medium-dark theme) with Mermaid configuration
 */
export const frappe: FlavorExport = {
  ...frappeFlavor,
  themeConfig: createTheme(frappeFlavor),
  themeVariables: getThemeVariables(frappeFlavor),
};
