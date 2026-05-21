# Retired Gemini CLI Platform Notes

Gemini CLI support was never released as a public rp1 platform. The unreleased
Gemini work remains documented here only as historical provenance for maintainers
reviewing the Antigravity replacement.

Use [Antigravity CLI](antigravity.md) for the active Google host target.

## What Changed

The active Google host target is now Antigravity CLI with the `agy` binary and
Antigravity plugin assets. User-facing lifecycle, support matrix, verifier,
generated guide, and release guidance should point to Antigravity.

Historical Gemini artifacts may still exist in branch history, old feature work
directories, or `.rp1/work` provenance from the unreleased Gemini effort. Those
artifacts explain why an implementation choice was made, but they do not prove
current Antigravity behavior.

## Allowed Historical Uses

Gemini references are allowed only when they are clearly historical, such as:

- retained `.rp1/work` evidence from unreleased Gemini planning or validation
- source citations that explain the Antigravity replacement history
- maintainer notes that explicitly distinguish old Gemini evidence from fresh
  Antigravity validation

Do not use Gemini wording for active install, verify, update, uninstall,
support-matrix, release, or troubleshooting guidance.

## Active Replacement

Use these Antigravity commands and docs instead:

```bash
rp1 install antigravity
rp1 verify antigravity --workflow <workflow-id>
rp1 update plugins antigravity
rp1 uninstall antigravity
```

See [Antigravity CLI](antigravity.md) for package layout, permissions, sandbox
behavior, MCP guidance, dynamic delegation, support-matrix states, and
troubleshooting.
