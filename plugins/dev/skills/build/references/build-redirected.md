# Build -- Oversized Scope Redirect

Reference companion for `build/SKILL.md`. Contains the full alternate-flow handling when `feature-architect` detects scope that exceeds a single feature.

**Load condition**: When `feature-architect` returns `status = "needs_phase_planning"`.

## Redirect Detection

After dispatching `feature-architect`, parse the response JSON:

- Accept `status = "success"` to continue with design follow-on work.
- Accept `status = "needs_phase_planning"` as an oversized-scope redirect. In that case, do NOT run `hypothesis-tester`, do NOT run `feature-tasker`, do NOT enter `implementation`, and do NOT generate legacy `tracker.md` or `milestone-*.md` guidance.
- Treat `status = "error"` or malformed output as a planning failure. Abort the build instead of guessing.

## Redirect Handling

If `status = "needs_phase_planning"`:

1. Extract `reason`, `source_relative_path`, and `redirect_command`.
2. Close the build run as terminal. A phase-plan handoff is **not** a resumable pause — the oversized feature will not resume as itself; the user runs `/phase-plan` and then builds the resulting child features. Emit a terminal `cancelled` end-run so the run leaves the active set instead of dangling in `waiting`:

```bash
rp1 agent-tools emit end-run \
  --run-id {RUN_ID} \
  --outcome cancelled \
  --reason "Scope exceeds a single feature; redirected to /phase-plan. Run {redirect_command}, then build the resulting child features."
```

3. Output:

```markdown
## Build Redirected

**Feature**: {FEATURE_ID}
**Reason**: {reason}
**Source Artifact**: {source_relative_path}
**Next**: Run `{redirect_command}`
```

4. STOP.

## After Redirect

A redirected build run is terminal (`cancelled`) — there is nothing to resume. To proceed:

- Run `/phase-plan` (or the `redirect_command`) to decompose the oversized scope into child features.
- Then run `/build <child-feature>` for each child feature; each starts its own run.
- Re-invoking `/build` on the original oversized scope simply starts a fresh run that re-gathers requirements and redirects again until the scope is decomposed.
