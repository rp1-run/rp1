# Annotations

Annotations let you attach feedback to specific artifact text in Arcade. Use
them when a requirement is unclear, a design choice needs review, a report
finding needs follow-up, or a teammate should respond in context.

## What Annotations Are For

| Need | Use annotations to |
|------|--------------------|
| Ask for a change | Select the exact text and describe the requested edit. |
| Discuss a decision | Reply in the thread until the decision is clear. |
| Track completion | Resolve the annotation when the issue is addressed. |
| Preserve context | Keep feedback attached to the artifact instead of separate chat history. |
| Recover after edits | Review orphaned comments when the original selected text moved or changed. |

## Add A Comment

1. Open an artifact in Arcade.
2. Select the text you want to comment on.
3. Choose **Add Comment** from the popover.
4. Write the feedback.
5. Press `Cmd/Ctrl + Enter` or use the submit action.

Good comments are specific and actionable. Prefer "Clarify whether this command
should run before or after `rp1 init`" over "unclear".

## Comment On Code Blocks

Code blocks support the same selection flow as normal Markdown content. Select
the relevant code or output, add a comment, and submit it from the popover.

Use code-block comments for generated diffs, command examples, error snippets,
or implementation notes that need a targeted response.

## Read Existing Comments

Artifacts show subtle indicators beside annotated content. Click an indicator
to open the comment thread.

The sidebar groups comments by status:

| Section | Meaning |
|---------|---------|
| Open | Feedback that still needs attention. |
| Resolved | Feedback that has been addressed. |
| Orphaned | Feedback whose original selected text could not be found after the artifact changed. |

Clicking a sidebar item scrolls to the comment location and opens the thread.
Long comments can be expanded when the preview is truncated.

## Reply

1. Open a comment from the indicator or sidebar.
2. Enter your reply.
3. Press `Cmd/Ctrl + Enter` or choose Reply.

Replies stay in chronological order under the original comment. Use replies for
clarifying questions, decisions, or status notes.

## Resolve And Reopen

Resolve a comment when the issue has been handled:

1. Open the comment.
2. Choose Resolve.
3. Confirm that the indicator moves to the resolved state.

Reopen a resolved comment when the issue still applies or the fix needs more
work. The comment returns to the open section.

## Handle Orphaned Comments

An annotation becomes orphaned when Arcade can no longer find the original text
selection. The comment is preserved so feedback is not lost.

When you see an orphaned comment:

1. Read the original comment and nearby artifact context.
2. Search the artifact for the updated section if needed.
3. Decide whether the feedback is already addressed.
4. Reply with the new context or resolve the comment.
5. Recreate the comment on the current text if it still needs work.

## Work With Agents And Teammates

Annotations are most useful when they become part of the next workflow pass.

Typical loop:

1. You add comments to a requirements, design, task, review, or readiness
   artifact.
2. You continue the relevant workflow or ask a teammate to review the artifact.
3. The feedback is addressed in the next edit or decision.
4. The thread is replied to or resolved.

If an agent says it addressed feedback, reopen the artifact and verify the
resolved comments match the actual change.

## Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| `Cmd/Ctrl + Enter` | Comment or reply input | Submit |
| `Escape` | Popover open | Close the popover |

## Related

- [Artifact Viewer](artifact-viewer.md)
- [Dashboard](dashboard.md)
- [Feature Development Guide](../guides/feature-development.md)
- [PR Review Guide](../guides/pr-review.md)
