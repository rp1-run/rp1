# Documentation Boundary

This page records the public-docs boundary for the current documentation cleanup.
It is a maintainer reference, not a new user journey.

Use it to decide whether a page belongs in the primary user path, reference,
advanced/contributor material, or should stay out of normal navigation.

## Status Values

| Status | Meaning | Public language rule |
|--------|---------|----------------------|
| Public user | A normal rp1 user may need this page to install, choose workflows, monitor work, review PRs, onboard teammates, or recover from problems. | Explain goals, actions, decisions, and expected UI behavior. Avoid runtime, storage, and authoring vocabulary unless it directly helps the task. |
| Public reference | A command, configuration, or workflow reference that users may consult after they know their goal. | Lead with invocation, options, outputs, and recovery. Move implementation mechanics into advanced sections or separate contributor docs. |
| Advanced/reference | Useful for power users, operators, maintainers, or users debugging a specific advanced case. | Keep precision, but label the material as advanced and link back to the public task path. |
| Contributor/internal | Material for prompt, skill, agent, platform adapter, runtime, or docs-generation authors. | Do not present it as required onboarding or primary product documentation. |
| Excluded/archive | Historical, retired, generated, or asset content that should not appear in primary user navigation. | Keep only if it has archival value or is required by the site build. |

## Primary User Paths

| User goal | Primary entry points | Boundary decision |
|-----------|----------------------|-------------------|
| Set up rp1 | `docs/getting-started/index.md`, `docs/getting-started/installation.md`, `docs/getting-started/first-workflow.md` | Public user. The first path should be a checklist from install to init, context, first workflow, and Arcade visibility. |
| Ship code with rp1 | `docs/guides/feature-development.md`, `docs/reference/dev/build.md`, `docs/reference/dev/build-fast.md` | Public user plus public reference. User pages should use the current requirements, planning, implementation, release lifecycle. |
| Plan phased work | `docs/reference/dev/phase-plan.md` | Public reference. It belongs with feature development and planning, not as an internal-only page. |
| Monitor work in Arcade | `docs/arcade/index.md`, `docs/arcade/dashboard.md`, `docs/arcade/artifact-viewer.md`, `docs/arcade/annotations.md`, `docs/arcade/keyboard-shortcuts.md`, `docs/arcade/settings.md` | Public user. Explain opening runs, spotting attention, reading artifacts, following links, replying, resolving, and handling orphaned comments. |
| Review PRs | `docs/guides/pr-review.md`, `docs/guides/remote-pr-review.md`, `docs/guides/pr-feedback.md`, `docs/reference/dev/pr-review.md`, `docs/reference/dev/pr-walkthrough.md`, `docs/reference/dev/pr-visual.md`, `docs/reference/dev/address-pr-feedback.md` | Public user plus public reference. Tutorials should focus on decision flow; contract and generation details belong in advanced reference. |
| Automate CI | `docs/guides/ci-cd-integration.md`, `docs/guides/remote-pr-review.md`, `docs/reference/pr-review-config.md` | Public user plus public reference. Keep CI configuration visible without requiring workflow-runtime vocabulary. |
| Onboard a team | `docs/guides/team-onboarding.md`, `docs/guides/scaling-with-teams.md` | Public user. Teammates should get first-day actions and generated orientation before raw KB source files. |
| Install by host platform | `docs/getting-started/installation.md`, `docs/reference/cli/install.md`, `docs/reference/cli/init.md`, `docs/reference/platforms/copilot.md` | Public user plus public reference. A platform matrix should cover Claude Code, OpenCode, Codex, and GitHub Copilot CLI consistently. |
| Troubleshoot | `docs/troubleshooting/index.md` | Public user. Organize by symptoms and link to canonical install, platform, workflow, Arcade, KB/context, CI, and recovery pages. |
| Look up commands and workflows | `docs/reference/index.md`, `docs/reference/cli/index.md`, `docs/reference/base/index.md`, `docs/reference/dev/index.md` | Public reference. Group around user tasks where possible, and keep plugin taxonomy secondary. |

## Page Classification

### Public User Pages

| Page or family | Decision | Follow-up task |
|----------------|----------|----------------|
| `docs/index.md` | Public home page. Keep outcome-oriented routing. | T2, T3 |
| `docs/getting-started/index.md` | Public onboarding hub. Rework from setup-first to job-first. | T3 |
| `docs/getting-started/installation.md` | Public install path. Keep host support consistent with platform reference. | T8 |
| `docs/getting-started/first-workflow.md` | Public first-workflow path. Make context generation a means to useful workflows, not the destination. | T3 |
| `docs/guides/index.md` | Public guide hub. Must match the visible navigation and learning path. | T2 |
| `docs/guides/bootstrap.md` | Public workflow guide. Keep as a task page. | T2 |
| `docs/guides/bug-investigation.md` | Public workflow guide. Keep as a task page. | T2 |
| `docs/guides/feature-development.md` | Public workflow guide. Replace stale six-step and artifact-detector language. | T4 |
| `docs/guides/pr-review.md` | Public workflow guide. Reframe around reviewer decisions. | T7 |
| `docs/guides/remote-pr-review.md` | Public CI review guide. Keep as automation path. | T8 |
| `docs/guides/pr-feedback.md` | Public review follow-up guide. Keep as workflow path. | T7 |
| `docs/guides/team-onboarding.md` | Public team adoption guide. Lead with teammate outcomes, not raw KB reading. | T8 |
| `docs/guides/ci-cd-integration.md` | Public automation guide. Keep as CI path. | T8 |
| `docs/guides/scaling-with-teams.md` | Public team guide. Align feature lifecycle language with Build v2. | T4, T8 |
| `docs/arcade/index.md` | Public Arcade overview. Remove event plumbing from the normal user path. | T5 |
| `docs/arcade/dashboard.md` | Public Arcade monitoring guide. Replace storage/replay internals with user tasks. | T5 |
| `docs/arcade/annotations.md` | Public feedback guide. Keep create, reply, resolve, and orphan handling; route persistence details away. | T5 |
| `docs/arcade/artifact-viewer.md` | Public artifact-reading guide. Keep reading modes and links; route route templates and contracts away. | T5 |
| `docs/arcade/keyboard-shortcuts.md` | Public UI help. Keep in Arcade user docs. | T5 |
| `docs/arcade/settings.md` | Public UI help. Keep in Arcade user docs. | T5 |
| `docs/comparison/vs-raw-prompting.md` | Public positioning page. Keep outcome language. | T2 |
| `docs/troubleshooting/index.md` | Public recovery guide. Split by user symptom and deduplicate setup content. | T8 |

### Public Reference Pages

| Page or family | Decision | Follow-up task |
|----------------|----------|----------------|
| `docs/reference/index.md` | Public reference hub. Keep reachable, but make task routes primary over plugin taxonomy. | T2 |
| `docs/reference/pr-review-config.md` | Public CI and PR review configuration reference. | T8 |
| `docs/reference/cli/index.md` | Public CLI reference. Keep setup and maintenance commands discoverable. | T2 |
| `docs/reference/cli/init.md` | Public setup reference. Add Copilot consistency with install/platform docs. | T8 |
| `docs/reference/cli/install.md` | Public setup reference. Keep install and verify paths; route adapter internals to advanced platform material. | T8 |
| `docs/reference/cli/update.md` | Public maintenance reference. | T8 |
| `docs/reference/cli/rp1-migrate.md` | Public migration reference with advanced sections. Keep migration mechanics labeled as advanced. | T8 |
| `docs/reference/cli/check-update.md` | Public maintenance reference. Currently linked from the CLI index; later nav should make the status explicit. | T2 |
| `docs/reference/base/index.md` | Public reference index. Keep skill discovery, but make user outcomes clearer than plugin taxonomy. | T2 |
| `docs/reference/base/knowledge-build.md` | Public reference. Explain context generation as workflow support. | T3 |
| `docs/reference/base/deep-research.md` | Public reference. | T2 |
| `docs/reference/base/project-birds-eye-view.md` | Public reference and team-onboarding support. | T8 |
| `docs/reference/base/write-content.md` | Public reference. | T2 |
| `docs/reference/base/strategize.md` | Public reference. | T2 |
| `docs/reference/base/socratic-duel.md` | Advanced public reference. Keep debate mechanics labeled as advanced. | T2 |
| `docs/reference/base/analyse-security.md` | Public reference. Internal artifact path details should move or be minimized in public sections. | T9 |
| `docs/reference/base/fix-mermaid.md` | Public reference for docs validation. | T9 |
| `docs/reference/base/guide.md` | Public reference for capability discovery. It should be added to navigation or an appropriate reference index. | T2 |
| `docs/reference/base/self-update.md` | Public maintenance reference. | T8 |
| `docs/reference/dev/index.md` | Public development reference. Current Build v2 summary is the source for feature-lifecycle wording. | T4 |
| `docs/reference/dev/build.md` | Public reference with advanced internal sections. Keep invocation, lifecycle, resume, readiness, and outputs; route compiler/runtime internals away. | T4 |
| `docs/reference/dev/build-fast.md` | Public reference with advanced internal sections. Keep quick-iteration behavior; route builder/reviewer and cleanup-manifest internals away. | T4 |
| `docs/reference/dev/phase-plan.md` | Public planning reference. Add to visible navigation under feature development/reference. | T2 |
| `docs/reference/dev/blueprint*.md` | Public planning reference family. | T2 |
| `docs/reference/dev/feature-*.md` | Public feature-management reference family. | T4 |
| `docs/reference/dev/code-*.md` | Public code-quality reference family. Keep cleanup internals behind advanced labels. | T9 |
| `docs/reference/dev/pr-*.md`, `docs/reference/dev/address-pr-feedback.md` | Public PR reference family. Keep user output and decisions first; route artifact contracts away. | T7 |
| `docs/reference/dev/validate-hypothesis.md` | Public analysis reference. | T2 |

### Advanced Or Contributor Pages

| Page or family | Classification | Decision |
|----------------|----------------|----------|
| `docs/getting-started/rp1-directory.md` | Advanced/reference | Useful for understanding project files, but not a primary onboarding destination. Link from setup/troubleshooting when a user needs it. |
| `docs/concepts/index.md` | Public user, with split needed | The index should foreground user concepts. Move architecture-pattern cards into an advanced "How rp1 works" or contributor path. |
| `docs/concepts/constitutional-prompting.md` | Public user concept | Keep if framed as why rp1 workflows behave consistently. |
| `docs/concepts/knowledge-aware-agents.md` | Public user concept with advanced sections | Keep project-context explanation; route raw file/schema details away from onboarding. |
| `docs/concepts/command-agent-pattern.md` | Advanced/reference | Useful for understanding rp1 internals, but not required user onboarding. |
| `docs/concepts/map-reduce-workflows.md` | Advanced/reference | Keep as "How rp1 works" material, not a core user concept. |
| `docs/concepts/stateless-agents.md` | Advanced/reference | Keep as "How rp1 works" material, not a core user concept. |
| `docs/concepts/builder-reviewer-agents.md` | Advanced/reference | Keep as Build internals or "How rp1 works" material. Public Build docs should say rp1 implements and reviews task units. |
| `docs/concepts/skill-format.md` | Contributor/internal | Authoring specification for `SKILL.md`, frontmatter, workflow metadata, and state machines. Move under contributor/authoring reference or exclude from public concepts navigation. |
| `docs/reference/cli/fence-versioning.md` | Advanced/reference | Maintainer-oriented setup/migration behavior. Link from migration/check-update, not primary onboarding. |
| `docs/reference/base/work-search.md` | Advanced/reference | Agent-tool API. User-facing docs should describe searching work artifacts without `ToolResult`, SQLite FTS5, storage, or scoring contracts. |
| `docs/reference/platforms/copilot.md` | Split: public platform reference plus contributor/internal appendix | Keep install, verify, update, and troubleshooting. Move marketplace staging paths, caches, adapter handoffs, and tool mappings to advanced implementation material. |

### Excluded Or Archive Content

| Page or family | Classification | Decision |
|----------------|----------------|----------|
| `docs/retired-features.md` | Excluded/archive | Keep as a low-priority archive destination. Do not route first-time users through it. |
| `docs/assets/**`, `docs/stylesheets/**`, `docs/javascripts/**`, `docs/overrides/**`, `docs/examples/**`, `docs/CNAME`, `docs/robots.txt`, `docs/_redirects` | Excluded from page classification | Site assets, examples, and deployment files are not public documentation pages for this cleanup. |

## Ambiguous And Orphan Decisions

| Page | Current issue | Decision |
|------|---------------|----------|
| `docs/reference/dev/phase-plan.md` | Linked from dev reference and Build docs but absent from current mkdocs navigation. | Public reference. Add under feature planning/development navigation. |
| `docs/reference/base/guide.md` | Linked from reference index but absent from current mkdocs navigation. | Public reference. Add under capability discovery or reference navigation. |
| `docs/reference/cli/check-update.md` | Linked from CLI index and fence-versioning but absent from current mkdocs navigation. | Public maintenance reference. Add to CLI/reference navigation. |
| `docs/reference/cli/fence-versioning.md` | Linked from CLI index and migration docs but absent from current mkdocs navigation. | Advanced/reference. Keep reachable from CLI maintenance docs, not primary onboarding. |
| `docs/concepts/skill-format.md` | Exists under Concepts but is an authoring spec. | Contributor/internal. Move or relabel outside public Concepts. |
| `docs/reference/platforms/copilot.md` | Real platform guide but not in navigation. It also mixes setup with adapter implementation. | Split public platform setup from contributor/internal implementation details. Add public platform path. |
| `docs/reference/base/work-search.md` | Currently visible as a Base Plugin Agent Tool, but it documents a machine API. | Advanced/reference. Replace public exposure with user-language search guidance when needed. |

## Public Language Governance

Apply these rules to manually written public pages and to generated docs that
land in public user or public reference destinations.

1. Start from the page classification above. Public user pages translate or
   remove internal vocabulary; public reference pages may keep exact command
   output fields when the field is useful for automation, troubleshooting, or
   compatibility.
2. Keep exact internal names only under an advanced, troubleshooting, JSON
   output, artifact audit, or contributor heading. The nearby text must say why
   the reader may need the term.
3. Generated docs must prefer the public wording column below unless their
   destination is explicitly advanced, contributor, runtime, platform adapter,
   or machine API reference.
4. If a public page keeps an exact internal term, add a short reason such as
   "shown because this field appears in `--json` output" or "useful when
   auditing generated cleanup artifacts."

### Approved Replacement Table

| Term family | Public-docs decision | Preferred public wording |
|-------------|----------------------|--------------------------|
| `SKILL.md`, `frontmatter`, `allowed-tools`, `metadata`, `sub_agents` | Route to contributor/internal authoring docs unless the page is explicitly about authoring rp1 prompts. | "workflow instructions", "assistant permissions", "workflow configuration" |
| `run_policy`, `identity_args`, `RUN_ID`, `workflow-bootstrap`, `workflow-state`, `--include-trace` | Translate in public pages; keep exact names only in advanced runtime/reference material. `workflow-bootstrap` no longer includes invocation trace by default; use `--include-trace` to opt in. | "resume behavior", "workflow state", "active run" |
| `rp1 agent-tools emit`, `emit database`, `rp1.db`, `canonical events`, `canonical status`, `arcade_tracked`, `--batch` | Remove from Arcade user help; route runtime details to advanced/internal material. `emit` supports a `--batch` flag (JSON array inline or `"-"` for stdin) for multi-event emission in a single invocation. | "workflow progress reporting", "local activity history", "status", "tracked workflow" |
| `storageRoot`, `locationKind`, `docId`, artifact frontmatter, slide-source contracts | Remove from normal artifact help; keep in artifact contract or contributor reference. | "artifact metadata", "file artifact", "external link", "slide-ready walkthrough" |
| `ToolResult`, `SQLite FTS5`, `bm25`, JSON envelopes | Keep only in advanced tool/API reference. Agent-tool JSON output uses compact single-line formatting. `resolve-args` output contains `arguments`, `directories`, and `unresolved` fields; the `environment` field is no longer part of the response shape. | "search results", "work artifact search" |
| `schema-backed tasks.json`, `build-task-plan`, `change-manifest`, `validation envelopes` | Translate in public Build pages; keep exact terms only when users inspect generated artifacts or advanced references. | "task plan", "scoped cleanup", "validation results" |
| `namespaced subagent steps`, `task-builder`, `task-reviewer`, `comment-cleaner` | Avoid in normal user pages; mention only if explaining advanced Build internals. | "implementation pass", "review pass", "cleanup pass" |
| `param_transform`, `dispatch_agent`, `fork_context`, `harness`, file-backed JSON handoff | Contributor/internal platform compiler vocabulary. | "host-specific prompt build behavior" |
| Marketplace staging paths, plugin caches, tool-name mappings | Keep out of normal platform setup unless needed for troubleshooting. | "Copilot plugin install", "verification result", "legacy install leftovers" |

### Public Page Review Checklist

Use this checklist before publishing a public user or public reference page:

- The first screen says what the user can do, not how rp1 implements it.
- Workflow pages use requirements, planning, implementation, and release for
  Build v2 unless an advanced section is explicitly describing internals.
- Arcade pages talk about runs, artifacts, links, annotations, notifications,
  and gates, not databases, route contracts, replay cursors, or event schemas.
- Platform pages explain supported hosts, install, verify, update, and recovery
  before any staging path, cache, adapter, or generated artifact detail.
- Any exact machine field, file name, or generated artifact is either part of
  command output the user can inspect or is moved to an advanced/contributor
  destination.

## Boundary Rules For Later Edits

1. Public user pages should answer what the user can do next, how to tell whether it worked, and where to go if it did not.
2. Public reference pages may include command syntax, options, outputs, and examples, but should keep implementation details behind advanced headings or links.
3. Contributor/internal pages must be labeled as authoring, implementation, runtime, platform adapter, or maintainer material.
4. Plugin taxonomy can remain in reference material, but it should not be the primary way normal users find setup, feature work, Arcade, PR review, CI, team, or troubleshooting pages.
5. If an internal term remains on a public user page, the surrounding text must explain why the user needs it for the task at hand.
