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

Load skill `rp1-dev:worktree-workflow` for isolated workspace management.

**Skill Parameters**:

| Parameter | Value |
|-----------|-------|
| `task_slug` | 2-4 word slug from request (lowercase-hyphen) |
| `agent_prefix` | `quick-build` |
| `create_pr` | `false` |

Execute **Phase 1 (Setup)** from the skill:
- Store original directory
- Create worktree and verify state
- Install dependencies if needed

After Phase 1 completes:

0.1 Resolve root:

```bash
rp1 agent-tools rp1-root-dir
```

Cache `root` as `{RP1_ROOT}`.

0.2 Generate task ID: `YYYYMMDD-HHMMSS-{slug}`

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

### 5. Finalize

Execute remaining phases from skill `rp1-dev:worktree-workflow`:

**Phase 2 (Implementation)**: Commit all changes using conventional format (feat:, fix:, refactor:, etc.). Skip if no changes.

**Phase 3 (Publish)**: Validate commit ownership, push branch to remote. Skip PR creation (create_pr=false).

**Phase 4 (Cleanup)**: Handle dirty state if any, restore original directory, cleanup worktree.

Report: Branch `{branch}` ready. Merge/cherry-pick/push as needed.

## §DO

- Follow existing code patterns
- Unit test new logic, integration test API changes (high value tests only)
- Update docs for significant changes
- Verify build + tests pass
- Consider security implications
- Proper error handling + logging

## §CHK

- [ ] Skill Phase 1 (Setup) completed: worktree created and verified
- [ ] Scope correctly assessed
- [ ] KB loaded appropriately
- [ ] Analysis thorough
- [ ] Implementation follows patterns
- [ ] Tests added
- [ ] Build verified
- [ ] Summary doc written
- [ ] Skill Phases 2-4 completed: committed, pushed, cleaned up
