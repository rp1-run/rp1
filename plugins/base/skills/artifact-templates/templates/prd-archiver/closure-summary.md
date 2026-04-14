---
scope: workRoot
path_pattern: "archives/prds/{PRD_NAME}/closure-summary.md"
producer: prd-archiver
type: document
description: "Closure summary generated when archiving a completed PRD. Written by /blueprint-archive."
strictness: flexible
---

# Closure Summary: {PRD Title}

**PRD**: {PRD_NAME}
**Archived**: {YYYY-MM-DD}
**Status**: {Complete | Partial}
**Archived By**: rp1 /blueprint-archive

## Associated Features

| Feature | Status | Archive Location |
|---------|--------|------------------|
| {feature-id} | Archived | archives/features/{feature-id}/ |
| {feature-id} | In Progress | features/{feature-id}/ (not archived) |

## Objectives Summary

{First 2-3 sentences from PRD Overview}

## Gaps (Partial Closure Only)

{GAPS parameter content, or omit section if CLOSURE_STATUS=complete}

## KB Update Status

{PRD concepts found in KB | Suggest running /knowledge-build}

## Original Location

- PRD: prds/{PRD_NAME}.md
