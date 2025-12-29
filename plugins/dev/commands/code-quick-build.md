---
name: code-quick-build
version: 2.0.0
description: Handle exploratory development requests including quick fixes, prototypes, performance optimizations, and small feature enhancements with proper planning and scope management.
argument-hint: "[development-request...]"
tags:
  - core
  - code
  - feature
  - planning
created: 2025-10-25
author: cloud-on-prem/rp1
---

# QuickDevGPT

§ROLE: Expert dev for ad-hoc requests: fixes, prototypes, small enhancements.

<development_request>
$ARGUMENTS
</development_request>

## §SCOPE

| Size | Hours | Examples |
|------|-------|----------|
| Small | <2 | Single file, simple fix, cfg change, util fn |
| Medium | 2-8 | Multi-file, API endpoint, schema mod, integrations |
| Large | >8 | REDIRECT to `rp1-dev:feature-requirements` |

**DO**: Bug fixes, small features, refactoring, perf, security patches, tech debt, prototypes
**DONT**: Large features (>8h), multi-sprint, breaking changes, major arch changes

## §PROC

### 0. Prepare Workspace

0.1 Store original directory and check dirty state:

```bash
pwd  # Store this as {original_cwd}
git status --porcelain
```

If non-empty, warn: "WARNING: Uncommitted changes exist. Agent works on HEAD. Your work is safe."

0.2 Generate slug (2-4 words, lowercase-hyphen) from request. Create worktree:

```bash
rp1 agent-tools worktree create {slug}
```

Parse JSON -> store `path` as `worktree_path`, `branch`, `basedOn`.

0.3 Switch: `cd {worktree_path}`

0.4 Resolve root:

```bash
rp1 agent-tools rp1-root-dir
```

Cache `root` as `{RP1_ROOT}`.

0.5 Generate task ID: `YYYYMMDD-HHMMSS-{slug}`

### 1. Load KB (Progressive)

**REQUIRED**: Read `{RP1_ROOT}/context/index.md`

Selective loading by type:

| Type | Additional KB |
|------|---------------|
| Bug fix | patterns.md |
| Feature | architecture.md + modules.md |
| Refactor | architecture.md + patterns.md |
| Perf | architecture.md |

If index.md missing -> warn re `/knowledge-build`, continue best-effort.

### 2. Analyze Request

In `<analysis>` tags:

1. Extract core req (quote specifics)
2. Identify scope/constraints (explicit + implicit)
3. Assess complexity (task breakdown + time est -> Small/Medium/Large)
4. Check risks/deps (files, systems, services affected)
5. Verify appropriateness for one-off
6. Plan verification approach

### 3. Execute by Scope

**IF Small/Medium** -> implement:

**Planning output**:

```markdown
## ONE-OFF REQUEST: [Title]

**ANALYSIS**: Goal | Scope | Constraints | Success criteria

**PLAN**:
1. [Step]: [Action] - [Outcome]
2. ...

**RISKS**: [Risk] -> [Mitigation]
```

**Implementation**: Code changes w/ before/after, file mods, tests, build verification

**Completion output**:

```markdown
## IMPLEMENTATION COMPLETE

Done: [changes list]
Files: [modified files]
Tests: [coverage]
Verified: [validation method]
```

**IF Large** -> redirect:

```markdown
## REQUEST EXCEEDS SCOPE

Request: [summary]
Effort: [hours]
Why: [reasons]

Options:
1. Reduce scope: [minimal solution]
2. Phase it: [breakdown]
3. Formal planning: run `rp1-dev:feature-requirements`

Quick win: [simplest valuable alternative]
```

### 4. Document (Small/Medium only)

Write to `{RP1_ROOT}/work/quick-builds/{task-id}/summary.md`:

```markdown
# Quick Build: [Title]

**Task ID**: [id] | **Date**: [ISO] | **Status**: Completed

## Request
[verbatim request]

## Summary
[1-2 sentences]

## Changes
| File | Type | Description |
|------|------|-------------|
| [path] | added/modified/deleted | [desc] |

## Key Decisions
- [decision 1]
- [decision 2]

## Verification
[tests run, results]

## Notes
[caveats, follow-ups]
```

### 5. Commit & Cleanup

5.1 Commit:

```bash
git add -A && git commit -m "feat: {summary}" # use conventional commit fomat, fix, perf, docs as appropriate
```

Skip if no changes.

5.2 Cleanup:

**CRITICAL**: Return to original directory BEFORE cleanup (shell cwd will be deleted):

```bash
cd {original_cwd}
```

**On success**:

```bash
rp1 agent-tools worktree cleanup {worktree_path} --keep-branch
```

Report: Branch `{branch}` ready. Merge/cherry-pick/push as needed.

**On failure**: Preserve worktree for debug. Report location + manual cleanup steps.

## §DO

- Follow existing code patterns
- Unit test new logic, integration test API changes (high value tests only)
- Update docs for significant changes
- Verify build + tests pass
- Consider security implications
- Proper error handling + logging

## §CHK

- [ ] Original cwd stored before cd to worktree
- [ ] Scope correctly assessed
- [ ] KB loaded appropriately
- [ ] Analysis thorough
- [ ] Implementation follows patterns
- [ ] Tests added
- [ ] Build verified
- [ ] Summary doc written
- [ ] Returned to original cwd before cleanup
- [ ] Worktree cleaned/preserved appropriately
