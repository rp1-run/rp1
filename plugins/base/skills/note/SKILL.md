---
name: note
description: "Capture session context as a structured, frontmatter-rich markdown note under .rp1/work/notes/ with auto-maintained index and log."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: knowledge
  is_workflow: false
  version: 1.0.0
  tags:
    - core
    - knowledge
    - notes
  created: 2026-06-10
  author: cloud-on-prem/rp1
  arguments:
    - name: TOPIC
      type: string
      required: false
      description: "Optional topic hint to guide note generation"
      aliases:
        - "topic"
        - "about"
        - "subject"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Skip preview-confirm gate; auto-write with logged decision"
      aliases:
        - "afk"
        - "no prompts"
        - "unattended"
---

# Note Capture

Distill session context into a succinct, frontmatter-rich markdown note. One note per invocation. Notes persist under `.rp1/work/notes/` w/ auto-maintained index and append-only log.

## Directories

Use the pre-resolved `workRoot` from the generated Resolve Arguments section. All note paths resolve against `workRoot` -- never relative to a worktree.

Set `NOTES_DIR` = `{workRoot}/notes`.

## Load Template

Read the note template for format reference:

```
plugins/base/skills/artifact-templates/templates/note/note.md
```

Use this template as the canonical structure for the note file. Do not deviate from the frontmatter schema or section order.

## Generate Note

### Semantic Title

Derive a descriptive title from session context (or TOPIC if provided). The title MUST communicate the note's subject at a glance.

- Good: "API Rate Limiting Decision", "Memory Leak Root Cause in Worker Pool"
- Bad: "Session Notes 2026-06-10", "Various Decisions"

### Slug

Slugify title: lowercase, hyphens for spaces, strip non-alphanumeric chars.

File path: `{NOTES_DIR}/{yyyy-mm-dd}-{title-slug}.md`

### Frontmatter

Populate all required fields per template:

| Field | Source |
|-------|--------|
| `date` | Today (YYYY-MM-DD) |
| `title` | Generated semantic title |
| `tags` | Inferred from session context; 2-5 tags |
| `related` | Wikilink cross-references to relevant notes/artifacts (see below) |
| `source_context` | One-line summary of session context |
| `status` | `active` (always) |

### Cross-References

Infer `related` entries from session context:

- Other notes on related topics -> `[[{note-filename-without-ext}]]`
- Feature artifacts -> relative path from notes dir (eg `../features/rp1-note/requirements.md`)
- PRs, research reports, or other work artifacts -> wikilink or relative path

Include only contextually evident references. Do not fabricate connections.

### Body Sections

Four fixed sections. Omit any section w/ no content for this session.

| Section | Content |
|---------|---------|
| **Context** | Why this note exists. 1-3 sentences. |
| **Decisions** | Bullet list: each item states decision + rationale. |
| **Findings** | Bullet list: key discoveries/facts. Factual, no hedging. |
| **References** | Wikilinks and URLs only; no prose. |

### Succinctness Discipline

MUST capture only the essence: decisions, rationale, findings, actionable links. Drop transcript noise, hedging, conversational back-and-forth, verbose restatements. Each section serves a distinct purpose -- no overlap.

## Preview-Confirm Gate

**If AFK=false** (default, interactive):

1. Present the complete note (frontmatter + body) to the user.
2. Ask: "Write this note to `{file path}`? (confirm / edit / cancel)"
3. On confirm -> proceed to Write.
4. On edit -> incorporate feedback, re-present preview. Repeat until confirmed or cancelled.
5. On cancel -> exit cleanly. No files written. Report: "Note capture cancelled."

**If AFK=true**:

1. Log: "AFK mode: skipped preview-confirm gate; note auto-written."
2. Proceed directly to Write.

## Write Note

1. Ensure `{NOTES_DIR}` directory exists (create if absent).
2. Write the note file to `{NOTES_DIR}/{yyyy-mm-dd}-{title-slug}.md`.

## Update Index

File: `{NOTES_DIR}/index.md`

If absent, create w/ header:

```markdown
# Notes Index

| Date | Title | Tags | Summary |
|------|-------|------|---------|
```

Insert new entry at the top of the table body (below header row). Format:

```
| {yyyy-mm-dd} | [{title}]({filename}) | {comma-separated tags} | {one-line summary} |
```

Existing entries MUST remain unmodified.

## Update Log

File: `{NOTES_DIR}/log.md`

If absent, create w/ header:

```markdown
# Notes Log
```

Append new entry at end of file:

```
- {yyyy-mm-dd} | {title} | {capture reason -- one line explaining why this note was captured}
```

Existing entries MUST remain unmodified.

## Output

Report to the user:

```
Note captured: {title}
Path: {workRoot}/notes/{yyyy-mm-dd}-{title-slug}.md
Tags: {tags}
Index: updated
Log: appended
```
