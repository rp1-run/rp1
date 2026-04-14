---
name: artifact-templates
description: "Agent-only reference providing canonical output templates for all rp1 artifacts (requirements, design, tasks, reports, KB docs). Load when producing any structured markdown artifact to ensure format consistency and correct routing metadata. Not user-invocable -- agents read the index to find the right template, then read the template file via the Read tool."
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
5. If the template includes an `emit_hint` in its frontmatter, use it to register the artifact.

Templates contain YAML frontmatter with routing metadata and a markdown body with the artifact format. Section-level templates (`type: section`) are appended to existing files, not written as standalone documents.

## Template Index

| Producer | Artifact | Type | Scope | Path Pattern | Template Path |
|----------|----------|------|-------|--------------|---------------|
| feature-requirement-gatherer | requirements.md | document | workRoot | features/{FEATURE_ID}/requirements.md | templates/feature-requirement-gatherer/requirements.md |
| feature-architect | design.md | document | workRoot | features/{FEATURE_ID}/design.md | templates/feature-architect/design.md |
| feature-architect | design-decisions.md | document | workRoot | features/{FEATURE_ID}/design-decisions.md | templates/feature-architect/design-decisions.md |
| feature-tasker | tasks.md | document | workRoot | features/{FEATURE_ID}/tasks.md | templates/feature-tasker/tasks.md |
| feature-tasker | tracker.md | document | workRoot | features/{FEATURE_ID}/tracker.md | templates/feature-tasker/tracker.md |
| feature-verifier | verification-report.md | document | workRoot | features/{FEATURE_ID}/feature_verification_{N}.md | templates/feature-verifier/verification-report.md |
| feature-editor | edit-marker | section | workRoot | features/{FEATURE_ID}/requirements.md (append) | templates/_sections/edit-marker.md |
| hypothesis-tester | hypothesis-document.md | document | workRoot | features/{FEATURE_ID}/hypotheses.md | templates/hypothesis-tester/hypothesis-document.md |
| research-reporter | research-report.md | document | workRoot | research/{TOPIC}/report.md | templates/research-reporter/research-report.md |
| security-validator | security-report.md | document | workRoot | security/{FEATURE_ID}/report.md | templates/security-validator/security-report.md |
| pr-review-reporter | pr-review-report.md | document | workRoot | pr-reviews/{REVIEW_ID}-review-{NNN}.md | templates/pr-review-reporter/pr-review-report.md |
| pr-feedback-collector | pr-feedback-tasks.md | document | workRoot | pr-reviews/{IDENTIFIER}-feedback-{NNN}.md | templates/pr-feedback-collector/pr-feedback-tasks.md |
| code-auditor | audit-report.md | document | workRoot | audits/{SCOPE}/report.md | templates/code-auditor/audit-report.md |
| bug-investigator | investigation-report.md | document | workRoot | investigations/{BUG_ID}/report.md | templates/bug-investigator/investigation-report.md |
| build-fast-planner | quick-build.md | document | workRoot | quick-builds/{ID}/quick-build.md | templates/build-fast-planner/quick-build.md |
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
| prompt-eval-builder | promptfoo-config | document | - | (agent-determined) | templates/prompt-eval-builder/promptfoo-config.yaml |

## Template Frontmatter Schema

Each template file contains YAML frontmatter with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | enum | Yes | `workRoot` or `kbRoot` -- base directory for the artifact |
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
+-- build-fast-planner/
+-- charter-interviewer/
+-- code-auditor/
+-- feature-architect/
|   +-- design.md
|   +-- design-decisions.md
+-- feature-requirement-gatherer/
+-- feature-tasker/
|   +-- tasks.md
|   +-- tracker.md
+-- feature-verifier/
+-- hypothesis-tester/
+-- knowledge-base/
|   +-- meta.json
|   +-- state.json
|   +-- monorepo/
|   +-- single-project/
+-- pr-feedback-collector/
+-- pr-review-reporter/
+-- prd-archiver/
+-- prompt-eval-builder/
+-- research-reporter/
+-- security-validator/
+-- speedrun/
```
