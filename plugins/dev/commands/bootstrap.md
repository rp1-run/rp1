---
name: bootstrap
version: 1.0.0
description: Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development
argument-hint: "[project-name]"
tags: [greenfield, scaffolding, project, onboarding, core]
created: 2025-12-26
author: cloud-on-prem/rp1
---

# Bootstrap Command - Greenfield Project Creation

Minimal coordinator: pre-flight checks -> charter-interviewer -> bootstrap-scaffolder.

<project_name>$1</project_name>
<rp1_root>{{RP1_ROOT}}</rp1_root>

## §0 Params

| Name | Pos | Default | Purpose |
|------|-----|---------|---------|
| PROJECT_NAME | $1 | (prompted) | New project dir name |
| RP1_ROOT | env | `.rp1/` | Root dir |

## §1 Pre-Flight

```bash
ls -la
```

- **Empty**: Only `.`, `..`, `.DS_Store`, `.rp1/`, `CLAUDE.md`, `AGENTS.md`
- **Non-empty**: Contains project files -> list top 10-15

## §2 Project Name

**$1 provided**: Validate (no spaces, valid dir chars). Target: `{cwd}/{PROJECT_NAME}`

**$1 empty**: AskUserQuestion: "What would you like to name your project? Use lowercase, numbers, hyphens (e.g., my-awesome-app)."

Max 2 attempts, then abort.

## §3 Target Dir Setup

### Case A: Empty Dir

AskUserQuestion: "Current directory is empty. Create files here or subdirectory '{PROJECT_NAME}'? Reply 'here' or 'subdirectory' (1/2)."

- here/1: TARGET_DIR = cwd
- subdirectory/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case B: Non-Empty

AskUserQuestion: "Current dir has files: [list]. Project goes in ./{PROJECT_NAME}/ (won't modify existing). Proceed? (yes/no)"

- yes: TARGET_DIR = `{cwd}/{PROJECT_NAME}`
- no: Abort: "Bootstrap cancelled. cd into empty dir or provide name: /bootstrap my-project"

Create subdir if needed: `mkdir -p "{TARGET_DIR}"` (fail -> abort)

## §4 Charter Phase (Stateless)

### 4.1 Init Charter

```bash
mkdir -p "{TARGET_DIR}/{RP1_ROOT}/context"
```

Create `{TARGET_DIR}/{RP1_ROOT}/context/charter.md`:
```markdown
# Project Charter: {PROJECT_NAME}
**Version**: 1.0.0 | **Status**: Draft | **Created**: {timestamp}

## Vision
_TBD_
## Problem & Context
_TBD_
## Target Users
_TBD_
## Business Rationale
_TBD_
## Scope Guardrails
### Will Do
_TBD_
### Won't Do
_TBD_
## Success Criteria
_TBD_
## Scratch Pad
<!-- Interview state - removed on completion -->
<!-- Mode: CREATE -->
<!-- Started: {timestamp} -->
<!-- End scratch pad -->
```

### 4.2 Interview Loop

```
CHARTER_PATH = {TARGET_DIR}/{RP1_ROOT}/context/charter.md
question_count = 0

while question_count < 10:
    Task: subagent_type: rp1-dev:charter-interviewer
      prompt: CHARTER_PATH: {CHARTER_PATH}, MODE: CREATE, RP1_ROOT: {RP1_ROOT}

    response = parse_json(output)

    if response.type == "next_question":
        answer = AskUserQuestion(response.next_question)
        question_count++
        Append to scratch pad: "### Q{n}: {topic}\n**Asked**: {q}\n**Answer**: {answer}"

    elif response.type == "success":
        Update charter sections w/ response.charter_content
        Remove scratch pad section
        break

    elif response.type == "skip":
        question_count++
        Append: "### Q{n}: Skipped\n**Skipped**: {response.message}"

    elif response.type == "error":
        Output: "Charter error: {response.message}. Re-run /bootstrap to retry."
        break
```

### 4.3 Verify

`ls "{TARGET_DIR}/{RP1_ROOT}/context/charter.md"` - missing -> warn, continue

## §5 Scaffold Phase (Stateless)

### 5.1 Init Preferences

Create `{TARGET_DIR}/{RP1_ROOT}/context/preferences.md`:
```markdown
# Project Preferences
**Generated**: {timestamp} | **Status**: In Progress

## Scratch Pad
<!-- Phase: INTERVIEW -->
<!-- Questions Asked: 0 -->
<!-- Started: {timestamp} -->

### Tech Stack State
Language: [?] | Runtime: [?] | Framework: [?] | PkgMgr: [?]
Testing: [?] | Build: [?] | Lint: [?] | Format: [?]

### Q&A History
### Research Notes
<!-- End scratch pad -->
```

### 5.2 Scaffolder Loop

```
PREFS_PATH = {TARGET_DIR}/{RP1_ROOT}/context/preferences.md
question_count = 0, summary_iterations = 0

loop:
  Task: subagent_type: rp1-dev:bootstrap-scaffolder
    prompt: PROJECT_NAME, TARGET_DIR, CHARTER_PATH, PREFS_PATH, RP1_ROOT

  response = parse_json(output)

  if "next_question": ask user, question_count++, append Q&A, continue
  elif "research_ready": update phase to RESEARCH, continue
  elif "summary":
    answer = AskUserQuestion("{summary}\nProceed? Yes/No")
    if Yes: update phase to SCAFFOLD, continue
    else:
      summary_iterations++
      if >= 2: "Max revisions. Re-run /bootstrap." break
      ask what to change, record, continue
  elif "scaffold": continue
  elif "success": Output response.output, break
  elif "error": Output error, break
```

### 5.3 Verify

`ls "{TARGET_DIR}"` - confirm: package.json (or equiv), src/, tests/, README.md, AGENTS.md

## §6 Success Output

```
Bootstrap complete!
Project: {PROJECT_NAME} | Location: {TARGET_DIR}

Created: {RP1_ROOT}/context/charter.md, preferences.md, AGENTS.md, CLAUDE.md, README.md, [pkg manifest], src/, tests/

Next: cd {PROJECT_NAME}, review code, run app (see README.md)

Commands: /rp1-dev:feature-requirements, /rp1-dev:blueprint update, /rp1-base:knowledge-build
```

## §7 Anti-Loop

**Single-pass. DO NOT**:
- Ask clarification beyond defined prompts
- Loop to earlier steps
- Re-run agents after completion
- Modify files outside TARGET_DIR

**Flow**: Check dir (1x) -> Resolve name (1x, max 2 validations) -> Setup target (1x) -> charter-interviewer (1x) -> bootstrap-scaffolder (1x) -> Output -> STOP

**Errors**: Dir fail -> abort | User declines -> abort | Charter fails -> warn, continue | Scaffold fails -> report partial

Begin: check directory state, proceed through workflow.
