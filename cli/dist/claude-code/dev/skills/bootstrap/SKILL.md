---
name: bootstrap
description: Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development.
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  version: 1.0.0
  tags:
    - greenfield
    - scaffolding
    - project
    - onboarding
    - core
  created: 2025-12-26
  author: cloud-on-prem/rp1
  argument-hint: "[project-name]"
  arguments:
    - name: PROJECT_NAME
      type: string
      required: false
      description: New project directory name (lowercase, hyphens allowed)
  environment:
    - name: RP1_ROOT
      source: rp1 agent-tools rp1-root-dir
      description: Root directory for rp1 project context and work artifacts
---

## 0. Resolve Arguments

Run the argument resolver to obtain all parameter values:

```bash
rp1 agent-tools resolve-args --name rp1-dev:bootstrap --args "$ARGUMENTS"
```

Parse the JSON response. Extract values from `data.arguments` and `data.environment`:

| Variable | Source |
|----------|--------|
| PROJECT_NAME | `data.arguments.PROJECT_NAME` |
| RP1_ROOT | `data.environment.RP1_ROOT` |

If `data.unresolved` is non-empty, warn the user about missing required arguments and stop.

Use these resolved values for all subsequent steps. Do not re-derive or re-parse arguments.

# Bootstrap Command - Greenfield Project Creation

Minimal coordinator: pre-flight checks -> charter-interviewer -> bootstrap-scaffolder.

## §1 Pre-Flight

```bash
ls -la
```

Classify directory state:

- **rp1-initialized**: Only `.`, `..`, `.DS_Store`, `.rp1/`, `CLAUDE.md`, `AGENTS.md` (user ran `rp1 init` here)
- **Empty**: Only `.`, `..`, `.DS_Store` (no rp1 files)
- **Non-empty**: Contains project files -> list top 10-15

**Extract CURRENT_DIR_NAME**: basename of current working directory (e.g., `/home/user/my-app` -> `my-app`)

## §2 Project Name

**PROJECT_NAME provided**: Validate (no spaces, valid dir chars). PROJECT_NAME = PROJECT_NAME

**PROJECT_NAME empty + rp1-initialized**: PROJECT_NAME = CURRENT_DIR_NAME (auto-extracted from directory basename)

**PROJECT_NAME empty + Empty/Non-empty**: AskUserQuestion: "What would you like to name your project? Use lowercase, numbers, hyphens (e.g., my-awesome-app)."

Max 2 attempts for validation, then abort.

## §3 Target Dir Setup

### Case A: rp1-initialized

AskUserQuestion: "Directory '{CURRENT_DIR_NAME}' contains rp1 configuration. Create project '{PROJECT_NAME}' here?"
Options:
- Yes, proceed here (Recommended)
- Create subdirectory

- **Yes, proceed here (Recommended)**: "Create the scaffolded project in the current directory"
- **Create subdirectory**: "Create a new subdirectory '{PROJECT_NAME}' instead"

- Yes/1: TARGET_DIR = cwd
- subdirectory/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case B: Empty Dir (no rp1 files)

AskUserQuestion: "Current directory is empty. Create files here or subdirectory '{PROJECT_NAME}'?"
Options:
- here
- subdirectory

- here/1: TARGET_DIR = cwd
- subdirectory/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case C: Non-Empty

AskUserQuestion: "Current dir has files: [list]. Project goes in ./{PROJECT_NAME}/ (won't modify existing). Proceed?"
Options:
- yes
- no

- yes: TARGET_DIR = `{cwd}/{PROJECT_NAME}`
- no: Abort: "Bootstrap cancelled. cd into empty dir or provide name: /bootstrap my-project"

Create subdir if needed: `mkdir -p "{TARGET_DIR}"` (fail -> abort)

## §4 Charter Phase (Stateless)

### 4.1 Init Charter

```bash
mkdir -p "{TARGET_DIR}/{{$RP1_ROOT}}/context"
```

Create `{TARGET_DIR}/{{$RP1_ROOT}}/context/charter.md`:

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

CHARTER_PATH = `{TARGET_DIR}/{{$RP1_ROOT}}/context/charter.md`
question_count = 0

while question_count < 10:
    Task tool:
subagent_type: rp1-dev:charter-interviewer
prompt:
CHARTER_PATH: {CHARTER_PATH}, MODE: CREATE, RP1_ROOT: {{$RP1_ROOT}}

    response = parse_json(output)

    if response.type == "next_question":
        answer = AskUserQuestion: "response.next_question"
        question_count++
        Append to scratch pad: `### Q{n}: {topic}` / `**Asked**: {q}` / `**Answer**: {answer}`

    elif response.type == "success":
        Update charter sections w/ response.charter_content
        Remove scratch pad section
        break

    elif response.type == "skip":
        question_count++
        Append: `### Q{n}: Skipped` / `**Skipped**: {response.message}`

    elif response.type == "error":
        Output: "Charter error: {response.message}. Re-run /bootstrap to retry."
        break

### 4.3 Verify

`ls "{TARGET_DIR}/{{$RP1_ROOT}}/context/charter.md"` - missing -> warn, continue

## §5 Scaffold Phase (Stateless)

### 5.1 Init Preferences

Create `{TARGET_DIR}/{{$RP1_ROOT}}/context/preferences.md`:

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

PREFS_PATH = `{TARGET_DIR}/{{$RP1_ROOT}}/context/preferences.md`
question_count = 0, summary_iterations = 0

loop:
  Task tool:
subagent_type: rp1-dev:bootstrap-scaffolder
prompt:
PROJECT_NAME, TARGET_DIR, CHARTER_PATH, PREFS_PATH, RP1_ROOT

  response = parse_json(output)

  if "next_question":
    answer = AskUserQuestion: "response.next_question"
    question_count++
    Append to scratch pad: `### Q{n}: {topic}` / `**Asked**: {q}` / `**Answer**: {answer}`
    continue
  elif "research_ready": update phase to RESEARCH, continue
  elif "summary":
    answer = AskUserQuestion: "{summary} Proceed?"
Options:
- Yes
- No
    if Yes: update phase to SCAFFOLD, continue
    else:
      summary_iterations++
      if >= 2: "Max revisions. Re-run /bootstrap." break
      answer = AskUserQuestion: "What would you like to change?"
      Append to scratch pad: `### Revision: {answer}`
      continue
  elif "scaffold": continue
  elif "success": Output response.output, break
  elif "error": Output error, break

### 5.3 Verify

`ls "{TARGET_DIR}"` - confirm: package.json (or equiv), src/, tests/, README.md, AGENTS.md

## §6 Success Output

```
Bootstrap complete!
Project: {PROJECT_NAME} | Location: {TARGET_DIR}

Created: {{$RP1_ROOT}}/context/charter.md, preferences.md, AGENTS.md, CLAUDE.md, README.md, [pkg manifest], src/, tests/

Next: cd {PROJECT_NAME}, review code, run app (see README.md)

Commands: /rp1-dev:build, /rp1-dev:blueprint update, /rp1-base:knowledge-build
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