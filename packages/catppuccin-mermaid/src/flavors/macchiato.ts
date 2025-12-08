import { macchiato as macchiatoFlavor } from '../palette';
import { createTheme, getThemeVariables } from '../theme';
import type { FlavorExport } from '../types';

/**
 * Catppuccin Macchiato (dark theme) with Mermaid configuration
 */
export const macchiato: FlavorExport = {
  ...macchiatoFlavor,
  themeConfig: createTheme(macchiatoFlavor),
  themeVariables: getThemeVariables(macchiatoFlavor),
};
