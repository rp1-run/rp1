---
name: bootstrap
description: "Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development."
allowed-tools: Bash(echo *), Bash(rp1 *), Bash(git *)
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

### 1.1 Marker Discovery

Scan cwd and immediate child directories for bootstrap recovery markers.

**Check cwd**:

```bash
rp1 agent-tools bootstrap-state read --target-dir "$(pwd)"
```

**Check immediate children** (each direct subdirectory):

```bash
for child in */; do
  [ -d "$child" ] || continue
  CHILD_ABS="$(cd "$child" && pwd)"
  rp1 agent-tools bootstrap-state read --target-dir "$CHILD_ABS"
done
```

Each successful read returns JSON with `data.valid` (true or false). Commands that exit non-zero (no marker file) produce no candidate.

Classify results into two lists:
- **valid_markers**: entries where `data.valid === true` -- record `projectName` and `targetDir` from `data.state`
- **invalid_markers**: entries where `data.valid === false` -- surface a warning with the error type and message; invalid markers NEVER trigger automatic resume

### 1.2 Classification

Apply marker-first precedence:

- **Exactly one valid marker**: Classification is **bootstrap-in-progress**. Takes PRECEDENCE over rp1-initialized, Empty, Non-empty, and all other classifications. Set RESUME_PROJECT_NAME and RESUME_TARGET_DIR from the marker's `data.state`. Skip to §2 (Case B+).
- **Multiple valid markers**: Selecting which bootstrap to resume is a PARENT-coordinator prompt, not a sub-agent dispatch, so it works on every interactive harness (relay platforms included). Do NOT use a build-time option tag here — the candidates exist only at runtime, so a compiled tag renders placeholder options (and breaks selection on relay harnesses). Instead, prompt at runtime:

  1. Enumerate the validated markers from §1.1 as a bounded numbered list, one per line: `N) {projectName} at {targetDir}`.
  2. Ask the user to reply with the number of the bootstrap to resume, using your harness's normal way of prompting the parent coordinator for input (e.g. a selection prompt on Claude Code; a plain numbered question the user answers in their next turn on relay harnesses).
  3. Validate the reply is an integer within range against the current candidate set. On a non-numeric or out-of-range reply, re-prompt once, then treat as no selection.
  4. Set the chosen candidate as the active marker; skip to §2 (Case B+).

  Reserve aborting for genuinely non-interactive execution (AFK / no TTY to prompt): print "Multiple partial bootstrap markers found. Re-run interactively or remove stale markers:" followed by each candidate's projectName and targetDir.
- **Zero valid markers**: Proceed with normal directory classification below.

Normal directory classification (zero valid markers only):

- **rp1-initialized**: Only `.`, `..`, `.DS_Store`, `.rp1/`, `CLAUDE.md`, `AGENTS.md` (user ran `rp1 init` here)
- **Empty**: Only `.`, `..`, `.DS_Store` (no rp1 files)
- **Non-empty**: Contains other project files -> list top 10-15

**Extract CURRENT_DIR_NAME**: basename of current working directory (e.g., `/home/user/my-app` -> `my-app`)

## §2 Project Name

**PROJECT_NAME provided**: Validate (no spaces, valid dir chars). PROJECT_NAME = PROJECT_NAME

**PROJECT_NAME empty + rp1-initialized**: PROJECT_NAME = CURRENT_DIR_NAME (auto-extracted from directory basename)

**PROJECT_NAME empty + bootstrap-in-progress**: Skip; PROJECT_NAME restored from marker in §3 (Case B+)

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

Prior partial bootstrap detected via marker discovery (§1.1). The validated read result provides the recovery state.

Set PROJECT_NAME = RESUME_PROJECT_NAME and TARGET_DIR = RESUME_TARGET_DIR from the validated marker. Inform user: "Detected an existing partial bootstrap. Resuming with project '{PROJECT_NAME}' in {TARGET_DIR}."

### Case C: Non-Empty

{% ask_user "Current dir has files: [list]. Project goes in ./{PROJECT_NAME}/ (won't modify existing). Proceed?", options: "yes", "no" %}

- yes: TARGET_DIR = `{cwd}/{PROJECT_NAME}`
- no: Abort: "Bootstrap cancelled. cd into empty dir or provide name: /bootstrap my-project"

Create subdir if needed: `mkdir -p "{TARGET_DIR}"` (fail -> abort)

**Resolve paths**: `rp1Dir = {TARGET_DIR}/.rp1` then `kbRoot = {rp1Dir}/context`

**Write bootstrap marker** (Cases A, B, C only; B+ already has it):

```bash
rp1 agent-tools bootstrap-state write --project-name "{PROJECT_NAME}" --target-dir "{TARGET_DIR}"
```

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

Run the scaffold completeness probe:

```bash
rp1 agent-tools scaffold-probe --target-dir "{TARGET_DIR}"
```

Parse the JSON result. The probe checks four points: git-commit, package-manifest, source-entry, test-file. Each point reports `pass` (true/false) and `detail`.

## §6 Completion

**If scaffold-probe passed** (all four points pass):

Delete the bootstrap marker:

```bash
rp1 agent-tools bootstrap-state delete --target-dir "{TARGET_DIR}"
```

Then verify the marker left the worktree clean — it must have been gitignored (see scaffolder §5.3), so its deletion is invisible to git and produces no tracked change:

```bash
cd "{TARGET_DIR}" && git ls-files --error-unmatch .rp1/bootstrap-state.json >/dev/null 2>&1 \
  && echo "WARN: bootstrap marker was committed; add .rp1/ to .gitignore and untrack it" \
  || echo "OK: marker untracked"
```

If the marker was tracked, warn the user that the initial commit recorded machine-local recovery state and should be amended to untrack `.rp1/`.

```
Bootstrap complete!
Project: {PROJECT_NAME} | Location: {TARGET_DIR}

Created: {kbRoot}/charter.md, {kbRoot}/preferences.md, AGENTS.md, CLAUDE.md, README.md, [pkg manifest], src/, tests/

Next: cd {PROJECT_NAME}, review code, run app (see README.md)

Commands: /rp1-dev:build, /rp1-dev:blueprint update, /rp1-base:knowledge-build
```

**If scaffold-probe failed** (any point failed) **or scaffold agent errored**:

Explicitly RETAIN the bootstrap marker (do NOT delete `{rp1Dir}/bootstrap-state.json`). Report partial state with the failed probe points:

```
Bootstrap partially complete — marker retained for recovery.
Project: {PROJECT_NAME} | Location: {TARGET_DIR}

Scaffold probe failed points: [list each failed point name and detail]

Re-run /bootstrap to resume from the scaffold phase.
```

{% include_shared "coordinator-loop.md" %}

**File-specific constraints**:
- Do NOT modify files outside TARGET_DIR
- Do NOT re-run agents after completion

**Flow**: Check dir -> Resolve name (max 2 validations) -> Setup target -> Charter interview phase -> Scaffold phase -> Output -> STOP

**Errors**: Dir fail -> abort | User declines -> abort | Charter fails -> warn, continue | Scaffold fails or probe fails -> retain marker, report partial

Begin: check directory state, proceed through workflow.
