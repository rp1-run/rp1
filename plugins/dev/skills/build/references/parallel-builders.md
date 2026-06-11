# Build -- Parallel Builders (Worktree Lifecycle)

Reference companion for `build/SKILL.md`. Contains the worktree lifecycle protocol for parallel-wave mode: concurrent task-builder execution using git worktrees for isolation.

**Load condition**: When parallel-wave mode preconditions are met during section 4.3 Builder-Reviewer Loop.

## Worktree Creation

When parallel-wave mode triggers, the secondary builder runs in a dedicated git worktree:

```bash
git worktree add -b "build-wt/{FEATURE_ID}/{unit_id}" \
  "{codeRoot}/../.rp1-wt-{FEATURE_ID}-{unit_id}" HEAD
```

- Branch name: `build-wt/{FEATURE_ID}/{unit_id}` (deterministic, disposable).
- Worktree path: sibling directory to `codeRoot` with `.rp1-wt-` prefix to avoid collision.
- Base ref: `HEAD` of the current branch so the worktree starts from the same commit as the primary builder.

If `git worktree add` fails (e.g., branch already exists from a prior incomplete run), remove the stale worktree first (`git worktree remove --force`), delete the branch (`git branch -D`), then retry once. On second failure, fall back to serial pipelined path.

## CODE_ROOT Routing

The two builders receive different `CODE_ROOT` values; work artifacts stay canonical:

| Builder | CODE_ROOT | WORK_ROOT | KB_ROOT |
|---------|-----------|-----------|---------|
| Primary (unit k) | `{codeRoot}` (unchanged) | `{workRoot}` (canonical) | `{kbRoot}` (canonical) |
| Secondary (unit k+1) | `{worktreePath}` | `{workRoot}` (canonical) | `{kbRoot}` (canonical) |

`WORK_ROOT` and `KB_ROOT` always point to the canonical `.rp1/` tree so Arcade-visible artifacts, task files, and knowledge base remain shared. Only source-code edits land in the worktree.

## Integration

After both builders complete and before dispatching any reviewer, integrate the secondary builder's worktree commits onto the primary branch:

1. Verify the worktree branch has exactly one commit ahead of the base (the builder's atomic commit).
2. From the primary `codeRoot`, rebase the worktree branch:

```bash
git -C "{codeRoot}" rebase HEAD "build-wt/{FEATURE_ID}/{unit_id}"
```

3. Fast-forward the current branch to include the rebased commit:

```bash
git -C "{codeRoot}" merge --ff-only "build-wt/{FEATURE_ID}/{unit_id}"
```

4. If both rebase and fast-forward succeed, proceed to dispatch reviewer(k) and reviewer(k+1) sequentially, or pipeline reviewer(k) with the next ready builder if one exists.

## Conflict Fallback

If the rebase produces conflicts (non-zero exit from `git rebase`):

1. Abort the rebase: `git -C "{codeRoot}" rebase --abort`.
2. Discard the worktree result entirely.
3. Clean up the worktree and branch per the Cleanup section.
4. Re-dispatch unit k+1's builder serially on the primary `codeRoot` after unit k's reviewer completes. This is a transparent retry, not a failure.
5. Record `parallel_fallback: true` and `fallback_reason: "merge_conflict"` in the implementation context for readiness reporting.

Do not attempt manual conflict resolution. The serial rebuild produces the correct result because it runs on the integrated primary branch.

## Failure During Integration

If the secondary builder itself failed (returned error or malformed output):

1. Do not attempt integration.
2. Clean up the worktree and branch per the Cleanup section.
3. Process the primary builder's unit through review normally.
4. Re-dispatch the failed unit's builder serially on the primary `codeRoot` after the primary unit's review completes. Apply the same retry/escalation logic from section 4.3.

If the primary builder failed while the secondary succeeded:

1. Do not integrate the secondary's worktree yet.
2. Clean up the primary builder's failed state.
3. Retry the primary builder on `codeRoot` per the normal retry path.
4. Only after the primary unit succeeds, attempt integration of the secondary worktree.
5. If the retry window is exhausted for the primary, escalate per section 4.3.7. The secondary worktree is abandoned alongside the primary.

## Cleanup

After integration (success or fallback), always remove the worktree and its branch:

```bash
git -C "{codeRoot}" worktree remove --force \
  "{codeRoot}/../.rp1-wt-{FEATURE_ID}-{unit_id}"
git -C "{codeRoot}" branch -D "build-wt/{FEATURE_ID}/{unit_id}"
```

Cleanup MUST run on every exit path: successful integration, conflict fallback, builder failure, and escalation. Leftover worktrees leak disk and block future runs that reuse the same branch name.

If cleanup itself fails, log a warning but do not fail the build. The next parallel-wave attempt will detect and force-remove the stale worktree.
