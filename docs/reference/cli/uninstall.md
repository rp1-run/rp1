# uninstall

Remove rp1-managed project content or host-specific assets.

---

## Synopsis

```bash
rp1 uninstall [options]
rp1 uninstall gemini [options]
```

## Description

`rp1 uninstall` removes rp1-managed project setup from the current repository
while preserving `.rp1/` work and knowledge artifacts.

`rp1 uninstall gemini` removes only experimental rp1 Gemini CLI extension assets
that match the Gemini asset manifest. It does not remove user-created Gemini
files, third-party Gemini extensions, or modified rp1 files that no longer match
the manifest.

## Project Uninstall

```bash
rp1 uninstall
rp1 uninstall --dry-run
rp1 uninstall -y
```

Project uninstall removes managed content from instruction files and `.gitignore`
and can uninstall rp1 plugins from Claude Code. The `.rp1/` directory is
preserved because it contains the project knowledge base and work artifacts.

## Gemini Extension Uninstall

```bash
rp1 uninstall gemini
rp1 uninstall gemini --dry-run
rp1 uninstall gemini --yes
```

Gemini uninstall is scoped to rp1-owned files under:

```text
~/.gemini/extensions/rp1-phase2-validation/
```

It removes manifest-owned validation assets for `/rp1:smoke`,
`/rp1:subagents`, `/rp1:boundaries`, and the rp1 validation agents only when
their contents still match the current rp1 manifest.

Gemini uninstall affects only this opt-in experimental validation surface. It
does not remove or downgrade stable Claude Code, OpenCode, Codex, or GitHub
Copilot CLI integrations.

## Gemini Safety Rules

| Case | Behavior |
|------|----------|
| `--dry-run` | Prints `Dry run: would remove rp1-owned Gemini assets` and makes no changes. |
| Current rp1-owned asset | Removes the file when `--yes` is supplied or the interactive prompt is accepted. |
| Missing asset | Treats it as already inactive and keeps going. |
| Modified manifest asset | Preserves it and reports it under `Skipped files that were not safe to remove`. |
| Unexpected leftover | Preserves it and reports it under `Unexpected leftovers preserved`. |
| Empty rp1 Gemini directory | Removes empty rp1-owned directories when safe. |

## Post-Removal Verification

After removal, verify that Gemini no longer reports active rp1 validation
assets:

```bash
rp1 verify gemini
```

The expected post-removal lifecycle state is `removed` or another inactive state
that points back to `rp1 install gemini` as the setup action. A removed Gemini
extension is not a first-class Gemini support failure; it means the experimental
validation assets are no longer installed.

See the [Gemini CLI platform guide](../platforms/gemini.md) for the support
matrix and removal-lifecycle limitations.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | | Show what would be removed without changing anything |
| `--yes` | `-y` | Skip confirmation prompts |
| `--scope <scope>` | `-s` | Project uninstall only: Claude Code plugin scope, one of `user`, `project`, or `local` |
| `--help` | `-h` | Display help information |

## Troubleshooting

### Gemini Files Were Preserved

If `rp1 uninstall gemini` preserves files, it found content that was not safe to
remove automatically. Review the printed paths before deleting anything
manually. The command intentionally fails closed around modified files and
unexpected leftovers.

### Gemini Still Appears Installed

Run:

```bash
rp1 verify gemini
```

If verification reports `current`, rerun `rp1 uninstall gemini --dry-run` to see
which manifest-owned assets remain. If verification reports `blocked`, fix the
printed file-permission issue and retry uninstall.

## See Also

- [install](install.md)
- [update](update.md)
- [Gemini CLI Platform Guide](../platforms/gemini.md)
- [Fence Versioning](fence-versioning.md)
