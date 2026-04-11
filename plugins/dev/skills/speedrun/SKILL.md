---
name: speedrun
description: "Interactive speedrun loop for small, low-risk changes. Delegates each request to a general sub-agent. Redirects larger work to /build-fast or /build."
allowed-tools: Bash(echo *), Bash(rp1 *), Bash(git *), Bash(mkdir *)
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
  version: 1.1.0
  tags:
    - core
    - code
    - feature
  created: 2026-01-15
  updated: 2026-03-09
  author: cloud-on-prem/rp1
  arguments:
    - name: REQUEST
      type: string
      required: false
      default: ""
      description: "Initial development request (may be empty; will prompt if missing)"
      variadic: true
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
      aliases:
        - "afk"
        - "unattended"
---

# Speedrun

Interactive speedrun loop for rapid, small changes. Delegates each request to a single general sub-agent.

**This command ONLY orchestrates. It does NOT implement code.**

**First emit**: Include `--name "{RUN_NAME}"` on the first emit call to label the run in the Arcade dashboard. Derive `RUN_NAME` from the initial request: a brief summary (max 60 chars) prefixed with `"Feature: "`. Use the `RUN_ID` from the generated Workflow Bootstrap section. Capture `DATESTAMP=$(date +%Y-%m-%d)` once at session start for use in session log paths. Initialize `TASK_COUNT=0` at session start.

On session start, emit the status change:
```bash
rp1 agent-tools emit \
  --workflow speedrun \
  --type status_change \
  --run-id {RUN_ID} \
  --name "Feature: {brief summary of request}" \
  --step active \
  --data '{"status": "running"}'
```

**Per-task unit tracking**: Each task in the session gets a unit identifier `task-{TASK_COUNT}`. Increment `TASK_COUNT` before each new task starts. Include `--unit task-{TASK_COUNT}` on ALL emit calls for that task so each task appears as a trackable item in the Arcade.

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> active
    active --> [*] : session_end
```

## 1. Main Loop

### 1.1 Get Request

If REQUEST empty:

{% ask_user "What would you like to build?" %}

### 1.2 Clarity Check

**Super vague** (ask for clarification):
- Single word: "refactor", "fix", "improve"
- No actionable target: "make it better"

**Clear enough** (proceed):
- Specific action + target: "add logout button to navbar"
- Bug description: "fix null error in auth.ts"
- File/component reference: "update UserCard styling"

If vague: ask ONE clarifying question. Do NOT over-interrogate.

### 1.3 Scope Gate

Before delegating, assess the request:

| Factor | Small (proceed) | Medium/Large (redirect) |
|--------|-----------------|------------------------|
| Files | 1-3 | >3 |
| Systems | 1 | >1 |
| Risk | Low | Medium or High |
| Estimated effort | <2h | >2h |

**If Medium or Large**: Do NOT delegate. Instead:

1. Rewrite the user's raw request into a clean, standalone description (1-2 sentences, specific and actionable). This is the **polished request** — it should make sense to someone with no prior context, not just echo the user's words back.
2. Output the redirect in this exact format:

~~~markdown
---

## This request is better suited for a structured workflow

**Request**: {polished request — a clear, self-contained description of what the user wants}
**Why**: {brief reason — e.g. touches N files across M systems, requires design decisions}

**Recommended** (copy-paste ready):

For medium scope (2-8h):
```
/rp1-dev:build-fast "{polished request}"
```

For large scope (>8h):
```
/rp1-dev:build "{suggested-feature-id}"
```

---
~~~

The polished request inserted into the commands must be the cleaned-up version, NOT the user's raw input. Transform vague or conversational input into a concise, actionable prompt that a downstream workflow can act on without further clarification.

Then loop to §1.5 (Post-Build Prompt) so the user can submit a smaller request or exit.

### 1.4 Deploy Builder

Increment `TASK_COUNT`. Emit a build-start status with the unit:

```bash
rp1 agent-tools emit \
  --workflow speedrun \
  --type status_change \
  --run-id {RUN_ID} \
  --step active \
  --unit task-{TASK_COUNT} \
  --data '{"status": "running", "request": "{brief summary of REQUEST}"}'
```

Spawn a single general sub-agent to implement the request:

{% dispatch_agent "rp1-dev:speedrun-builder" %}
Implement the following change in the codebase:

{REQUEST}

Keep changes minimal and focused. Run any relevant lint/format/test
checks after making changes. Do NOT commit.
{% enddispatch_agent %}

**Wait for completion. Do NOT implement anything yourself.**

### 1.5 Post-Build Prompt

After builder completes, emit waiting status so the Arcade dashboard reflects the gate pause:

```bash
rp1 agent-tools emit \
  --workflow speedrun \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step active \
  --unit task-{TASK_COUNT} \
  --data '{"prompt": "What would you like to do next?", "context": "Post-build prompt after express builder completes"}'
```

{% ask_user "What would you like to do next?", options: "Commit & move on", "Refine", "Review feedback from Arcade", "New task (no commit)", "Exit" %}

| Option | Action |
|--------|--------|
| Commit & move on | Commit current changes (conventional commit), then loop to 1.1 |
| Refine | Ask what to change, re-invoke §1.4 with refinement as REQUEST |
| Review feedback from Arcade | Load the `arcade-collab` skill (`/rp1-dev:arcade-collab`), then call `rp1 agent-tools feedback read --run-id {RUN_ID} --status open`. If feedback exists, process it per the collaboration loop in the skill. After all feedback is processed, return to this prompt and re-present the same options. **Not shown when `AFK=true`.** |
| New task (no commit) | Loop to 1.1 without committing |
| Exit | STOP |

After a scope redirect (§1.3), show only "New task" and "Exit" options (no feedback review since no build occurred).

### 1.6 Commit

When user chooses "Commit & move on":
1. Stage all changed files (prefer specific files over `git add -A`)
2. Generate a concise conventional commit message summarizing the change
3. Create the commit
4. Emit commit status:
```bash
rp1 agent-tools emit \
  --workflow speedrun \
  --type status_change \
  --run-id {RUN_ID} \
  --step active \
  --unit task-{TASK_COUNT} \
  --data '{"status": "completed"}'
```
5. Update session log (see §1.8)
6. Loop to 1.1 (Get Request)

### 1.7 New Task

Clear REQUEST, update session log with status "skipped" (see §1.8), then loop to 1.1 (Get Request).

### 1.8 Session Log Update

After every task resolution (commit, skip, or refine cycle completion), write or append to the session log file at `{workRoot}/speedrun/{DATESTAMP}-{RUN_ID}/session-log.md`.

The log file uses this format:

```markdown
# Speedrun Session Log

| # | Request | Change | Status |
|---|---------|--------|--------|
| 1 | {brief summary of what was requested} | {brief summary of what builder changed} | committed |
| 2 | {brief summary of what was requested} | {brief summary of what builder changed} | skipped |
```

- **Request**: 1-line summary of the user's request for this task
- **Change**: 1-line summary of what the builder actually did (from builder output). Use "N/A" if skipped before build.
- **Status**: `committed`, `skipped`, or `refined` (refined = was refined then committed)

Create the directory if it does not exist (`mkdir -p`). Rewrite the entire file each time (header + all rows) so it stays consistent.

After writing the file, register it as an artifact (on first write) or let subsequent writes update the content in-place:

```bash
rp1 agent-tools emit \
  --workflow speedrun \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step active \
  --unit task-{TASK_COUNT} \
  --data '{"path": "speedrun/{DATESTAMP}-{RUN_ID}/session-log.md", "storageRoot": "work_dir", "format": "markdown"}'
```

## 2. Session End

On exit, report tasks completed count.

```markdown
## Session Summary

**Tasks Completed**: {count}

Speedrun session ended.
```

## 3. Orchestrator Rules

**YOU MUST**:
- Only use user-input and agent-dispatch tools
- Delegate ALL implementation to the sub-agent
- Scope-gate every request before delegating
- Track task count

**YOU MUST NOT**:
- Read/write/edit any code files (except the session log at `{workRoot}/speedrun/{DATESTAMP}-{RUN_ID}/session-log.md`)
- Load KB files
- Run quality checks
- Make any implementation decisions
- Delegate medium or large scope work
