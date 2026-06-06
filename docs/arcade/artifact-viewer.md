# Artifact Viewer

The Artifact Viewer is where you read workflow outputs without leaving Arcade.
Use it for requirements, designs, task plans, review reports, walkthroughs,
diagrams, diffs, and other files produced by tracked workflows.

## Open An Artifact

### From Run Detail

1. Open a run from Activity or a notification.
2. Use the artifact area in the run detail workspace.
3. Select a file artifact to read it in Arcade.
4. Select an external link to open it in a new browser tab.

The artifact area shows run-level and step-level outputs together. Step rows can
still provide shortcuts, but they open the same viewer so the run context stays
visible.

### From A Project File

Project file browsing is separate from artifact review. Use the file browser
when you want to inspect current project files; use the artifact viewer when
you want the generated output attached to a workflow run.

## File Artifacts And External Links

| Item | Behavior |
|------|----------|
| File artifact | Opens inside Arcade with the right reader for the file type. |
| External link | Opens outside Arcade, such as a reviewed PR or issue tracker page. |
| Missing or moved file | Shows an error with enough context to return to the run or project. |

External links are not editable inside Arcade and do not support annotations.
They are preserved with the run so the report and the related outside page stay
easy to find together.

## Layout

The viewer keeps the content centered and exposes extra panels only when they
help the current artifact.

| Area | Use it for |
|------|------------|
| Artifact list | Switch between generated files and links for the run. |
| Content | Read the selected artifact. |
| Outline | Jump between headings in Markdown artifacts. |
| Annotations | Review, add, reply to, resolve, or reopen comments. |
| Toolbar | Copy paths, open links, toggle panels, and switch supported reading modes. |

## Reading Modes

Most artifacts open in the standard reader for their file type. Valid Code Tour
walkthrough artifacts open in the 3D reader by default and keep source viewing
available for inspection or diagnostics.

| Mode | Use it when |
|------|-------------|
| 3D | You want to inspect a walkthrough as concepts, source fragments, relationships, and guided tour steps. |
| Source | You want the complete JSON artifact in source order, including diagnostics and annotation support. |

If the Code Tour artifact is invalid, unsupported, or cannot render in the
browser, Arcade shows a clear diagnostic above Source mode instead of a blank
walkthrough surface.

## Code Tour Walkthroughs

Arcade treats JSON artifacts under `.rp1/work/pr-walkthroughs/` as Code Tour
candidates. A valid artifact must satisfy the Code Tour v1 contract before the
3D reader appears.

| State | What Arcade shows |
|-------|-------------------|
| Valid Code Tour | A 3D concept graph with guided controls, source fragment cards, and relationship navigation. |
| Source mode | The formatted JSON artifact, available from the 3D toolbar or after a diagnostic fallback. |
| Invalid or unsupported JSON | A diagnostic message with validation details, followed by the source JSON. |
| Render failure or unavailable WebGL | A diagnostic fallback that identifies the viewer-side rendering issue and leaves Source mode available. |

## Supported Content

| Content | What Arcade shows |
|---------|-------------------|
| Markdown | Rendered prose, tables, code blocks, diagrams, outline, and annotations. |
| Code Tour JSON | Contract-gated 3D walkthroughs for valid PR walkthrough artifacts, with source diagnostics as fallback. |
| Other JSON | Formatted structured data for inspection. |
| Mermaid diagrams | Rendered diagrams. |
| Diffs | Syntax-highlighted unified diff content. |
| Code | Syntax-highlighted source with line-oriented reading. |
| External links | Open and copy controls. |

## Inspect A Workflow Output

1. Open the artifact from the run detail workspace.
2. Skim the outline or headings to find the relevant section.
3. Check related artifacts when the run produced requirements, design, tasks,
   reviews, or readiness reports together.
4. Follow external links when the artifact points to a PR, issue, or outside
   source.
5. Add annotations to specific text when you need a change or clarification.
6. Resolve annotations when the feedback has been addressed.

## Annotations In Artifacts

The annotation sidebar groups comments by open, resolved, and orphaned state.
Click a comment to jump to its location in the artifact.

| Action | How |
|--------|-----|
| Add comment | Select text and choose Add Comment. |
| View comments | Toggle the annotation sidebar. |
| Reply | Open a comment and enter a reply. |
| Resolve | Open a comment and choose Resolve. |
| Reopen | Open a resolved comment and choose Reopen or Unresolve. |

See [Annotations](annotations.md) for the full feedback workflow.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + B` | Toggle the notifications drawer from the Arcade shell. |
| `Cmd/Ctrl + Enter` | Submit an annotation or reply when the input is focused. |
| `Escape` | Close the active popover or overlay. |

See [Keyboard Shortcuts](keyboard-shortcuts.md) for shell-wide navigation.

## Related

- [Dashboard](dashboard.md)
- [Annotations](annotations.md)
- [PR Review Guide](../guides/pr-review.md)
- [Feature Development Guide](../guides/feature-development.md)
