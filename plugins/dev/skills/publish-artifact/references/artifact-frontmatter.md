# Artifact Frontmatter Reference

rp1 artifacts are markdown under `.rp1/work/`. A YAML frontmatter block (delimited by
`---`) is **optional** — some rp1 docs have none. Every field is optional too; the skill
degrades gracefully and never refuses an artifact for a missing field.

## Fields the skill reads (all optional)

| Field | Common on | Used for |
|---|---|---|
| `producer` | every templated rp1 doc | Header table "Producer" row. |
| `type` | every templated rp1 doc (`document`) | Header "Artifact type" when `artifact` is absent. |
| `artifact` | legacy/rich artifacts only | Header "Artifact type"; legacy title derivation. |
| `rp1_doc_id` | many persisted artifacts | Idempotency key when present (see projection-format.md). |
| `issue_id` | legacy/rich artifacts only | Legacy title suffix; "Issue ID" row. |
| `status` | legacy/rich artifacts only | `incomplete` → banner; "Status" row. |
| `date` | legacy/rich artifacts only | "Generated" row. |

Routing fields `scope`, `path_pattern`, `description`, `strictness` are present on most rp1
templated docs but are **not** rendered — the skill ignores them. Any other field is ignored too.

## Real shapes seen in the wild

- **Rich (legacy):** `producer`, `artifact`, `issue_id`, `status`, `date`, `rp1_doc_id`.
- **Routing + doc_id (common):** `scope`, `path_pattern`, `producer`, `type`, `description`,
  `strictness`, `rp1_doc_id`.
- **Routing only:** the same minus `rp1_doc_id`.
- **None:** no frontmatter block at all.

## Title derivation (precedence)

1. `artifact` field → Title-Case, plus ` — {issue_id}` if `issue_id` present.
2. else the document's first H1 heading (verbatim).
3. else `producer` → Title-Case.
4. else the filename stem → Title-Case.

## Parsing note

`scripts/project.py` parses frontmatter with Python stdlib only. A key line must start at
column 0 (`^key: value`); indented continuation lines of multi-line quoted values are not
parsed as keys, so a colon inside a wrapped `description` cannot create a bogus key.
