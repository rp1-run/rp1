---
name: bootstrap
description: "Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: development
  is_workflow: false
  version: 1.0.0
  tags:
    - greenfield
    - scaffolding
    - project
    - onboarding
    - core
  created: 2025-12-26
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: PROJECT_NAME
      type: string
      required: false
      description: "New project directory name (lowercase, hyphens allowed)"
  sub_agents:
    - "rp1-dev:charter-interviewer"
    - "rp1-dev:bootstrap-scaffolder"
---

# Bootstrap Command - Greenfield Project Creation

Minimal coordinator: pre-flight checks -> charter-interviewer -> bootstrap-scaffolder.

## §1 Pre-Flight

```bash
ls -la
```

Classify directory state:

- **rp1-initialized**: Only `.`, `..`, `.DS_Store`, `.rp1/`, `CLAUDE.md`, `AGENTS.md` (user ran `rp1 init` here)
- **Empty**: Only `.`, `..`, `.DS_Store` (no rp1 files)
- **bootstrap-in-progress**: `.rp1/context/charter.md` exists (prior partial bootstrap)
- **Non-empty**: Contains project files without `.rp1/context/charter.md` -> list top 10-15

**Extract CURRENT_DIR_NAME**: basename of current working directory (e.g., `/home/user/my-app` -> `my-app`)

## §2 Project Name

**PROJECT_NAME provided**: Validate (no spaces, valid dir chars). PROJECT_NAME = PROJECT_NAME

**PROJECT_NAME empty + rp1-initialized or bootstrap-in-progress**: PROJECT_NAME = CURRENT_DIR_NAME (auto-extracted from directory basename)

**PROJECT_NAME empty + Empty/Non-empty**: {% ask_user "What would you like to name your project? Use lowercase, numbers, hyphens (e.g., my-awesome-app)." %}

Max 2 attempts for validation, then abort.

## §3 Target Dir Setup

### Case A: rp1-initialized

{% ask_user "Directory '{CURRENT_DIR_NAME}' contains rp1 configuration. Create project '{PROJECT_NAME}' here?", options: "Yes, proceed here (Recommended)", "Create subdirectory" %}

- **Yes, proceed here (Recommended)**: "Create the scaffolded project in the current directory"
- **Create subdirectory**: "Create a new subdirectory '{PROJECT_NAME}' instead"

- Yes/1: TARGET_DIR = cwd
- subdirectory/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case B: Empty Dir (no rp1 files)

{% ask_user "Current directory is empty. Create files here or subdirectory '{PROJECT_NAME}'?", options: "here", "subdirectory" %}

- here/1: TARGET_DIR = cwd
- subdirectory/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case B+: Bootstrap-in-Progress

Prior partial bootstrap detected (`.rp1/context/charter.md` exists). Inform user: "Detected an existing partial bootstrap. Resuming in current directory."

TARGET_DIR = cwd

### Case C: Non-Empty

{% ask_user "Current dir has files: [list]. Project goes in ./{PROJECT_NAME}/ (won't modify existing). Proceed?", options: "yes", "no" %}

- yes: TARGET_DIR = `{cwd}/{PROJECT_NAME}`
- no: Abort: "Bootstrap cancelled. cd into empty dir or provide name: /bootstrap my-project"

Create subdir if needed: `mkdir -p "{TARGET_DIR}"` (fail -> abort)

**Resolve paths**: `rp1Dir = {TARGET_DIR}/.rp1` then `kbRoot = {rp1Dir}/context`

## §4 Charter Phase

### 4.1 Init Charter

```bash
mkdir -p "{kbRoot}"
```

Check charter state:

```bash
if [ -f "{kbRoot}/charter.md" ]; then
  grep -q "_TBD_" "{kbRoot}/charter.md" && echo "HAS_TBD" || echo "COMPLETE"
else
  echo "ABSENT"
fi
```

**ABSENT**: Read the charter template at `plugins/base/skills/artifact-templates/templates/charter-interviewer/charter.md`. Create `{kbRoot}/charter.md` from it, filling `{Project Name}` with `{PROJECT_NAME}`, `{Date}` with today's date, and `{Draft | Complete}` with "Draft". Set CHARTER_MODE=CREATE.

**HAS_TBD**: Preserve existing `{kbRoot}/charter.md` unchanged. Set CHARTER_MODE=UPDATE.

**COMPLETE**: Charter is fully populated. Skip to §5 (no interviewer dispatch).

### 4.2 Charter Interview

Only when CHARTER_MODE is set (ABSENT or HAS_TBD path):

{% dispatch_agent "rp1-dev:charter-interviewer" %}
CHARTER_PATH={kbRoot}/charter.md, MODE={CHARTER_MODE}
{% enddispatch_agent %}

### 4.3 Verify

`ls "{kbRoot}/charter.md"` - missing -> warn, continue

## §5 Scaffold Phase

{% dispatch_agent "rp1-dev:bootstrap-scaffolder" %}
PROJECT_NAME={PROJECT_NAME}, TARGET_DIR={TARGET_DIR}, CHARTER_PATH={kbRoot}/charter.md, KB_ROOT={kbRoot}
{% enddispatch_agent %}

### 5.1 Verify

`ls "{TARGET_DIR}"` - confirm: package.json (or equiv), src/, tests/, README.md, AGENTS.md

## §6 Success Output

```
Bootstrap complete!
Project: {PROJECT_NAME} | Location: {TARGET_DIR}

Created: {kbRoot}/charter.md, {kbRoot}/preferences.md, AGENTS.md, CLAUDE.md, README.md, [pkg manifest], src/, tests/

Next: cd {PROJECT_NAME}, review code, run app (see README.md)

Commands: /rp1-dev:build, /rp1-dev:blueprint update, /rp1-base:knowledge-build
```

{% include_shared "coordinator-loop.md" %}

**File-specific constraints**:
- Do NOT modify files outside TARGET_DIR
- Do NOT re-run agents after completion

**Flow**: Check dir -> Resolve name (max 2 validations) -> Setup target -> Charter interview phase -> Scaffold phase -> Output -> STOP

**Errors**: Dir fail -> abort | User declines -> abort | Charter fails -> warn, continue | Scaffold fails -> report partial

Begin: check directory state, proceed through workflow.
