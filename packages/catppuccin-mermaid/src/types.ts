/**
 * All 26 color names in the Catppuccin palette
 */
export type CatppuccinColor =
  | 'rosewater'
  | 'flamingo'
  | 'pink'
  | 'mauve'
  | 'red'
  | 'maroon'
  | 'peach'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'sky'
  | 'sapphire'
  | 'blue'
  | 'lavender'
  | 'text'
  | 'subtext1'
  | 'subtext0'
  | 'overlay2'
  | 'overlay1'
  | 'overlay0'
  | 'surface2'
  | 'surface1'
  | 'surface0'
  | 'base'
  | 'mantle'
  | 'crust';

/**
 * Catppuccin flavor identifier
 */
export type FlavorId = 'latte' | 'frappe' | 'macchiato' | 'mocha';

/**
 * Complete color palette for a single Catppuccin flavor
 */
export type ColorPalette = Record<CatppuccinColor, string>;

/**
 * A Catppuccin flavor with metadata and colors
 */
export interface CatppuccinFlavor {
  /** Flavor identifier */
  id: FlavorId;
  /** Human-readable name */
  name: string;
  /** Whether this is a dark theme */
  isDark: boolean;
  /** All 26 colors as hex values */
  colors: ColorPalette;
}

/**
 * Mermaid theme configuration using the base theme approach
 */
export interface MermaidThemeConfig {
  /** Must be 'base' for custom theming */
  theme: 'base';
  /** Complete theme variables object */
  themeVariables: MermaidThemeVariables;
}

/**
 * Mermaid theme variables for all diagram types
 * Based on Mermaid v10.x themeVariables API
 */
export interface MermaidThemeVariables {
  // Core colors
  background: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  secondaryColor: string;
  secondaryTextColor: string;
  secondaryBorderColor: string;
  tertiaryColor: string;
  tertiaryTextColor: string;
  tertiaryBorderColor: string;
  lineColor: string;
  textColor: string;

  // Main/node backgrounds
  mainBkg: string;
  nodeBkg: string;
  nodeBorder: string;
  nodeTextColor: string;

  // Note styling
  noteBkgColor: string;
  noteTextColor: string;
  noteBorderColor: string;

  // Flowchart specific
  clusterBkg: string;
  clusterBorder: string;
  edgeLabelBackground: string;

  // Sequence diagram specific
  actorBkg: string;
  actorBorder: string;
  actorTextColor: string;
  actorLineColor: string;
  signalColor: string;
  signalTextColor: string;
  labelBoxBkgColor: string;
  labelBoxBorderColor: string;
  labelTextColor: string;
  loopTextColor: string;
  activationBorderColor: string;
  activationBkgColor: string;
  sequenceNumberColor: string;

  // State diagram specific
  labelBackgroundColor: string;
  compositeBackground: string;
  compositeBorder: string;
  compositeTitleBackground: string;
  innerEndBackground: string;
  specialStateColor: string;

  // Class diagram specific
  classText: string;

  // ER diagram specific
  attributeBackgroundColorOdd: string;
  attributeBackgroundColorEven: string;

  // Gantt specific
  sectionBkgColor: string;
  sectionBkgColor2: string;
  altSectionBkgColor: string;
  gridColor: string;
  todayLineColor: string;
  taskBorderColor: string;
  taskBkgColor: string;
  taskTextColor: string;
  taskTextLightColor: string;
  taskTextOutsideColor: string;
  activeTaskBorderColor: string;
  activeTaskBkgColor: string;
  doneTaskBorderColor: string;
  doneTaskBkgColor: string;
  critBorderColor: string;
  critBkgColor: string;
  excludeBkgColor: string;

  // Pie chart specific (12 colors for slices)
  pie1: string;
  pie2: string;
  pie3: string;
  pie4: string;
  pie5: string;
  pie6: string;
  pie7: string;
  pie8: string;
  pie9: string;
  pie10: string;
  pie11: string;
  pie12: string;
  pieStrokeColor: string;
  pieTitleTextColor: string;
  pieSectionTextColor: string;
  pieLegendTextColor: string;
  pieStrokeWidth: string;
  pieOuterStrokeWidth: string;
  pieOpacity: string;

  // Git graph specific (8 branch colors)
  git0: string;
  git1: string;
  git2: string;
  git3: string;
  git4: string;
  git5: string;
  git6: string;
  git7: string;
  gitBranchLabel0: string;
  gitBranchLabel1: string;
  gitBranchLabel2: string;
  gitBranchLabel3: string;
  gitBranchLabel4: string;
  gitBranchLabel5: string;
  gitBranchLabel6: string;
  gitBranchLabel7: string;
  commitLabelColor: string;
  commitLabelBackground: string;
  tagLabelColor: string;
  tagLabelBackground: string;
  tagLabelBorder: string;
}

/**
 * Exported flavor with theme configuration
 */
export interface FlavorExport extends CatppuccinFlavor {
  /** Ready-to-use Mermaid theme configuration */
  themeConfig: MermaidThemeConfig;
  /** Shorthand for themeConfig.themeVariables */
  themeVariables: MermaidThemeVariables;
}

/**
 * Semantic color mapping type - maps Mermaid variable names to Catppuccin color names
 */
export type SemanticMapping = Partial<Record<keyof MermaidThemeVariables, CatppuccinColor>>;
