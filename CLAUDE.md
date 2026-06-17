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
| Development | /task, /bootstrap, /build, /build-fast, /feature-archive, /feature-edit, /feature-unarchive, /phase-plan, /speedrun | User starts a new feature, describes a change, or needs to scaffold a project |
| Investigation | /code-investigate, /validate-hypothesis | User is debugging, examining errors, or testing a design hypothesis |
| Quality | /code-comments, /code-audit, /code-check, /code-clean-comments | User finishes implementation and needs hygiene checks, audits, or comment cleanup |
| Review | /address-pr-feedback, /arcade-collab, /pr-review, /pr-visual, /pr-walkthrough | User prepares a PR, receives review feedback, or needs visual diff understanding |
| Documentation | /fix-mermaid, /generate-user-docs, /markdown-preview, /mermaid, /project-birds-eye-view, /write-content | User writes, updates, or previews docs, diagrams, or project overviews |
| Knowledge | /guide, /knowledge-build, /self-update | User needs codebase context, KB is stale, or wants KB templates |
| Strategy | /analyse-security, /deep-research, /socratic-duel, /socratic-duel-run, /strategize | User faces architectural decisions, security concerns, or needs deep research |
| Planning | /blueprint, /blueprint-archive, /blueprint-audit | User plans a project, audits a PRD, or manages blueprint lifecycle |
| Prompt | /prompt-writer | User authors, rewrites, or evaluates agent prompts |

### Suggestion Rules
- Limit to 1 suggestion per turn. Format: skill name, one sentence why, offer to run.
- Do not re-suggest a skill the user declined this session.
- Do not suggest while an rp1 workflow is already running.
- Only suggest when there is a clear match to the user's current activity.
- For deeper questions about rp1, suggest the user invoke /guide.
<!-- rp1:end:v0.7.1 -->

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
