import type { CatppuccinColor } from './types';

/**
 * Semantic color mappings from Mermaid variables to Catppuccin colors.
 *
 * These mappings follow Catppuccin's style guide:
 * - Blue: Primary actions, links, default elements
 * - Lavender/Mauve: Secondary elements, decorative
 * - Red/Maroon: Error states, critical paths
 * - Green/Teal: Success states, positive flows
 * - Yellow/Peach: Warnings, notes, highlights
 */

/**
 * Core variables applied to all diagram types
 * Note: Some text colors are theme-dependent - see lightOverrides and darkOverrides
 */
export const coreMapping: Record<string, CatppuccinColor> = {
  // Backgrounds
  background: 'base',
  mainBkg: 'surface0',
  nodeBkg: 'surface0',
  nodeBorder: 'overlay0',
  nodeTextColor: 'text',

  // Primary colors (main elements)
  primaryColor: 'blue',
  primaryTextColor: 'crust', // Overridden for light themes
  primaryBorderColor: 'sapphire',

  // Secondary colors (supporting elements)
  secondaryColor: 'lavender',
  secondaryTextColor: 'crust', // Overridden for light themes
  secondaryBorderColor: 'mauve',

  // Tertiary colors (additional elements)
  tertiaryColor: 'surface1',
  tertiaryTextColor: 'text',
  tertiaryBorderColor: 'overlay0',

  // Text and lines
  textColor: 'text',
  lineColor: 'overlay1',

  // Notes (yellow/peach for highlights per Catppuccin style)
  noteBkgColor: 'yellow',
  noteTextColor: 'crust', // Overridden for light themes
  noteBorderColor: 'peach',
};

/**
 * Flowchart-specific mappings
 */
export const flowchartMapping: Record<string, CatppuccinColor> = {
  clusterBkg: 'surface0',
  clusterBorder: 'overlay0',
  edgeLabelBackground: 'surface1',
};

/**
 * Sequence diagram-specific mappings
 */
export const sequenceMapping: Record<string, CatppuccinColor> = {
  actorBkg: 'surface0',
  actorBorder: 'blue',
  actorTextColor: 'text',
  actorLineColor: 'overlay1',
  signalColor: 'text',
  signalTextColor: 'text',
  labelBoxBkgColor: 'surface1',
  labelBoxBorderColor: 'overlay0',
  labelTextColor: 'text',
  loopTextColor: 'text',
  activationBorderColor: 'blue',
  activationBkgColor: 'surface1',
  sequenceNumberColor: 'crust',
};

/**
 * State diagram-specific mappings
 */
export const stateMapping: Record<string, CatppuccinColor> = {
  labelBackgroundColor: 'surface1',
  compositeBackground: 'surface0',
  compositeBorder: 'overlay0',
  compositeTitleBackground: 'surface1',
  innerEndBackground: 'overlay0',
  specialStateColor: 'mauve',
};

/**
 * Class diagram-specific mappings
 */
export const classMapping: Record<string, CatppuccinColor> = {
  classText: 'text',
};

/**
 * ER diagram-specific mappings
 */
export const erMapping: Record<string, CatppuccinColor> = {
  attributeBackgroundColorOdd: 'surface0',
  attributeBackgroundColorEven: 'surface1',
};

/**
 * Gantt chart-specific mappings
 */
export const ganttMapping: Record<string, CatppuccinColor> = {
  sectionBkgColor: 'surface0',
  sectionBkgColor2: 'surface1',
  altSectionBkgColor: 'mantle',
  gridColor: 'overlay0',
  todayLineColor: 'red',
  taskBorderColor: 'blue',
  taskBkgColor: 'surface1',
  taskTextColor: 'text',
  taskTextLightColor: 'subtext0',
  taskTextOutsideColor: 'text',
  activeTaskBorderColor: 'sapphire',
  activeTaskBkgColor: 'blue',
  doneTaskBorderColor: 'green',
  doneTaskBkgColor: 'surface0',
  critBorderColor: 'red',
  critBkgColor: 'maroon',
  excludeBkgColor: 'crust',
};

/**
 * Pie chart-specific mappings (12 colors for slices)
 * Uses a variety of accent colors for visual distinction
 */
export const pieMapping: Record<string, CatppuccinColor> = {
  pie1: 'blue',
  pie2: 'lavender',
  pie3: 'sapphire',
  pie4: 'sky',
  pie5: 'teal',
  pie6: 'green',
  pie7: 'yellow',
  pie8: 'peach',
  pie9: 'maroon',
  pie10: 'red',
  pie11: 'pink',
  pie12: 'mauve',
  pieStrokeColor: 'overlay0',
  pieTitleTextColor: 'text',
  pieSectionTextColor: 'crust',
  pieLegendTextColor: 'text',
};

/**
 * Git graph-specific mappings (8 branch colors)
 */
export const gitMapping: Record<string, CatppuccinColor> = {
  git0: 'blue',
  git1: 'green',
  git2: 'mauve',
  git3: 'peach',
  git4: 'teal',
  git5: 'pink',
  git6: 'yellow',
  git7: 'lavender',
  gitBranchLabel0: 'crust',
  gitBranchLabel1: 'crust',
  gitBranchLabel2: 'crust',
  gitBranchLabel3: 'crust',
  gitBranchLabel4: 'crust',
  gitBranchLabel5: 'crust',
  gitBranchLabel6: 'crust',
  gitBranchLabel7: 'crust',
  commitLabelColor: 'text',
  commitLabelBackground: 'surface1',
  tagLabelColor: 'text',
  tagLabelBackground: 'surface0',
  tagLabelBorder: 'overlay0',
};

/**
 * All mappings combined
 */
export const allMappings = {
  ...coreMapping,
  ...flowchartMapping,
  ...sequenceMapping,
  ...stateMapping,
  ...classMapping,
  ...erMapping,
  ...ganttMapping,
  ...pieMapping,
  ...gitMapping,
} as const;

/**
 * Static values that don't map to colors
 */
export const staticValues = {
  pieStrokeWidth: '2px',
  pieOuterStrokeWidth: '2px',
  pieOpacity: '0.7',
} as const;

/**
 * Overrides for light themes (Latte)
 * In Latte, the accent colors (blue, yellow, etc.) are saturated and dark enough
 * that we need LIGHT text colors for contrast.
 * base=#eff1f5 provides good contrast against blue (#1e66f5) at 4.34:1
 * For better AA compliance, we use the lightest colors available
 */
export const lightOverrides: Record<string, CatppuccinColor> = {
  primaryTextColor: 'base', // Light base on dark blue (4.34:1 - close to AA)
  secondaryTextColor: 'base',
  noteTextColor: 'base', // Light base on yellow/peach
  pieSectionTextColor: 'base',
  sequenceNumberColor: 'base',
  gitBranchLabel0: 'base',
  gitBranchLabel1: 'base',
  gitBranchLabel2: 'base',
  gitBranchLabel3: 'base',
  gitBranchLabel4: 'base',
  gitBranchLabel5: 'base',
  gitBranchLabel6: 'base',
  gitBranchLabel7: 'base',
};

/**
 * Overrides for dark themes (Frappé, Macchiato, Mocha)
 * Dark themes can use light crust color on colored backgrounds
 */
export const darkOverrides: Record<string, CatppuccinColor> = {
  // Dark themes use crust (darkest) which provides good contrast
  primaryTextColor: 'crust',
  secondaryTextColor: 'crust',
  noteTextColor: 'crust',
  pieSectionTextColor: 'crust',
  sequenceNumberColor: 'crust',
  gitBranchLabel0: 'crust',
  gitBranchLabel1: 'crust',
  gitBranchLabel2: 'crust',
  gitBranchLabel3: 'crust',
  gitBranchLabel4: 'crust',
  gitBranchLabel5: 'crust',
  gitBranchLabel6: 'crust',
  gitBranchLabel7: 'crust',
};
