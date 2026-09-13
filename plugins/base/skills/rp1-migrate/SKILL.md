---
name: rp1-migrate
description: "Safely migrate legacy rp1 project artifacts to the current layout."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: knowledge
  is_workflow: false
  version: 1.0.0
  tags:
    - utility
    - migration
    - maintenance
  created: 2026-09-13
  author: rp1
---

# Migrate Legacy rp1 Artifacts

Detect and safely migrate legacy rp1 project artifacts. This command changes
files and Arcade database rows, so require explicit confirmation before the
mutating step.

## Detect

Run:

```bash
rp1 agent-tools rp1-root-dir
```

Read `data.needsMigration`, `data.migrationHint`, `data.isWorktree`, and
`data.projectRoot` from the successful result. If `data.isWorktree` is true,
tell the user that migration targets the main repository at
`data.projectRoot`, and that the command must be run from there.
Stop and ask the user to rerun the skill from that main repository before
previewing or applying migration.

If the command fails because the legacy project is missing `project_id`, treat
that error as recoverable evidence that migration is needed. Stop only for the
`no rp1 project, run rp1 init` error. If detection succeeds with
`needsMigration: false`, report that there is nothing to migrate and stop.

## Preview and Confirm

Run:

```bash
rp1 migrate --dry-run
```

Present the output as a partial preview: dry-run reports planned steps but does
not compute exact file-move counts or stanza diffs. Recommend stopping Arcade
if it is running because migration changes database rows. Ask for explicit
confirmation before continuing.

## Migrate and Verify

After confirmation, run `rp1 migrate` and show its summary. Then rerun
`rp1 agent-tools rp1-root-dir`.

- If `needsMigration` is false, confirm migration succeeded.
- If it remains true, report the remaining reasons from `migrationHint`
  verbatim. Skipped conflicts or unrelated entries in the legacy directory are
  left in place by design; point the user to the legacy path and do not rerun
  migration in a loop.

Do not offer `--to-central`; it is out of scope for this skill. Refer users to
the `rp1 migrate` reference documentation for that separate option.
