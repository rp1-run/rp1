# rp1-migrate

Safely migrates legacy rp1 project artifacts to the current project-local
directory model.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-migrate
    ```

=== "OpenCode"

    ```bash
    /rp1-base-rp1-migrate
    ```

=== "Codex"

    ```bash
    $rp1-base-rp1-migrate
    ```

## Description

The skill detects legacy artifacts, previews the planned local-mode migration,
asks for explicit confirmation, runs `rp1 migrate`, and verifies the result.
It handles legacy projects without `.rp1/project_id` as migration candidates.

If invoked from a linked worktree, migration must be run from the main
repository identified by the detection output. Stop Arcade before confirming
the migration if it is running, because migration updates Arcade database
rows.

The dry-run is a partial preview: it reports planned steps but does not compute
exact file-move counts or stanza diffs. After migration, remaining
`migrationHint` reasons are reported verbatim when conflicts or unrelated
legacy entries were intentionally left in place.

## Usage

```text
Use /rp1-migrate when rp1 reports legacy artifacts or a project missing its
project identity. Review the dry-run, confirm the changes, then inspect the
post-migration verification.
```

This skill performs local-mode migration only. For the separately documented
central-storage conversion, see [`rp1 migrate`](../cli/rp1-migrate.md).

## Related

- [`rp1 migrate` CLI reference](../cli/rp1-migrate.md)
- [`self-update`](self-update.md)
