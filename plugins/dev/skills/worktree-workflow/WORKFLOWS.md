# Worktree Workflow: Edge Cases and Recovery

Decision trees for edge cases, validation failures, and error recovery.

## 1. Dirty State Resolution

When `git status --porcelain` returns non-empty output before cleanup.

### Decision Tree

```
Dirty state detected?
  +-- NO --> Proceed to cleanup (Step 4.3)
  +-- YES --> Present options to user
        +-- COMMIT --> get message, git add -A && git commit, git push, proceed
        +-- DISCARD --> confirm "Type DISCARD", git checkout -- . && git clean -fd, proceed
        +-- ABORT --> preserve worktree, STOP
```

### COMMIT Option

```bash
git add -A && git commit -m "type(scope): description"
git push origin {branch}
```

Log: `[DIRTY_STATE] User committed changes: {message}`

### DISCARD Option

```bash
git checkout -- . && git clean -fd
```

- `git checkout -- .` reverts modified tracked files
- `git clean -fd` removes untracked files/directories

Log: `[DIRTY_STATE] User discarded uncommitted changes`

### ABORT Option

Report and preserve:
```
Worktree: {worktree_path}
Branch: {branch}
Resume: cd {worktree_path}
Manual cleanup: rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

Log: `[DIRTY_STATE] User aborted cleanup, worktree preserved`

---

## 2. Commit Ownership Validation Failures

When validation fails in Phase 3, STOP and preserve worktree.

### 2.1 Commit Count Mismatch

**Symptom**: Commits in `git log {basedOn}..HEAD` does not match tracked count.

| Scenario | Causes | Action |
|----------|--------|--------|
| More commits than expected | Orphan commits, test contamination, other process | STOP, report expected vs actual, preserve |
| Fewer commits than expected | Lost tracking, accidental amend, rebase (PROHIBITED) | STOP, report, check `git reflog` |

**Recovery**:
1. `git log --oneline -20` - see full history
2. `git reflog` - see recent actions
3. `git show {hash}` - inspect unexpected commits
4. User manually pushes after review if safe

### 2.2 Orphan Commit Detection

**Symptom**: Commits don't descend from `basedOn` or show "Initial commit" entries.

**Red flags**:
- "Initial commit" messages
- Commits predating basedOn
- Commit count >20 for typical task
- Merge commits not created by agent

**Action**: STOP immediately, do NOT push.

**Recovery**:
1. Check `.git` is file not directory: `ls -la .git`
   - Should be symlink: `.git -> /path/to/main/.git/worktrees/...`
2. If corrupted, cleanup and recreate worktree

### 2.3 Unexpected Author Detection

**Symptom**: Commit authors don't match agent identity.

**Suspicious authors**:
- `Test User <test@test.com>`
- `user@example.com`
- `root@localhost`
- Any author != Claude/configured identity

**Action**: STOP immediately, do NOT push.

**Recovery**:
1. Check config: `git config user.name && git config user.email`
2. Identify valid vs contaminated commits
3. Cherry-pick valid commits to new worktree: `git cherry-pick {hash1} {hash2}`

### Validation Failure Report Template

```
COMMIT VALIDATION FAILED

Failure Type: {count_mismatch | orphan_commits | unexpected_author}
Expected: {expected_value}
Actual: {actual_value}

Suspicious Commits:
- {hash} by {author}: {message}

Worktree: {worktree_path} | Branch: {branch} | basedOn: {basedOn}

Investigation: git log --oneline -20 | git reflog | git show {hash}

WORKTREE PRESERVED for investigation.
```

---

## 3. Dependency Detection

Detect and install project dependencies before making changes.

### Detection Table (examples)

| File Present | Package Manager | Install Command |
|--------------|-----------------|-----------------|
| `bun.lockb` | Bun | `bun install` |
| `package-lock.json` | npm | `npm ci` |
| `yarn.lock` | Yarn | `yarn install --frozen-lockfile` |
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` |
| `package.json` (no lockfile) | npm | `npm install` |
| `Cargo.lock` | Cargo | `cargo build --locked` |
| `Cargo.toml` (no lockfile) | Cargo | `cargo build` |
| `requirements.txt` | pip | `pip install -r requirements.txt` |
| `pyproject.toml` | pip/poetry | `pip install -e .` or `poetry install` |
| `Pipfile` | pipenv | `pipenv install` |
| `go.mod` | Go | `go mod download` |
| `Gemfile` | Bundler | `bundle install` |
| `composer.json` | Composer | `composer install` |

### Detection Priority

Check lockfiles first (more specific), then manifests:

```
bun.lockb? --> bun install
package-lock.json? --> npm ci
yarn.lock? --> yarn install --frozen-lockfile
pnpm-lock.yaml? --> pnpm install --frozen-lockfile
Cargo.lock? --> cargo build --locked
---
package.json? --> npm install
Cargo.toml? --> cargo build
requirements.txt? --> pip install -r requirements.txt
pyproject.toml? --> pip install -e .
go.mod? --> go mod download
Gemfile? --> bundle install
---
None? --> Skip dependency installation
```

---

## 4. Error Recovery

### 4.1 Worktree Creation Failure

| Error | Cause | Recovery |
|-------|-------|----------|
| "Branch already exists" | Incomplete cleanup | `rp1 agent-tools worktree cleanup --all` |
| "Path already exists" | Stale directory | `rm -rf {path}` |
| "Not a git repository" | Wrong directory | Verify `git rev-parse --git-dir` |
| "Permission denied" | File permissions | Check write permissions |

### 4.2 Push Failure

| Error | Cause | Recovery |
|-------|-------|----------|
| "Could not resolve host" | Network down | Check connection, retry |
| "Authentication failed" | Expired creds | `gh auth login` or refresh SSH |
| "Remote rejected" | Branch protection | Check rules, may need PR |
| "Updates were rejected" | Remote changes | Investigate (shouldn't happen) |

**Retry pattern**: 3 attempts with backoff (10s, 20s, 30s).

### 4.3 PR Creation Failure

| Error | Cause | Recovery |
|-------|-------|----------|
| "gh: command not found" | Not installed | `brew install gh` |
| "Not authenticated" | Not logged in | `gh auth login` |
| "Resource not accessible" | No permissions | Check repo write access |
| "PR already exists" | Duplicate | `gh pr list --head {branch}` |
| "Base branch does not exist" | Wrong base | `git branch -r` to verify |

**Auth recovery**: `gh auth login && gh auth status`

**Permission issues**: Check `gh repo view`, may need fork for external repos.
