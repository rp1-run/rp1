# Build -- Parallel Builders (Worktree Lifecycle)

Reference companion for `build/SKILL.md`. Contains the worktree lifecycle protocol for parallel-wave mode: concurrent task-builder execution using git worktrees for isolation.

**Load condition**: When parallel-wave mode preconditions are met during section 4.3 Builder-Reviewer Loop.

A wave may contain more than one `secondary` entry. Every step below applies **per secondary entry**, keyed by that entry's `unit_id`, which keeps branch names, worktree paths, and cleanup distinct.

## Worktree Creation

Each secondary builder runs in its own git worktree. Create one per `secondary` entry before dispatching that builder:

```bash
git worktree add -b "build-wt/{FEATURE_ID}/{unit_id}" \
  "{codeRoot}/../.rp1-wt-{FEATURE_ID}-{unit_id}" HEAD
```

- Branch name: `build-wt/{FEATURE_ID}/{unit_id}` (deterministic, disposable).
- Worktree path: sibling directory to `codeRoot` with `.rp1-wt-` prefix to avoid collision.
- Base ref: `HEAD` of the current branch, so every worktree in the wave forks from the same commit as the primary builder.

If `git worktree add` fails (e.g., branch already exists from a prior incomplete run), remove the stale worktree first (`git worktree remove --force`), delete the branch (`git branch -D`), then retry once. On second failure, drop that unit from the wave and let a later cycle build it serially; the rest of the wave proceeds.

## CODE_ROOT Routing

Builders receive different `CODE_ROOT` values; work artifacts stay canonical:

| Builder | CODE_ROOT | WORK_ROOT | KB_ROOT |
|---------|-----------|-----------|---------|
| Primary | `{codeRoot}` (unchanged) | `{workRoot}` (canonical) | `{kbRoot}` (canonical) |
| Each secondary | its own `{worktreePath}` | `{workRoot}` (canonical) | `{kbRoot}` (canonical) |

`WORK_ROOT` and `KB_ROOT` always point to the canonical `.rp1/` tree so Arcade-visible artifacts, task files, and knowledge base remain shared. Only source-code edits land in the worktree.

## Integration

A secondary builder that returns successfully puts its unit's `task_ids` in `PENDING_INTEGRATION_TASK_IDS`, never `BUILT_TASK_IDS`: the commits are in the worktree, not on the primary branch. That state holds the unit out of both review and rebuild until one of the outcomes below resolves it.

Integrate secondaries **one at a time, in ascending `unit_id` order**, and only after the primary unit's reviewer has succeeded. Never integrate two worktrees concurrently: each rebase replays onto the branch tip the previous integration produced.

Integration is independent per secondary. If one secondary conflicts, the already-integrated ones stay integrated -- apply the Conflict Fallback to the conflicting unit only and carry on with the remaining secondaries.

For each secondary, integrate its worktree commits onto the primary branch:

1. Verify the worktree branch carries exactly one commit beyond its **fork point** -- the commit `HEAD` pointed at when the worktree was created (`git rev-list --count {forkPoint}..build-wt/{FEATURE_ID}/{unit_id}` = 1). Do not count against the current primary `HEAD`: the primary builder may have added one or more commits since the fork, and that is expected -- the rebase below replays the worktree's single commit onto whatever the primary `HEAD` is now.
2. From the primary `codeRoot`, rebase the worktree branch:

```bash
git -C "{codeRoot}" rebase HEAD "build-wt/{FEATURE_ID}/{unit_id}"
```

3. Fast-forward the current branch to include the rebased commit:

```bash
git -C "{codeRoot}" merge --ff-only "build-wt/{FEATURE_ID}/{unit_id}"
```

4. On success, clean up that worktree per the Cleanup section, move the unit's `task_ids` out of `PENDING_INTEGRATION_TASK_IDS` and into `BUILT_TASK_IDS`, then move to the next secondary in `unit_id` order. The unit is now on the primary branch and the next `schedule-wave` call will offer it for review.

## Conflict Fallback

If the rebase produces conflicts (non-zero exit from `git rebase`):

1. Abort the rebase: `git -C "{codeRoot}" rebase --abort`.
2. Discard that worktree's result entirely.
3. Clean up the worktree and branch per the Cleanup section.
4. Remove the unit's `task_ids` from `PENDING_INTEGRATION_TASK_IDS` and do NOT add them to `BUILT_TASK_IDS`. With the unit in no state list, a later `schedule-wave` call offers it as an ordinary builder dispatch on the primary `codeRoot`. This is a transparent retry, not a failure.
5. Record `parallel_fallback: true` and `fallback_reason: "merge_conflict"` in the implementation context for readiness reporting.

Do not attempt manual conflict resolution. The rebuild produces the correct result because it runs on the integrated primary branch.

## Failure During Integration

A secondary builder that failed (returned error or malformed output): do not attempt integration, clean up its worktree and branch, and leave its `task_ids` out of every state list. The scheduler re-offers that unit later. The rest of the wave is unaffected -- process every other builder normally.

The primary builder failed while secondaries succeeded: keep the secondary worktrees, retry the primary per the normal retry path, and integrate secondaries only after the primary's reviewer passes. If the primary's retry window is exhausted, escalate per section 4.3.7 and abandon every secondary worktree alongside it, cleaning each one up and clearing its `task_ids` from `PENDING_INTEGRATION_TASK_IDS`.

The primary's reviewer failed after builders succeeded: do not integrate any secondary worktree yet. Resolve the primary's retry first per §4.3 Reviewer Failure. Integrate once it passes; if it is escalated instead, abandon and clean up every secondary worktree and clear their `task_ids` from `PENDING_INTEGRATION_TASK_IDS`.

## Cleanup

After integration (success or fallback), always remove that worktree and its branch:

```bash
git -C "{codeRoot}" worktree remove --force \
  "{codeRoot}/../.rp1-wt-{FEATURE_ID}-{unit_id}"
git -C "{codeRoot}" branch -D "build-wt/{FEATURE_ID}/{unit_id}"
```

Cleanup MUST run once per created worktree on every exit path: successful integration, conflict fallback, builder failure, and escalation. Leftover worktrees leak disk and block future runs that reuse the same branch name.

If cleanup itself fails, log a warning but do not fail the build. The next parallel-wave attempt will detect and force-remove the stale worktree.
