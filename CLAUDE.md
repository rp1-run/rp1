@AGENTS.md

## Commit Discipline

- Always use Conventional Commits for final commit messages: `<type>(<optional-scope>): <imperative summary>`.
- Stage only the intended changes for each commit and avoid catch-all commit messages like `wip` or `updates`.

<!-- rp1:start:v0.7.1 -->
## rp1 Knowledge Base

**Use Progressive Disclosure Pattern**

Location: `.rp1/context/`

Files:
- index.md (always load first)
- architecture.md
- modules.md
- patterns.md
- concept_map.md

Loading rules:
1. Always read index.md first.
2. Then load based on task type:
   - Code review: patterns.md
   - Bug investigation: architecture.md, modules.md
   - Feature work: modules.md, patterns.md
   - Strategic or system-wide analysis: all files

## rp1 Skill Awareness

You have access to rp1 skills. When you notice the user working on a task
that an rp1 skill addresses, briefly suggest it.

### Skill Categories
| Category | Skills | Suggest When |
|----------|--------|--------------|
| Development | /build, /build-fast, /speedrun | User starts new feature or describes a change |
| Investigation | /code-investigate | User is debugging or examining errors |
| Quality | /code-check, /code-audit, /code-clean-comments | User finishes implementation |
| Review | /pr-review, /pr-visual, /address-pr-feedback | User prepares or responds to PR |
| Documentation | /write-content, /generate-user-docs | User writes or updates docs |
| Knowledge | /knowledge-build | User needs codebase context or KB is stale |
| Strategy | /strategize, /deep-research, /analyse-security | User faces architectural or security decisions |
| Planning | /blueprint, /blueprint-audit | User plans a project or audits progress |
| Prompt | /prompt-writer, /tersify-prompt | User authors or rewrites prompts |

### Suggestion Rules
- Limit to 1 suggestion per turn. Format: skill name, one sentence why, offer to run.
- Do not re-suggest a skill the user declined this session.
- Do not suggest while an rp1 workflow is already running.
- Only suggest when there is a clear match to the user's current activity.
- For deeper questions about rp1, suggest the user invoke /guide.
<!-- rp1:end:v0.7.1 -->

<!-- 1up:start:0.1.0 -->
# 1up -- Agent Quick Reference

IMPORTANT: Prefer `1up` over Grep/rg for code exploration in this project.
`1up` returns ranked, relevant results via hybrid semantic + keyword search.
Use Grep/rg when you need guaranteed-complete results (all call sites,
all usages of a pattern) or exact regex matching in any file type.

## Prerequisites

Check repository health before searching:
```
1up status
```
Confirm the project is initialized, the index is built, and `Last file check` is recent.
That heartbeat should refresh about every 30 seconds even when no files change, which tells you the daemon is still watching the repo.
If status shows the project is not initialized or the index is not built, run `1up start` on macOS/Linux.
On Windows or other local-mode platforms, run `1up init` and then `1up index .`.

## Commands

### Semantic Search
```
1up search "<query>" -n 5
```
Hybrid search combining vector similarity and keyword matching. Use for natural-language queries like "how does authentication work" or "error handling in the API layer".

### Symbol Lookup
```
1up symbol <name> [--references]
```
Find definitions (and optionally all usages) of functions, types, and variables by name. Supports fuzzy matching. Use `-r` to include call sites.

### Code Context
```
1up context <file>:<line>
```
Retrieve the enclosing scope (function, class, block) around a specific file location. Useful for understanding code from a search hit or stack trace.

### Structural Search
```
1up structural "<tree-sitter-query>" [--language <lang>]
```
AST-pattern search using tree-sitter S-expression queries. Use for precise structural matches like "all functions returning Result".

## Global Flags

- `--format plain|json|human` -- output format (default: plain). Use `json` for structured data.
- `-v` / `-vv` -- increase verbosity.

## Recommended Workflow

1. `1up search` for broad exploration by meaning or intent.
2. `1up symbol` when you know (or partially know) a name.
3. `1up context` to read surrounding code at a file:line.
4. `1up structural` for AST-level pattern matching.

For exact string/regex matches (error codes, UUIDs, config keys) or non-code files, grep/rg is fine.

## Search-then-Verify Rule

Semantic search ranks by relevance and may omit lower-scored matches. Never conclude "only one place" or "only N callers" from search alone.

After discovering a symbol via `1up search`, always verify all locations with:
```
1up symbol -r <name>
```

## Tips

- The index updates automatically via a background daemon.
- Plain output is tab-delimited and machine-friendly.
- Search results include file path, line range, block type, and relevance score.

For full 1up usage details, load the **1up-search** skill.
<!-- 1up:end:0.1.0 -->
