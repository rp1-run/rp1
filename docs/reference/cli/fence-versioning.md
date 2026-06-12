# Fence Versioning

How rp1 versions the managed content blocks (stanzas) it injects into your
project files, and how to keep them up to date.

---

## Overview

When you run `rp1 init`, rp1 injects managed content into `CLAUDE.md`,
`AGENTS.md`, and `.gitignore`. These blocks are delimited by **fence markers**
that tell rp1 where its managed content begins and ends:

```markdown
<!-- rp1:start:v0.7.1 -->
...managed content...
<!-- rp1:end:v0.7.1 -->
```

Starting with rp1 0.7.1, fence markers include a version identifier. This
version tracks the stanza content format and allows rp1 to detect when your
managed blocks are outdated after a CLI upgrade.

## Marker Formats

### Comment fences (CLAUDE.md, AGENTS.md)

| Style | Start marker | End marker |
|-------|-------------|------------|
| Versioned | `<!-- rp1:start:v0.7.1 -->` | `<!-- rp1:end:v0.7.1 -->` |
| Legacy | `<!-- rp1:start -->` | `<!-- rp1:end -->` |

### Shell fences (.gitignore)

| Style | Start marker | End marker |
|-------|-------------|------------|
| Versioned | `# rp1:start:v0.7.1` | `# rp1:end:v0.7.1` |
| Legacy | `# rp1:start` | `# rp1:end` |

## Version Scheme

The fence version is a semver string (e.g., `0.7.1`) that tracks stanza
content changes. It is independent of the rp1 CLI version: the fence version
only increments when the managed content templates actually change, not on
every CLI release.

Each CLI build bundles a `LATEST_FENCE_VERSION` constant. When a file's fence
marker version is older than this constant, the stanza is considered **stale**.

## Staleness Detection

rp1 checks for stale fences in two places:

1. **`rp1 check-update`** -- Scans `CLAUDE.md`, `AGENTS.md`, and `.gitignore`
   for fence markers and reports staleness alongside CLI version information.
   See [`check-update`](check-update.md) for output format details.

2. **`rp1 update --check`** -- Includes fence staleness in its check output
   using the same logic.

When stale fences are found, rp1 suggests running `rp1 migrate` to upgrade
them.

## Upgrading Stanzas

Run `rp1 migrate` to upgrade stale stanza content:

```bash
rp1 migrate
```

The migrate command:

1. Scans each managed file for fence markers.
2. Extracts the version from the marker (legacy unversioned markers are treated
   as version `0.0.0`).
3. Compares against `LATEST_FENCE_VERSION`.
4. Replaces stale fenced content with the latest template and updates the
   markers to the current version.

Content you have written **outside** the fence markers is never modified.
Already-current files are skipped. The operation is idempotent.

### Dual-File Deduplication

When both `CLAUDE.md` and `AGENTS.md` carry fenced stanzas, `rp1 migrate`
deduplicates them during upgrade. The full stanza is written to `AGENTS.md` and
`CLAUDE.md` is switched to a single-line `@AGENTS.md` import reference inside
its fence. This matches the single-stanza injection behavior used by `rp1 init`
for new dual-file projects.

See [`rp1 migrate`](rp1-migrate.md) for full command documentation.

## Backward Compatibility

Legacy unversioned markers (`<!-- rp1:start -->`, `# rp1:start`) continue to
work with all rp1 operations including find, replace, validate, and uninstall.
They are treated as version `0.0.0` for staleness comparison and are always
eligible for upgrade via `rp1 migrate`.

## Typical Workflow

After upgrading the rp1 CLI:

```bash
# 1. Check if stanza content is outdated
rp1 check-update

# 2. If outdated, upgrade stanzas
rp1 migrate

# 3. Review and commit the updated files
git diff CLAUDE.md AGENTS.md .gitignore
git add CLAUDE.md AGENTS.md .gitignore
git commit -m "chore: upgrade rp1 stanza content"
```

## See Also

- [`rp1 migrate`](rp1-migrate.md) - Migrate and upgrade stanza content
- [`check-update`](check-update.md) - Check for CLI and stanza updates
- [`update`](update.md) - Update the rp1 CLI and plugins
