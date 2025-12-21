---
name: blueprint
version: 2.0.0
description: Guided wizard that captures project vision through a two-tier document hierarchy (charter + PRDs) to bridge the gap between idea and feature requirements.
argument-hint: "[prd-name]"
tags:
  - planning
  - project
  - charter
  - prd
  - onboarding
  - core
created: 2025-11-30
author: cloud-on-prem/rp1
---

# Project Blueprint - Vision Capture

Launch the blueprint wizard to capture and structure your project vision through guided questioning.

## Usage

**Default Flow** (creates charter + main PRD together):
```
/rp1-dev:blueprint
```

**Named PRD Flow** (requires existing charter):
```
/rp1-dev:blueprint mobile-app
/rp1-dev:blueprint api
/rp1-dev:blueprint web
```

## Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| PRD_NAME | $1 | (none) | Name of PRD to create (omit for default flow) |
| EXTRA_CONTEXT | $ARGUMENTS | `""` | Additional context from user |

## Document Hierarchy

The blueprint command creates a two-tier document hierarchy:

1. **Charter** (`{RP1_ROOT}/context/charter.md`) - Single project-level document capturing:
   - Problem & context (why)
   - Target users (who)
   - Business rationale
   - Scope guardrails
   - Success criteria

2. **PRDs** (`{RP1_ROOT}/work/prds/<name>.md`) - Surface-specific documents capturing:
   - Surface overview
   - In/out scope
   - Requirements
   - Dependencies
   - Timeline

PRDs inherit from the charter and link back to it, avoiding content duplication.

## Workflow

Use the Task tool with:
- **subagent_type**: `rp1-dev:blueprint-wizard`
- **prompt**: Include PRD_NAME ($1) and EXTRA_CONTEXT ($ARGUMENTS)

```
Launch the blueprint wizard to guide the user through project definition.

Parameters:
- PRD_NAME: $1 (empty = default flow creating charter + main PRD)
- EXTRA_CONTEXT: $ARGUMENTS

The wizard will:
1. Scan existing context (README, docs, KB if available)
2. Detect mode (default vs named PRD)
3. Guide through 5 charter sections (if default flow)
4. Guide through 5 PRD sections
5. Generate charter at {RP1_ROOT}/context/, PRDs at {RP1_ROOT}/work/prds/

Execute the blueprint-wizard workflow immediately.
```

## Next Steps

After completing blueprint:
- Use `/rp1-dev:feature-requirements <feature-id>` to define specific features
- Features can optionally associate with a parent PRD for context inheritance
