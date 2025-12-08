# @rp1/catppuccin-mermaid

Catppuccin color theme for Mermaid.js diagrams. Supports all four Catppuccin flavors: Latte, Frappé, Macchiato, and Mocha.

## Installation

```bash
bun add @rp1/catppuccin-mermaid
# or
npm install @rp1/catppuccin-mermaid
```

## Usage

### ES Module (React, bundlers)

```typescript
import { mocha } from '@rp1/catppuccin-mermaid';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: mocha.themeVariables,
});
```

### Import specific flavors (tree-shakeable)

```typescript
import { latte, frappe, macchiato, mocha } from '@rp1/catppuccin-mermaid';

// Use based on user preference
const theme = isDarkMode ? mocha : latte;
mermaid.initialize({
  theme: 'base',
  themeVariables: theme.themeVariables,
});
```

### MkDocs Material

Copy the MkDocs integration files to your docs directory:

```bash
cp node_modules/@rp1/catppuccin-mermaid/dist/mkdocs/* docs/
```

Then update `mkdocs.yml`:

```yaml
extra_css:
  - catppuccin-mermaid.css

extra_javascript:
  - https://unpkg.com/mermaid@10/dist/mermaid.min.js
  - catppuccin-mermaid.js
```

The theme automatically switches between Latte (light) and Mocha (dark) based on the MkDocs Material color scheme toggle.

## Flavors

| Flavor | Type | Base Color |
|--------|------|------------|
| Latte | Light | `#eff1f5` |
| Frappé | Dark | `#303446` |
| Macchiato | Dark | `#24273a` |
| Mocha | Dark | `#1e1e2e` |

## API

### Flavor Exports

Each flavor export includes:

```typescript
interface FlavorExport {
  id: 'latte' | 'frappe' | 'macchiato' | 'mocha';
  name: string;
  isDark: boolean;
  colors: Record<CatppuccinColor, string>;  // All 26 palette colors
  themeConfig: MermaidThemeConfig;           // Ready-to-use config
  themeVariables: MermaidThemeVariables;     // Theme variables object
}
```

### Utility Functions

```typescript
import {
  createTheme,        // Create theme config from flavor
  getThemeVariables,  // Get just the variables object
  getMermaidConfig,   // Get full mermaid.initialize() config
  wcagContrastRatio,  // Calculate WCAG contrast ratio
  meetsWcagAA,        // Check if colors meet AA (4.5:1)
} from '@rp1/catppuccin-mermaid';
```

### Type Exports

```typescript
import type {
  CatppuccinColor,      // Union of 26 color names
  CatppuccinFlavor,     // Flavor definition
  MermaidThemeConfig,   // { theme: 'base', themeVariables }
  MermaidThemeVariables, // All Mermaid theme variables
  FlavorExport,         // Complete flavor with theme
} from '@rp1/catppuccin-mermaid';
```

## Supported Diagram Types

- Flowchart / Graph
- Sequence Diagram
- Class Diagram
- State Diagram
- Entity Relationship Diagram
- Gantt Chart
- Pie Chart
- Git Graph

## Accessibility

- Dark themes (Frappé, Macchiato, Mocha) meet WCAG AA contrast ratios
- Latte (light theme) has some contrast limitations due to Catppuccin's vibrant palette design

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test
```

## Credits

- [Catppuccin](https://github.com/catppuccin/catppuccin) - Soothing pastel theme
- [Mermaid.js](https://mermaid.js.org/) - Diagram generation

## License

MIT
