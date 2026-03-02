# Keyboard Shortcuts

The rp1 Web UI supports keyboard navigation for efficient workflow management. Vim-style keys operate in parallel with arrow keys, requiring no mode toggle.

For a conceptual overview of the keyboard-first interaction model, see [WebUI Interaction](../concepts/webui.md).

---

## Command Palette

Press **Cmd+K** (macOS) or **Ctrl+K** (other platforms) to open the command palette. It provides fuzzy search across routes and actions.

| Key | Action |
|-----|--------|
| Cmd+K / Ctrl+K | Open or close the palette |
| Arrow Up / k | Move highlight up |
| Arrow Down / j | Move highlight down |
| Enter | Select highlighted item |
| Escape | Close the palette |

The palette includes navigation items (Home, Runs, Projects) and actions (Toggle Theme, Refresh Data).

---

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K / Ctrl+K | Open command palette |
| ? | Toggle shortcut help overlay |
| / | Focus search input on current view |
| Escape | Dismiss topmost overlay or blur focus |
| Cmd+\\ / Ctrl+\\ | Toggle sidebar collapse |

Modifier-key shortcuts (Cmd+K, Cmd+\\) fire regardless of whether a text input is focused. Single-key shortcuts (?, /, g) are suppressed when a text input is focused.

---

## Go-To Chords

Press **g** followed by a second key within 500ms to jump to a section.

| Chord | Destination |
|-------|-------------|
| g then h | Home (/) |
| g then r | Runs (/runs) |
| g then p | Projects (/projects) |

Chords always navigate to the index route. Waiting longer than 500ms cancels the chord.

---

## List Navigation

Navigate runs, artifacts, and attention items using these keys.

### Movement

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Up | `k` | Select previous item |
| Arrow Down | `j` | Select next item |
| Home | - | Jump to first item |
| End | - | Jump to last item |

### Drill Navigation

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Right | `l` | Drill into selected item (open detail view) |
| Arrow Left | `h` | Drill out to parent context (back to list) |

### Selection

| Key | Action |
|-----|--------|
| Enter | Open/select current item |
| Escape | Clear selection |

---

## Shortcut Help Overlay

Press **?** from any view to see all available shortcuts grouped by category (Global, Navigation, Current View). Press **?** again or **Escape** to dismiss.

---

## Vim Keys Behavior

Vim keys (`j`, `k`, `h`, `l`) work identically to their arrow key counterparts:

- `j` = Arrow Down (move down in list)
- `k` = Arrow Up (move up in list)
- `l` = Arrow Right (drill into item)
- `h` = Arrow Left (drill out to parent)

### Text Input Fields

Vim keys and single-key shortcuts are automatically disabled when focus is in a text input field. This includes:

- Text inputs (`<input type="text">`)
- Password fields
- Email fields
- Search boxes
- Textareas
- Contenteditable elements

Arrow keys continue to work normally in text fields. Modifier-key shortcuts (Cmd+K, Cmd+\\) always fire regardless of focus.

### Virtualized Lists

Keyboard navigation automatically scrolls virtualized lists to keep the selected item visible. This works for:

- Runs list
- Artifacts list
- Attention sections

---

## Context-Specific Shortcuts

### Run Detail View

| Key | Action |
|-----|--------|
| Escape | Return to runs list |
| `h` or Arrow Left | Return to runs list |

### Artifact Viewer

| Shortcut | Action |
|----------|--------|
| Cmd+\\ / Ctrl+\\ | Toggle navigation sidebar |
| Cmd+Enter / Ctrl+Enter | Submit annotation (when input focused) |
| Escape | Close popover |

---

## Platform-Specific Keys

| Platform | Modifier | Example |
|----------|----------|---------|
| macOS | Cmd | Cmd+K |
| Windows / Linux | Ctrl | Ctrl+K |

The shortcut help overlay and command palette show platform-appropriate labels automatically.

---

## Accessibility

Keyboard navigation follows the roving tabindex pattern for screen reader compatibility:

- Only the selected item is in the tab order
- Arrow/vim keys move selection within the list
- Tab moves focus out of the list to the next focusable element

The command palette and shortcut overlay use ARIA dialog roles with proper focus trapping.

---

## Related

- [WebUI Interaction](../concepts/webui.md) - Conceptual overview of keyboard-first navigation
- [V2 Dashboard](v2-dashboard.md) - Status monitoring dashboard
- [Artifact Viewer](artifact-viewer.md) - Document viewing
- [Settings](settings.md) - Configuration options
