import { mocha as mochaFlavor } from '../palette';
import { createTheme, getThemeVariables } from '../theme';
import type { FlavorExport } from '../types';

/**
 * Catppuccin Mocha (darkest theme) with Mermaid configuration
 */
export const mocha: FlavorExport = {
  ...mochaFlavor,
  themeConfig: createTheme(mochaFlavor),
  themeVariables: getThemeVariables(mochaFlavor),
};
