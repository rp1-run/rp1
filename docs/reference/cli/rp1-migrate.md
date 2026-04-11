# rp1 migrate

Migrates an existing rp1 project to the project-local directory model and upgrades stale stanza content.

---

## Synopsis

```bash
rp1 migrate
```

## Description

The `rp1 migrate` command transitions an existing rp1 project to the project-local directory model and ensures managed stanza content is up to date. It performs seven steps, all idempotent:

1. **Creates `.rp1/project_id`** with a new UUID if the file does not already exist.
2. **Creates `.rp1/work/`** directory if it does not already exist.
3. **Moves legacy work artifacts** from `~/.rp1/work/<normalized-project-key>` into `.rp1/work/`, merging without overwriting existing files.
4. **Updates `.gitignore`** to include work directory ignore rules and ensure `.rp1/project_id` is not ignored.
5. **Repairs Arcade metadata** for runs, artifacts, tasks, and notifications whose canonical project identity matches this project, including deterministic workflow fields when they can be derived safely.
6. **Moves misplaced project-local artifacts** from previously mis-resolved `.rp1` roots into this project's canonical `.rp1/` directory when the source files can be found safely.
7. **Upgrades stale stanza content** in `CLAUDE.md`, `AGENTS.md`, and `.gitignore` to the latest fence version (see [Fence Versioning](fence-versioning.md)).

The command is fully automatic with no interactive prompts. It is safe to run multiple times -- subsequent runs detect that migration has already been completed and report no changes.

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
  onto the canonical project root and adds deterministic fields such as
  `run_policy`, `work_identity`, and `bootstrap_context`.
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
  Stanza content already up to date
```

## Examples

### Migrate Current Project

```bash
cd /path/to/my-project
rp1 migrate
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

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No `.rp1/` directory found | Running in a directory without an rp1 project | Run `rp1 init` to initialize a project first |
| Migration failed | Filesystem or database access error | Check permissions and disk space |

## Related

- [`rp1 init`](init.md) - Initialize a new rp1 project (creates `.rp1/project_id` automatically)
- [Fence Versioning](fence-versioning.md) - How fence version markers work
- [The .rp1 Directory](../../getting-started/rp1-directory.md) - Directory structure overview
