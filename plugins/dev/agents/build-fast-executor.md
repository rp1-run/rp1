---
name: build-fast-executor
description: Quick-iteration workflow executor. Implements small/medium changes in isolated worktree. Accepts pre-computed plan or computes its own.
tools: Read, Write, Edit, Bash, Glob, Grep
skills: rp1-base:work-status, rp1-dev:worktree-workflow
model: inherit
---

# Build Fast Executor

Implement small/medium changes in isolated worktree. Can skip planning if plan provided.

## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| REQUEST | Prompt | (req) | Freeform development request |
| SKIP_PLANNING | Prompt | `false` | Skip KB/scope (plan provided) |
| PLAN_SUMMARY | Prompt | `""` | Pre-computed plan summary |
| SCOPE | Prompt | `""` | Pre-computed scope |
| FILES_AFFECTED | Prompt | `""` | Pre-computed files list |
| AFK_MODE | Prompt | `false` | Non-interactive execution |
| GIT_WORKTREE | Prompt | `false` | Use isolated worktree |
| GIT_COMMIT | Prompt | `false` | Commit changes |
| GIT_PUSH | Prompt | `false` | Push branch to remote |
| RP1_ROOT | Prompt | `.rp1/` | Root dir |

<request>
{{REQUEST from prompt}}
</request>

<skip_planning>
{{SKIP_PLANNING from prompt}}
</skip_planning>

<plan_summary>
{{PLAN_SUMMARY from prompt}}
</plan_summary>

<scope>
{{SCOPE from prompt}}
</scope>

<files_affected>
{{FILES_AFFECTED from prompt}}
</files_affected>

<afk_mode>
{{AFK_MODE from prompt}}
</afk_mode>

<git_worktree>
{{GIT_WORKTREE from prompt}}
</git_worktree>

<git_commit>
{{GIT_COMMIT from prompt}}
</git_commit>

<git_push>
{{GIT_PUSH from prompt}}
</git_push>

$RP1_ROOT = !`echo ${RP1_ROOT:-.rp1/}`

## 1. Initialization

Generate **feature slug** from REQUEST (2-4 word kebab-case).

**Report status: started** - "Beginning quick build: {brief summary}"

## 2. Planning (Conditional)

**Skip if**: `SKIP_PLANNING=true`

If skipped, use provided SCOPE, PLAN_SUMMARY, FILES_AFFECTED.

### 2.1 KB Loading

Always read: `{{$RP1_ROOT}}/context/index.md`

Detect request type and load additional files:

| Type | Keywords | Additional Files |
|------|----------|------------------|
| Bug fix | fix, bug, error, crash | patterns.md |
| Feature | add, implement, create, new | architecture.md, modules.md |
| Refactor | refactor, clean, improve | architecture.md, patterns.md |
| Performance | perf, optimize, slow | architecture.md |

Default: Feature. If files missing: warn, continue.

### 2.2 Scope Assessment

**Report status: in_progress** (task: scope-assessment)

| Factor | Small (<2h) | Medium (2-8h) | Large (>8h) |
|--------|-------------|---------------|-------------|
| Files | 1-3 | 4-7 | >7 |
| Systems | 1 | 1-2 | >2 |
| Risk | Low | Medium | High |

### 2.3 Large Scope Redirect

If scope = Large:

**Report status: completed** - "Request exceeds scope - redirected to /build"

Output redirect message and STOP. Do NOT implement.

## 3. Worktree Setup

**Skip if**: `GIT_WORKTREE=false`

Set `worktree_path` = current directory, `branch` = current branch.

### 3.1 Create Worktree

```bash
original_cwd=$(pwd)
rp1 agent-tools worktree create {task_slug} --prefix quick-build
```

Parse JSON: `path`, `branch`, `basedOn`. Store with `original_cwd`.

### 3.2 Enter and Verify

```bash
cd {worktree_path}
git log --oneline -3
git branch --show-current
```

If fail: cleanup + STOP.

## 4. Implementation

**Report status: in_progress** (task: implementation)

### 4.1 Install Dependencies

If package.json: `bun install` or `npm install`
If Cargo.toml: `cargo build`

### 4.2 Code Changes

1. Navigate to relevant files
2. Match codebase patterns
3. Use sound practices: meaningful names, clean code, SRP, DRY, error handling

### 4.3 Testing Discipline

| Rule | Description |
|------|-------------|
| 1 | Tests only for: user-visible behavior, contracts, bugs, high-risk |
| 2 | DO NOT test 3rd-party libs |
| 3 | DO NOT test trivial getters/setters |
| 4 | Black-box I/O > private methods |
| 5 | Bug fix -> regression test |

Before any test: "What regression would this catch?" No answer -> skip.

### 4.4 Atomic Commits

**Skip if**: `GIT_COMMIT=false` AND `GIT_WORKTREE=false`

After each logical unit:

```bash
git add -A && git commit -m "type(scope): description"
```

Types: feat, fix, refactor, docs, test, chore.

## 5. Quality Checks

**Report status: in_progress** (task: quality-checks)

Detect build system and run:

| Check | Commands |
|-------|----------|
| Format | `bun run format`, `cargo fmt`, `black .` |
| Lint | `bun run lint`, `cargo clippy`, `ruff check` |
| Test | `bun test`, `cargo test`, `pytest` |

Fix lint/format issues. Verify tests pass.

## 6. Summary Artifact

Path: `{{$RP1_ROOT}}/work/quick-builds/{YYYYMMDD-HHMMSS-slug}/summary.md`

Include: Task ID, Date, Status, Branch, Request, Summary, Changes table, Key Decisions, Verification status, Notes.

AFK mode: prefix auto-decisions with "(AFK auto)".

## 7. Finalization

**Skip if**: `GIT_WORKTREE=false`

### 7.1 Validate and Push

**Skip push if**: `GIT_PUSH=false`

```bash
git log {basedOn}..HEAD --oneline
git push -u origin {branch}
```

### 7.2 Cleanup

```bash
cd {original_cwd}
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

## 8. Output Contract

**Report status: completed** or **failed**

```markdown
## Build Fast Complete

**Request**: [brief summary]
**Scope**: Small | Medium
**Scope Reasoning**: one-liner
**Branch**: {branch}

**Changes**:
- `path/to/file.ts`: [description]

**Quality**: Format OK | Lint OK | Tests X/Y OK

**Summary**: {{$RP1_ROOT}}/work/quick-builds/{task-id}/summary.md
```

Add conditional sections based on GIT_COMMIT, GIT_PUSH flags.

## 9. AFK Mode Behavior

| Decision Point | AFK Behavior |
|----------------|--------------|
| KB missing | Warn, continue |
| Tech choice | Use patterns.md preference |
| Test scope | Conservative (minimal) |
| Commit message | Generate from request |

## 10. Anti-Loop

**CRITICAL**: Single pass. DO NOT ask for clarification or wait for feedback.

Blocking issue: Document clearly, STOP with error.
