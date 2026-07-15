# rp1 migrate

Migrates an existing rp1 project to the project-local directory model and upgrades stale stanza content.

---

## Synopsis

```bash
rp1 migrate [--dry-run] [--to-central]
```

## Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview migration actions without modifying files or database rows. The preview includes Activity search rows that would be created or refreshed. |
| `--to-central` | Convert this project from local to central storage mode. Only executes when explicitly passed; bare `rp1 migrate` performs local-mode migration only. |

## Description

The `rp1 migrate` command transitions an existing rp1 project to the project-local directory model and ensures managed stanza content is up to date. It performs eight steps, all idempotent:

1. **Creates `.rp1/project_id`** with a new UUID if the file does not already exist.
2. **Creates `.rp1/work/`** directory if it does not already exist.
3. **Moves legacy work artifacts** from `~/.rp1/work/<normalized-project-key>` into `.rp1/work/`, merging without overwriting existing files.
4. **Updates `.gitignore`** to include work directory ignore rules and ensure `.rp1/project_id` is not ignored.
5. **Repairs Arcade metadata** for runs, artifacts, tasks, and notifications whose canonical project identity matches this project, including deterministic workflow fields when they can be derived safely.
6. **Moves misplaced project-local artifacts** from previously mis-resolved `.rp1` roots into this project's canonical `.rp1/` directory when the source files can be found safely.
7. **Rebuilds Activity search rows** for existing workflow history so full-history Activity search can find eligible runs immediately after migration.
8. **Upgrades stale stanza content** in `CLAUDE.md`, `AGENTS.md`, and `.gitignore` to the latest fence version (see [Fence Versioning](fence-versioning.md)).

The command is fully automatic with no interactive prompts. It is safe to run multiple times -- subsequent runs detect that migration has already been completed and report no changes.

Use `--dry-run` to preview planned migration work. Dry-run mode reports Activity search rows that would be created or refreshed without creating the search table, rebuilding rows, moving files, or rewriting run/event history.

## Project Root Discovery

The command locates the project root by:

1. Walking up from the current directory looking for a `.rp1/` directory.
2. If not found, checking the git repository root for a `.rp1/` directory.

If no `.rp1/` directory is found, the command exits with an error recommending `rp1 init`.

## Legacy Work Directory Detection

The command computes the legacy external work path using the same normalization algorithm that previous rp1 versions used (`~/.rp1/work/<normalized-project-key>`). If this directory exists and contains files, they are moved into `.rp1/work/`.

### Move Behavior

- Files are moved recursively, preserving directory structure.
- Existing files in `.rp1/work/` are never overwritten (merge without overwrite).
- Symlinks pointing outside expected directories are skipped for safety.
- Cross-device moves are handled automatically (copy + delete fallback when `rename()` fails with `EXDEV`).

## Previous Runs

`rp1 migrate` also repairs older tracked-workflow rows conservatively:

- When the command can safely derive workflow identity, it backfills the run
  onto the canonical project root and restores deterministic resume metadata,
  including resume behavior, work identity, and startup context.
- Older `/build` runs with a known `feature_id` become resumable again as
  `FEATURE_ID=<value>`, even if they were originally created from a linked
  worktree.
- When the history is incomplete, migrate leaves those deterministic fields
  empty instead of guessing.
- Those partially repaired rows still remain eligible for legacy resume
  compatibility. The next matching resumable workflow can repair the row in
  place when it resumes it.

## Output

The command prints a summary of all actions taken:

```
Migration complete for /Users/dev/myproject

  Created .rp1/project_id: 550e8400-e29b-41d4-a716-446655440000
  Created .rp1/work/
  Moved 12 file(s) from /Users/dev/.rp1/work/Users-dev-myproject
  Updated .gitignore (added 3 rule(s))
  Repaired Arcade metadata in 5 run(s), 3 artifact(s), 2 task(s), 4 notification(s)
  Moved 3 misplaced artifact file(s) into .rp1/
  Rebuilt Activity search rows: 18 created, 2 refreshed
  Updated CLAUDE.md stanza (v0.6.0 -> v0.7.1)
  Updated AGENTS.md stanza (v0.6.0 -> v0.7.1)
```

When run on an already-migrated project:

```
Migration complete for /Users/dev/myproject

  Project ID: 550e8400-e29b-41d4-a716-446655440000 (already existed)
  .rp1/work/ already exists
  No legacy work directory found
  .gitignore already up to date
  No database records to backfill
  Activity search rows already up to date
  Stanza content already up to date
```

Dry-run output uses the same project discovery, but does not mutate files or the database:

```
Migration dry-run for /Users/dev/myproject

  Project ID: 550e8400-e29b-41d4-a716-446655440000 (already existed)
  .rp1/work/ already exists
  No legacy work directory found
  Would rebuild Activity search rows: 18 to create, 2 to refresh
  Would leave database history and files unchanged

Run without --dry-run to apply these changes.
```

## Examples

### Migrate Current Project

```bash
cd /path/to/my-project
rp1 migrate
```

### Preview Migration Work

```bash
rp1 migrate --dry-run
```

### Convert to Central Storage

```bash
rp1 migrate --to-central
```

### Preview Central Conversion

```bash
rp1 migrate --to-central --dry-run
```

### Migration Workflow

The typical migration workflow after upgrading rp1:

```bash
# 1. Update rp1 to the new version
rp1 self-update

# 2. Migrate the project
rp1 migrate

# 3. Commit the project identity file
git add .rp1/project_id
git commit -m "chore: add rp1 project identity"
```

## Stanza Upgrades

When rp1 releases new stanza content (the managed blocks inside `CLAUDE.md`, `AGENTS.md`, and `.gitignore`), migrate detects outdated fence markers and replaces the fenced content with the latest templates. Content you have written outside the fence markers is never modified.

- **Legacy unversioned markers** (e.g., `<!-- rp1:start -->`) are treated as version `0.0.0` and always upgraded.
- **Already-current files** are skipped (the command is idempotent).
- Each upgraded file reports its version transition in the output (e.g., `v0.6.0 -> v0.7.1`).

See [Fence Versioning](fence-versioning.md) for details on the version scheme.

## Central Storage Conversion (`--to-central`)

When `--to-central` is passed, six additional steps execute after the local-mode steps listed above. These steps convert the project from local storage (KB and work artifacts inside `.rp1/`) to central storage (KB and work artifacts under `~/.rp1/projects/<project_id>/`).

1. **Relocates `.rp1/context/` and `.rp1/work/`** to `~/.rp1/projects/<project_id>/`, preserving directory structure. Cross-device moves are handled automatically. Files that already exist at the destination are skipped.
2. **Writes `[storage] mode = "central"`** to the project's `.rp1/settings.toml`. If the file or section does not exist, it is created. If `mode` is already set to `"central"`, the write is skipped. Existing comments and formatting in the TOML file are preserved.
3. **Removes rp1 fenced stanzas** from project-level `CLAUDE.md` and `AGENTS.md`. Content outside the fence markers is not modified. Files without fenced content are skipped.
4. **Injects global stanzas** into harness-specific instruction files (e.g., `~/.claude/CLAUDE.md`) for each configured harness. If global stanzas already exist, they are updated to the latest version.
5. **Updates `.gitignore`** to the central preset, which ignores the entire `.rp1/` directory since KB and work files are stored externally.
6. **Runs `git rm --cached`** on previously tracked files under `.rp1/context/` and `.rp1/work/`, removing them from the git index without deleting the central copies.

These steps only execute when `--to-central` is explicitly passed. Bare `rp1 migrate` performs local-mode migration only and does not convert, suggest, or reference central storage mode.

If the project is already in central mode (`[storage] mode = "central"` is already set), the command reports no changes (idempotent).

`--dry-run` composes with `--to-central`: `rp1 migrate --to-central --dry-run` reports all planned central-conversion actions without modifying files, settings, or the git index.

### Central Conversion Output

```
Migration complete for /Users/dev/myproject

  Project ID: 550e8400-e29b-41d4-a716-446655440000 (already existed)
  .rp1/work/ already exists
  No legacy work directory found
  .gitignore already up to date
  No database records to backfill
  Activity search rows already up to date
  Stanza content already up to date
  No Arcade settings JSON to migrate

  Central storage conversion:
    Relocated 5 context file(s) and 12 work file(s) to central store
    Wrote [storage] mode = "central" to settings.toml
    Removed stanzas from: CLAUDE.md, AGENTS.md
    Global stanzas: 1 written
    Updated .gitignore to central preset
    Unstaged 17 file(s) from git index
```

### Central Conversion Dry-run Output

```
Migration dry-run for /Users/dev/myproject

  Project ID: 550e8400-e29b-41d4-a716-446655440000 (already existed)
  .rp1/work/ already exists
  No legacy work directory found
  Activity search rows already up to date
  No Arcade settings JSON to migrate

  Central storage conversion:
    Would relocate 5 context file(s) and 12 work file(s) to central store
    Would write [storage] mode = "central" to settings.toml
    Would remove stanzas from: CLAUDE.md, AGENTS.md
    Would manage global stanzas: 1 to write, 0 to update
    Would update .gitignore to central preset
    Would unstage 17 tracked file(s) from git index
  Would leave database history and files unchanged

Run without --dry-run to apply these changes.
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No `.rp1/` directory found | Running in a directory without an rp1 project | Run `rp1 init` to initialize a project first |
| Migration failed | Filesystem or database access error | Check permissions and disk space |

## Related

- [`rp1 init`](init.md) - Initialize a new rp1 project (creates `.rp1/project_id` automatically)
- [Fence Versioning](fence-versioning.md) - How fence version markers work
- [The .rp1 Directory](../../getting-started/rp1-directory.md) - Directory structure overview
