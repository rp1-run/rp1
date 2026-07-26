@AGENTS.md

## Commit Discipline

- Always use Conventional Commits for final commit messages: `<type>(<optional-scope>): <imperative summary>`.
- Stage only the intended changes for each commit and avoid catch-all commit messages like `wip` or `updates`.

<!-- 1up:start:0.1.7 -->
# 1up — Agent Quick Reference

## Tool Selection

Pick by what you know, not by habit:

| You know... | Use | Reason |
|---|---|---|
| Concept, not files/keywords | `1up search` | Semantic search needs no vocabulary |
| Symbol/keyword name | `1up symbol -r` or `grep` | Literal match = precise, low noise |
| Keyword, need ALL instances | `grep` | Guaranteed-complete, best signal:noise |
| Nothing (new codebase) | `1up search` | Works w/o prior knowledge |

**Sub-agents**: Include this section in sub-agent prompts.

## Setup

`1up status` before searching. Confirm index built + `Last file check` recent (~30s refresh). If not initialized: `1up start` (macOS/Linux) or `1up init && 1up index .`.

## Commands

```
1up search "<query>" -n 5          # semantic + keyword hybrid
1up symbol <name> [-r]             # def lookup; -r = all references
1up context <file>:<line>          # enclosing scope at location
1up impact --from-symbol <name>    # blast radius from symbol
1up impact --from-file <path>      # blast radius from file
1up impact --from-segment <id>     # blast radius from segment
1up structural "<ts-query>"        # tree-sitter AST pattern search
```

Flags: `--format plain|json|human` (default: plain), `-v`/`-vv`.

## Workflow

1. `search` — explore by meaning/intent
2. `symbol` — known or partial name lookup
3. `context` — read scope at file:line
4. `impact` — dependency/blast-radius analysis
5. `structural` — AST-level pattern matching

## Search-then-Verify

Semantic search ranks by relevance; may omit matches. Never conclude "only N callers" from search alone. Verify completeness w/ `1up symbol -r <name>` or `grep`.
<!-- 1up:end:0.1.7 -->
