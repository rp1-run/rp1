---
name: artifact-templates
description: "Agent-only canonical output templates for rp1 artifacts. Load when producing structured markdown to ensure format consistency and routing metadata."
metadata:
  category: knowledge
  is_workflow: false
  user_invocable: false
---

# Artifact Templates

Centralized output templates for all rp1 artifact types. Agents read templates to produce correctly formatted, correctly routed artifacts.

## Usage

1. Read this SKILL.md to find the template for your artifact type in the index below.
2. Read the template file at the listed path (relative to this skill directory).
3. Fill placeholders (`{FEATURE_ID}`, `{Date}`, `[bracketed text]`) with actual values.
4. Write the artifact to the location specified by `scope` + `path_pattern`.
5. If the template includes `emit_hint`, the producer MUST register the artifact after writing it.

Templates contain YAML frontmatter with routing metadata and a markdown body with the artifact format. Section-level templates (`type: section`) are appended to existing files, not written as standalone documents.

Active `/build` artifacts are producer-owned: the agent that writes the artifact registers that exact path with explicit `storageRoot`. Do not recover active build artifacts by directory scan. Do not generate or register legacy `tracker.md` or `milestone-*.md` artifacts for new work.

## Template Index

| Producer | Artifact | Type | Scope | Path Pattern | Template Path |
|----------|----------|------|-------|--------------|---------------|
| feature-requirement-gatherer | requirements.md | document | workRoot | features/{FEATURE_ID}/requirements.md | templates/feature-requirement-gatherer/requirements.md |
| feature-architect | design.md | document | workRoot | features/{FEATURE_ID}/design.md | templates/feature-architect/design.md |
| feature-architect | design-decisions.md | document | workRoot | features/{FEATURE_ID}/design-decisions.md | templates/feature-architect/design-decisions.md |
| feature-tasker | tasks.md | document | workRoot | features/{FEATURE_ID}/tasks.md | templates/feature-tasker/tasks.md |
| feature-tasker | tasks.json | data | workRoot | features/{FEATURE_ID}/tasks.json | templates/feature-tasker/tasks.json |
| feature-verifier | verification-report.md | document | workRoot | features/{FEATURE_ID}/feature_verification_{N}.md | templates/feature-verifier/verification-report.md |
| build-verify-aggregator | build-readiness.md | document | workRoot | features/{FEATURE_ID}/build-readiness.md | templates/build-verify-aggregator/build-readiness.md |
| feature-editor | edit-marker | section | workRoot | features/{FEATURE_ID}/requirements.md (append) | templates/_sections/edit-marker.md |
| hypothesis-tester | hypothesis-document.md | document | workRoot | features/{FEATURE_ID}/hypotheses.md | templates/hypothesis-tester/hypothesis-document.md |
| research-reporter | research-report.md | document | workRoot | research/{YYYY-MM-DD}-{TOPIC_SLUG}.md | templates/research-reporter/research-report.md |
| project-documenter | birds-eye-view.md | document | workRoot | birds-eye/{YYYY-MM-DD}-{PROJECT_SLUG}.md | templates/project-documenter/birds-eye-view.md |
| security-validator | security-report.md | document | workRoot | security/{REPORT_ID}/report.md | templates/security-validator/security-report.md |
| pr-review-reporter | pr-review-report.md | document | workRoot | pr-reviews/{REVIEW_ID}-review-{NNN}.md | templates/pr-review-reporter/pr-review-report.md |
| pr-walkthrough-reporter | pr-walkthrough.md | document | workRoot | pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md | templates/pr-walkthrough-reporter/pr-walkthrough.md |
| pr-feedback-collector | pr-feedback-tasks.md | document | workRoot | pr-reviews/{IDENTIFIER}-feedback-{NNN}.md | templates/pr-feedback-collector/pr-feedback-tasks.md |
| code-auditor | audit-report.md | document | workRoot | audits/{SCOPE}/report.md | templates/code-auditor/audit-report.md |
| bug-investigator | investigation-report.md | document | workRoot | investigations/{BUG_ID}/report.md | templates/bug-investigator/investigation-report.md |
| build-fast-planner | quick-build.md | document | workRoot | quick-builds/{ID}/quick-build.md | templates/build-fast-planner/quick-build.md |
| socratic-duel | managed-debate-region | section | absolute | {TARGET_PATH} (managed region) | templates/socratic-duel/managed-debate-region.md |
| socratic-duel | debate-artifact.md | document | workRoot | debates/{YYYY-MM-DD}-{TOPIC_SLUG}{UNIQUE_SUFFIX}.md | templates/socratic-duel/debate-artifact.md |
| phase-planner | phase-plan.md | document | workRoot | {PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} | templates/phase-planner/phase-plan.md |
| blueprint-wizard | prd.md | document | workRoot | prds/{PRD_NAME}.md | templates/blueprint-wizard/prd.md |
| blueprint-auditor | prd-audit-results.md | document | workRoot | prds/{PRD_NAME}-audit.md | templates/blueprint-auditor/prd-audit-results.md |
| prd-archiver | closure-summary.md | document | workRoot | archives/prds/{PRD_NAME}/closure-summary.md | templates/prd-archiver/closure-summary.md |
| charter-interviewer | charter.md | document | kbRoot | charter.md | templates/charter-interviewer/charter.md |
| speedrun | session-log.md | document | workRoot | speedrun/{SESSION_ID}/log.md | templates/speedrun/session-log.md |
| task-builder | implementation-summary | section | workRoot | features/{FEATURE_ID}/tasks.md (append) | templates/_sections/implementation-summary.md |
| task-reviewer | verification | section | workRoot | features/{FEATURE_ID}/tasks.md (append) | templates/_sections/verification.md |
| knowledge-base | index.md | document | kbRoot | index.md | templates/knowledge-base/single-project/index.md |
| knowledge-base | concept_map.md | document | kbRoot | concept_map.md | templates/knowledge-base/single-project/concept_map.md |
| knowledge-base | architecture.md | document | kbRoot | architecture.md | templates/knowledge-base/single-project/architecture.md |
| knowledge-base | interaction-model.md | document | kbRoot | interaction-model.md | templates/knowledge-base/single-project/interaction-model.md |
| knowledge-base | modules.md | document | kbRoot | modules.md | templates/knowledge-base/single-project/modules.md |
| knowledge-base | patterns.md | document | kbRoot | patterns.md | templates/knowledge-base/single-project/patterns.md |
| knowledge-base | index.md (monorepo) | document | kbRoot | index.md | templates/knowledge-base/monorepo/index.md |
| knowledge-base | concept_map.md (monorepo) | document | kbRoot | concept_map.md | templates/knowledge-base/monorepo/concept_map.md |
| knowledge-base | architecture.md (monorepo) | document | kbRoot | architecture.md | templates/knowledge-base/monorepo/architecture.md |
| knowledge-base | interaction-model.md (monorepo) | document | kbRoot | interaction-model.md | templates/knowledge-base/monorepo/interaction-model.md |
| knowledge-base | modules.md (monorepo) | document | kbRoot | modules.md | templates/knowledge-base/monorepo/modules.md |
| knowledge-base | patterns.md (monorepo) | document | kbRoot | patterns.md | templates/knowledge-base/monorepo/patterns.md |
| knowledge-base | dependencies.md (monorepo) | document | kbRoot | dependencies.md | templates/knowledge-base/monorepo/dependencies.md |
| knowledge-base | technology-matrix.md (monorepo) | document | kbRoot | technology-matrix.md | templates/knowledge-base/monorepo/technology-matrix.md |
| knowledge-base | state.json | data | kbRoot | state.json | templates/knowledge-base/state.json |
| knowledge-base | meta.json | data | kbRoot | meta.json | templates/knowledge-base/meta.json |
| note | note.md | document | workRoot | notes/{yyyy-mm-dd}-{title-slug}.md | templates/note/note.md |
| prompt-eval-builder | promptfoo-config | document | - | (agent-determined) | templates/prompt-eval-builder/promptfoo-config.yaml |
| tech-debt-collector | report.md | document | workRoot | features/tech-debt-collector/report.md | templates/tech-debt-collector/report.md |

For Socratic Duel, `managed-debate-region` is retained for legacy in-progress duels. New artifact-backed runs use `debate-artifact.md` under `workRoot`.

## Template Frontmatter Schema

Each template file contains YAML frontmatter with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | enum | Yes | `workRoot`, `kbRoot`, or `absolute` -- base directory for the artifact; `absolute` uses `path_pattern` as a caller-resolved path |
| `path_pattern` | string | Yes | Relative path from scope root with `{PLACEHOLDER}` variables |
| `producer` | string | Yes | Canonical name of the agent or skill that produces this artifact |
| `type` | enum | Yes | `document` (standalone file), `section` (appended to existing), or `data` (JSON/YAML) |
| `description` | string | Yes | When to use this template; one sentence |
| `strictness` | enum | No | `strict` (exact structure required) or `flexible` (guidance, agents may adapt). Default: `strict` |
| `emit_hint` | string | No | Suggested `rp1 agent-tools emit` command for artifact registration |
| `conditions` | list | No | Conditions under which sections are included/excluded |

## KB Templates

Templates under `templates/knowledge-base/` are organized by project type:

- **`single-project/`**: Standard single-project KB documentation (index, concept_map, architecture, interaction-model, modules, patterns)
- **`monorepo/`**: Multi-project KB documentation (adds dependencies, technology-matrix)
- **`state.json`**: KB metadata tracking template
- **`meta.json`**: Local-only values template (not committed)

See `references/REFERENCE.md` for detailed KB template customization guide and `references/EXAMPLES.md` for filled-in examples.

## Directory Layout

```
templates/
+-- _sections/                        # Section-level templates (type: section)
|   +-- edit-marker.md
|   +-- implementation-summary.md
|   +-- verification.md
+-- blueprint-auditor/
+-- blueprint-wizard/
+-- bug-investigator/
+-- build-verify-aggregator/
+   +-- build-readiness.md
+-- build-fast-planner/
+-- charter-interviewer/
+-- code-auditor/
+-- feature-architect/
|   +-- design.md
|   +-- design-decisions.md
+-- feature-requirement-gatherer/
+-- feature-tasker/
|   +-- tasks.md
|   +-- tasks.json
+-- feature-verifier/
+-- hypothesis-tester/
+-- knowledge-base/
|   +-- meta.json
|   +-- state.json
|   +-- monorepo/
|   +-- single-project/
+-- note/
|   +-- note.md
+-- phase-planner/
+-- pr-feedback-collector/
+-- pr-review-reporter/
+-- pr-walkthrough-reporter/
+-- prd-archiver/
+-- project-documenter/
|   +-- birds-eye-view.md
+-- prompt-eval-builder/
+-- research-reporter/
+-- security-validator/
+-- socratic-duel/
|   +-- debate-artifact.md
|   +-- managed-debate-region.md
+-- speedrun/
```
