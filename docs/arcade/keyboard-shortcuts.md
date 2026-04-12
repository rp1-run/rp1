# Keyboard Shortcuts

Arcade supports keyboard navigation for efficient workflow management,
including shell-level shortcuts for opening and closing the notifications
drawer. Vim-style keys operate in parallel with arrow keys, requiring no mode
toggle.

For an overview of Arcade surfaces, see [Arcade](index.md).

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

The palette includes navigation items (Home, Runs, Projects), shell actions
(Toggle Theme, Refresh Data), and workspace actions such as **Previous
Workspace**, **Next Workspace**, and **Close Workspace** when a run, project
overview, or file-browser workspace is active.

---

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K / Ctrl+K | Open command palette |
| Cmd+B / Ctrl+B | Open or close the notifications drawer |
| Cmd+\\ / Ctrl+\\ | Open or close the notifications drawer (alternate) |
| ? | Toggle shortcut help overlay |
| / | Focus search input on current view |
| Escape | Dismiss topmost overlay or blur focus |

Modifier-key shortcuts (Cmd+K, Cmd+B, Cmd+\\) fire regardless of whether a
text input is focused. Single-key shortcuts (?, /, g) are suppressed when a
text input is focused.

---

## Notifications Drawer

Press **Cmd+B** (macOS) or **Ctrl+B** (other platforms) to open the
notifications drawer from the current page. **Cmd+\\** / **Ctrl+\\** provides
the same behavior as an alternate shortcut.

- The drawer opens on top of the current page instead of navigating away.
- The same shortcut closes the drawer if it is already open.
- **Escape** also closes the drawer.
- On desktop, the drawer matches the bell trigger in the top-right breadcrumb
  bar. On narrow layouts, it matches the bell action in the bottom navigation.

---

## Go-To Chords

Press **g** followed by a second key within 500ms to jump to a section.

| Chord | Destination |
|-------|-------------|
| g then h | Activity (/) |
| g then r | Activity (alternate alias) |
| g then p | Projects (/projects) |

Each chord jumps directly to its mapped section. Waiting longer than 500ms
cancels the chord.

These chords continue to target durable shell destinations only. Workspace tabs
do not add new global single-key shortcuts in v1.

---

## Workspace Strip

When run, project overview, or file-browser workspaces are open, Arcade shows a
horizontal **Open workspaces** strip above the page content. It uses normal
focus order and route navigation rather than hidden tab panels.

| Key | Action |
|-----|--------|
| Tab | Move focus into the workspace strip |
| Arrow Left | Move focus to the previous workspace tab |
| Arrow Right | Move focus to the next workspace tab |
| Home | Jump focus to the first workspace tab |
| End | Jump focus to the last workspace tab |
| Enter / Space | Activate the focused workspace tab |
| Delete / Backspace | Close the focused workspace tab |

The close button on each workspace follows the same Arrow, Home, End, Enter,
Space, Delete, and Backspace behavior so keyboard users can close tabs without
leaving the strip.

---

## List Navigation

Navigate runs, artifacts, and attention items using these keys.

These bindings continue to apply to list and drill-navigation surfaces. The
workspace strip uses the horizontal behavior above instead of introducing new
global `h`/`l` tab shortcuts.

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

Arrow keys continue to work normally in text fields. Modifier-key shortcuts
(Cmd+K, Cmd+B, Cmd+\\) always fire regardless of focus.

### Virtualized Lists

Keyboard navigation automatically scrolls virtualized lists to keep the selected item visible. This works for:

- Runs list
- Artifacts list
- Attention sections

---

## Context-Specific Shortcuts

### Artifact Viewer

| Shortcut | Action |
|----------|--------|
| `e` | Toggle table of contents |
| `c` | Copy artifact content |
| `[` | Previous artifact |
| `]` | Next artifact |
| `h` or Arrow Left | Return to run detail |

### File Browser

| Shortcut | Action |
|----------|--------|
| `e` | Toggle table of contents |
| `c` | Copy file content |
| `h` or Arrow Left | Return to project view |

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

- [Arcade](index.md) - Arcade overview
- [Dashboard](dashboard.md) - Status monitoring dashboard
- [Artifact Viewer](artifact-viewer.md) - Document viewing
- [Settings](settings.md) - Configuration options
