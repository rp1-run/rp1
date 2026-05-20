# uninstall

Remove rp1-managed project content or host-specific assets.

---

## Synopsis

```bash
rp1 uninstall [options]
rp1 uninstall antigravity [options]
```

## Description

`rp1 uninstall` removes rp1-managed project setup from the current repository
while preserving `.rp1/` work and knowledge artifacts.

`rp1 uninstall antigravity` removes only rp1 Antigravity CLI plugin assets that
match the Antigravity asset manifest. It does not remove user-created
Antigravity files, third-party Antigravity plugins, or modified rp1 files that
no longer match the manifest.

## Project Uninstall

```bash
rp1 uninstall
rp1 uninstall --dry-run
rp1 uninstall -y
```

Project uninstall removes managed content from instruction files and `.gitignore`
and can uninstall rp1 plugins from Claude Code. The `.rp1/` directory is
preserved because it contains the project knowledge base and work artifacts.

## Antigravity Plugin Uninstall

```bash
rp1 uninstall antigravity
rp1 uninstall antigravity --dry-run
rp1 uninstall antigravity --yes
```

Antigravity uninstall is scoped to rp1-owned files under:

```text
~/.gemini/antigravity-cli/rp1-base/
~/.gemini/antigravity-cli/rp1-dev/
```

It removes manifest-owned Antigravity assets only when their
contents still match the current rp1 manifest.

Antigravity uninstall affects only this Antigravity plugin target. It does not
remove or downgrade stable Claude Code, OpenCode, Codex, or GitHub Copilot CLI
integrations.

## Antigravity Safety Rules

| Case | Behavior |
|------|----------|
| `--dry-run` | Prints `Dry run: would remove rp1-owned Antigravity assets` and makes no changes. |
| Current rp1-owned asset | Removes the file when `--yes` is supplied or the interactive prompt is accepted. |
| Missing asset | Treats it as already inactive and keeps going. |
| Modified manifest asset | Preserves it and reports it under `Skipped files that were not safe to remove`. |
| Unexpected leftover | Preserves it and reports it under `Unexpected leftovers preserved`. |
| Empty rp1 Antigravity directory | Removes empty rp1-owned directories when safe. |

## Post-Removal Verification

After removal, verify that Antigravity no longer reports active rp1
Antigravity plugin assets:

```bash
rp1 verify antigravity
```

The expected post-removal lifecycle state is `removed` or another inactive state
that points back to `rp1 install antigravity` as the setup action. A removed
Antigravity plugin is not an Antigravity workflow-support failure; it means the
Antigravity assets are no longer installed.

See the [Antigravity CLI platform guide](../platforms/antigravity.md) for the
support matrix and removal-lifecycle limitations.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | | Show what would be removed without changing anything |
| `--yes` | `-y` | Skip confirmation prompts |
| `--scope <scope>` | `-s` | Project uninstall only: Claude Code plugin scope, one of `user`, `project`, or `local` |
| `--help` | `-h` | Display help information |

## Troubleshooting

### Antigravity Files Were Preserved

If `rp1 uninstall antigravity` preserves files, it found content that was not
safe to remove automatically. Review the printed paths before deleting anything
manually. The command intentionally fails closed around modified files and
unexpected leftovers.

### Antigravity Still Appears Installed

Run:

```bash
rp1 verify antigravity
```

If verification reports `current`, rerun
`rp1 uninstall antigravity --dry-run` to see which manifest-owned assets
remain. If verification reports `blocked`, fix the printed file-permission
issue and retry uninstall.

## See Also

- [install](install.md)
- [verify](verify.md)
- [update](update.md)
- [Antigravity CLI Platform Guide](../platforms/antigravity.md)
- [Fence Versioning](fence-versioning.md)
