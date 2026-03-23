# WebUI Keyboard Shortcuts & Command Palette

The rp1 WebUI is designed for keyboard-first interaction. A command palette, vim-style navigation, and go-to chord sequences let you navigate and act without reaching for the mouse.

---

## Command Palette

Press **Cmd+K** (macOS) or **Ctrl+K** (other platforms) to open the command palette from any view. The palette provides fuzzy search across all routes and actions.

### Opening and Closing

| Action | Key |
|--------|-----|
| Open palette | Cmd+K / Ctrl+K |
| Close palette | Escape, Cmd+K again, or click outside |

### Navigating Results

| Key | Action |
|-----|--------|
| Arrow Up / k | Move highlight up |
| Arrow Down / j | Move highlight down |
| Enter | Select highlighted item |

Results are grouped into two categories:

**Navigation** -- jumps to a route in the WebUI:

| Item | Route |
|------|-------|
| Home | / |
| Runs | /runs |
| Projects | /projects |

**Actions** -- executes a side-effect without navigating:

| Item | Effect |
|------|--------|
| Toggle Theme | Switches between dark and light mode |
| Refresh Data | Reloads data on the current page |

Type partial or imprecise queries (e.g., "rns" matches "Runs"). Each result row shows a shortcut hint if a keyboard shortcut exists for that destination.

---

## Global Shortcuts

These shortcuts work from any view in the WebUI. Modifier-key shortcuts (Cmd/Ctrl combinations) fire regardless of whether a text input is focused.

| Shortcut | Action |
|----------|--------|
| Cmd+K / Ctrl+K | Open command palette |
| ? | Toggle shortcut help overlay |
| / | Focus the search input on the current view |
| Escape | Dismiss the topmost overlay, or blur the focused element |
| Cmd+B / Ctrl+B | Toggle sidebar collapsed/expanded |
| Cmd+\\ / Ctrl+\\ | Toggle sidebar collapsed/expanded (alternate) |

---

## Vim Navigation

Navigate lists (runs, projects, attention sections) using vim-style keys. These work alongside standard arrow keys without any mode toggle.

### Movement

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Up | k | Select previous item |
| Arrow Down | j | Select next item |
| Home | -- | Jump to first item |
| End | -- | Jump to last item |

### Drill Navigation

| Key | Vim Key | Action |
|-----|---------|--------|
| Arrow Right | l | Drill into selected item (open detail) |
| Arrow Left | h | Drill out to parent (back to list) |

### Selection

| Key | Action |
|-----|--------|
| Enter | Open or select the current item |
| Escape | Clear selection |

---

## Go-To Chords

Two-key chord sequences provide instant navigation to top-level sections. Press **g** followed by a second key within 500ms.

| Chord | Destination | Route |
|-------|-------------|-------|
| g then h | Home | / |
| g then r | Runs | /runs |
| g then p | Projects | /projects |

If you press **g** and wait longer than 500ms without pressing a second key, the chord is cancelled. Pressing any key other than h, r, or p after g also cancels the chord.

Go-to chords always navigate to the index/list route, never to a previously visited sub-route. For example, **g then r** always goes to `/runs`, not to a specific run detail page.

---

## Shortcut Help Overlay

Press **?** to open the shortcut help overlay from any view. The overlay displays all keyboard shortcuts grouped into three categories:

- **Global** -- shortcuts that work everywhere (Cmd+K, ?, /, Escape, Cmd+B, Cmd+\\)
- **Navigation** -- vim keys and go-to chords (j/k, Enter, g then h/r/p)
- **Current View** -- view-specific shortcuts (placeholder for future phases)

Press **?** again or **Escape** to dismiss the overlay.

---

## Text Input Behavior

Single-key shortcuts (j, k, g, ?, /) are automatically suppressed when a text input field is focused. This includes text inputs, password fields, search boxes, textareas, and contenteditable elements.

Modifier-key shortcuts (Cmd+K, Cmd+\\) always fire regardless of focus state, since they are unambiguous.

When the command palette or any dialog is open, all shortcuts except Escape are suppressed to prevent accidental navigation.

---

## Platform-Specific Keys

The WebUI detects your platform and shows appropriate key labels:

| Platform | Modifier Key | Example |
|----------|-------------|---------|
| macOS | Cmd | Cmd+K |
| Windows / Linux | Ctrl | Ctrl+K |

The shortcut help overlay and command palette both show platform-appropriate labels automatically.

---

## Related

- [Dashboard](../web-ui/dashboard.md) -- Status monitoring dashboard
- [Keyboard Shortcuts (Web UI reference)](../web-ui/keyboard-shortcuts.md) -- Full keyboard reference for all views
