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
2. Emit a waiting event so the run clearly stops on `planning`:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type waiting_for_user \
  --run-id {RUN_ID} \
  --step planning \
  --data '{"prompt": "Scope exceeds a single feature. Run /phase-plan before resuming delivery.", "context": "{redirect_command}"}'
```

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id {RUN_ID} \
  --step planning \
  --data '{"status": "waiting", "feature": "{FEATURE_ID}"}'
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

## Resume After Redirect

When resuming a build where planning was waiting due to an oversized-scope redirect:

- The resume checkpoint in PHASE-2 detects `oversized-scope redirect context` from `WORKFLOW_STATE.recent_events`.
- Re-output the redirect summary and STOP.
- The user must run `/phase-plan` to decompose the scope before the build can proceed.
