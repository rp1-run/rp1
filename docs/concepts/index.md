# Concepts

These concepts explain the parts of rp1 that normal users interact with:
workflows, projects, context, artifacts, Arcade, reviews, and team handoffs.
You do not need to understand rp1 prompt authoring or runtime internals to use
the product.

---

<div class="grid cards" markdown>

-   :material-play-circle: **Workflows**

    ---

    A workflow is a guided path for a job such as shipping a feature, reviewing a PR, investigating a bug, or generating project context.

    [:octicons-arrow-right-24: Learn more](constitutional-prompting.md)

-   :material-folder-search: **Project Context**

    ---

    Project context gives rp1 enough knowledge about your codebase to follow its architecture, language, and patterns.

    [:octicons-arrow-right-24: Learn more](knowledge-aware-agents.md)

-   :material-file-document: **Artifacts**

    ---

    Workflows leave durable files behind: requirements, designs, task lists, reports, reviews, walkthroughs, and readiness notes.

    [:octicons-arrow-right-24: Read artifacts in Arcade](../arcade/artifact-viewer.md)

-   :material-view-dashboard: **Arcade**

    ---

    Arcade shows active and completed workflows, attention needed, artifacts, links, and comments in one place.

    [:octicons-arrow-right-24: Monitor work](../arcade/index.md)

-   :material-source-pull: **Reviews**

    ---

    PR review workflows produce findings and walkthroughs so you can decide whether to proceed, fix, or ask for a deeper look.

    [:octicons-arrow-right-24: Review PRs](../guides/pr-review.md)

-   :material-account-group: **Teams**

    ---

    Shared project context and artifacts help teammates understand what was planned, changed, reviewed, and released.

    [:octicons-arrow-right-24: Onboard a team](../guides/team-onboarding.md)

</div>

---

## Core User Concepts

| Concept | What It Is | Why It Matters |
|---------|-----------|----------------|
| [Workflows](constitutional-prompting.md) | Job-specific commands with built-in guidance | You can run a short command and get a consistent path through planning, implementation, review, or analysis |
| [Project context](knowledge-aware-agents.md) | Generated knowledge about your codebase | rp1 can follow your project structure, terminology, and patterns |
| Artifacts | Files created by workflows | You can inspect, share, resume, and review work after the chat session ends |
| Arcade | Local dashboard for workflow activity | You can see running work, attention needed, artifacts, links, and comments |
| Reviews | PR analysis and walkthrough outputs | You can decide whether to approve, request changes, or investigate |
| Teams | Shared context and handoff material | Teammates can see the same project understanding and delivery artifacts |

---

## Where to Start

**New to rp1?** Start with [Getting Started](../getting-started/index.md), then read [Consistent Workflows](constitutional-prompting.md) to understand why rp1 workflows feel more structured than ad-hoc prompting.

**Want output that fits your codebase?** Read [Project Context](knowledge-aware-agents.md) to learn how `knowledge-build` supports later workflows.

**Using Arcade?** See [Arcade](../arcade/index.md), [Artifact Viewer](../arcade/artifact-viewer.md), and [Annotations](../arcade/annotations.md).

**Reviewing PRs?** See the [PR Review Guide](../guides/pr-review.md) and [PR Review Reference](../reference/dev/pr-review.md).

**Onboarding teammates?** See [Team Onboarding](../guides/team-onboarding.md) and [`project-birds-eye-view`](../reference/base/project-birds-eye-view.md).

