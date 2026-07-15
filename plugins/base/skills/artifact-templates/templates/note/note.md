---
scope: workRoot
path_pattern: "notes/{yyyy-mm-dd}-{title-slug}.md"
producer: note
type: document
description: "Structured session note with frontmatter for machine discoverability, fixed body sections, and wikilink cross-references. Written by /note after preview-confirm gate."
emit_hint: |
  rp1 agent-tools emit \
    --type artifact_registered \
    --data '{"path": "notes/{yyyy-mm-dd}-{title-slug}.md", "storageRoot": "work_dir", "format": "markdown"}'
---

---
date: {yyyy-mm-dd}
title: "{Semantic Title}"
tags:
  - {tag-1}
  - {tag-2}
related:
  - "[[{related-note-or-artifact}]]"
source_context: "{One-line summary of the session context that produced this note}"
status: active
---

## Context

{Why this note exists. One to three sentences on what prompted the capture.}

## Decisions

- {Decision statement and rationale}

## Findings

- {Key discovery, fact, or analysis result. Factual, no hedging.}

## References

- [[{related-note}]]
- [{external link title}]({url})
