# Arcade

Arcade is rp1's browser workspace for monitoring tracked workflows, opening
their outputs, following external links, and working through feedback while the
run context stays visible.

![Arcade annotations view showing comments attached to an artifact with surrounding workflow context](../assets/screens/arcade/annotations.png)

## Start Arcade

Run Arcade from any rp1 project:

```bash
rp1 arcade
```

By default, Arcade opens in your browser at `http://localhost:7710`. The project
you start from is added to the Projects view, so you can return to its runs,
files, and artifacts later.

Useful launch commands:

```bash
rp1 arcade --status
rp1 arcade --restart
rp1 arcade --stop
rp1 arcade --port 8080
```

If the default port is already used by something else, start Arcade on another
port with `--port`. If the browser does not open automatically, copy the URL
printed by the command into your browser.

## What To Do First

| Goal | Where to go | What to check |
|------|-------------|---------------|
| See active work | Activity | Runs marked running, waiting, or failed |
| Find decisions | Notifications drawer | Action-required and attention items |
| Inspect a run | Run detail | Current status, step list, artifacts, and messages |
| Read generated work | Artifact viewer | Requirements, designs, reviews, reports, diagrams, or diffs |
| Follow outside context | Artifact list | External links such as reviewed PRs |
| Leave feedback | Annotations | Comments, replies, resolved items, and orphaned comments |
| Switch projects | Projects | Recent runs and file browser for each registered project |

## Monitor A Workflow

1. Start a tracked workflow in your coding host.
2. Open Arcade and use Activity to find the run.
3. Open the run detail view.
4. Check whether the run is running, waiting, completed, failed, cancelled, or
   inactive.
5. Use the step list to see where the workflow is.
6. Open artifacts from the right panel as they appear.
7. Use notifications when Arcade shows a decision or follow-up that needs your
   attention.

Arcade is most useful for workflows that take more than a few seconds, produce
durable artifacts, or pause for user decisions.

## Respond To Waiting Work

When a workflow needs input, Arcade marks the run as waiting and may add a
notification. Open the linked run, read the current message and artifacts, then
answer in the host conversation that started the workflow.

Common waiting moments include:

- requirements approval
- design or plan approval
- dirty worktree decisions
- manual verification
- release readiness
- archive or follow-up choices

## Read Artifacts And Links

Run details show generated files and external links together in the artifact
area. File artifacts open inside Arcade. External links open outside Arcade, so
reviewed PRs, issue trackers, and other web destinations stay in their original
tools.

Use the artifact viewer to:

- read Markdown reports and plans
- scan headings with the outline
- inspect rendered diagrams
- view JSON, diffs, and code snippets
- add or resolve annotations on supported content

See [Artifact Viewer](artifact-viewer.md) for the full reading workflow.

## Use Annotations For Feedback

Annotations attach comments to artifact text. They are useful when you want an
agent or teammate to revise a specific requirement, design decision, review
finding, or generated note.

Typical flow:

1. Select the relevant text in an artifact.
2. Add a comment.
3. Continue the workflow or ask a teammate to review it.
4. Reply in the annotation thread if more context is needed.
5. Resolve the annotation when the issue is addressed.

If the artifact changes and Arcade cannot find the original selected text, the
comment is preserved as orphaned so you can decide whether it still applies.

See [Annotations](annotations.md) for details.

## Main Surfaces

| Surface | Use it for |
|---------|------------|
| [Dashboard](dashboard.md) | Activity, filters, notifications, run details, projects, and workspaces |
| [Artifact Viewer](artifact-viewer.md) | Reading files, following links, switching views, and opening annotation tools |
| [Annotations](annotations.md) | Adding comments, replying, resolving, reopening, and handling orphaned feedback |
| [Keyboard Shortcuts](keyboard-shortcuts.md) | Moving quickly through Activity, Projects, workspaces, and overlays |
| [Settings](settings.md) | Adjusting Arcade preferences |

## Related

- [Feature Development Guide](../guides/feature-development.md)
- [PR Review Guide](../guides/pr-review.md)
- [First Workflow](../getting-started/first-workflow.md)
- [Reference Overview](../reference/index.md)
