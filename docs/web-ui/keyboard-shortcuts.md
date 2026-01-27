# Keyboard Shortcuts

The rp1 Web UI supports keyboard navigation for efficient workflow management. Vim-style keys operate in parallel with arrow keys, requiring no mode toggle.

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

## Vim Keys Behavior

Vim keys (`j`, `k`, `h`, `l`) work identically to their arrow key counterparts:

- `j` = Arrow Down (move down in list)
- `k` = Arrow Up (move up in list)
- `l` = Arrow Right (drill into item)
- `h` = Arrow Left (drill out to parent)

### Text Input Fields

Vim keys are automatically disabled when focus is in a text input field. This includes:

- Text inputs (`<input type="text">`)
- Password fields
- Email fields
- Search boxes
- Textareas
- Contenteditable elements

Arrow keys continue to work normally in text fields.

### Virtualized Lists

Keyboard navigation automatically scrolls virtualized lists to keep the selected item visible. This works for:

- Runs list
- Artifacts list
- Attention sections

---

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + B` | Toggle sidebar collapse |

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
| `Cmd/Ctrl + B` | Toggle navigation sidebar |
| `Cmd/Ctrl + Enter` | Submit annotation (when input focused) |
| Escape | Close popover |

---

## Accessibility

Keyboard navigation follows the roving tabindex pattern for screen reader compatibility:

- Only the selected item is in the tab order
- Arrow/vim keys move selection within the list
- Tab moves focus out of the list to the next focusable element

---

## Related

- [V2 Dashboard](v2-dashboard.md) - Status monitoring dashboard
- [Artifact Viewer](artifact-viewer.md) - Document viewing
- [Settings](settings.md) - Configuration options
