# Codex Platform Capabilities

Codex is a first-class rp1 platform. This page documents validated capabilities, platform differences, and behavioral notes for skill authors and users.

---

## Capability Matrix

All capabilities below were validated through the [Codex Capability Validation Experiment](../../../.rp1/work/experiments/codex-capability-validation/results/scorecard.md) (9/9 tests passing).

| Capability | Supported | Notes |
|-----------|-----------|-------|
| Scoped instructions (`AGENTS.md`) | Yes | Codex loads `AGENTS.md` from the project root. Equivalent to `CLAUDE.md` for Claude Code. |
| Skill discovery | Yes | Skills installed to `~/.codex/skills/` are discoverable via `$skill-name` invocation. |
| Shell execution | Yes | Full shell access for build, test, and tool commands. |
| File operations (read/write/edit/search) | Yes | File editing uses `apply_patch` (unified diff format), not exact string replacement. |
| Subagent dispatch | Yes | Agents spawned via `Spawn agent:` / wait protocol. Defined in per-agent TOML files. |
| Parallel delegation | Yes | Multiple subagents can run concurrently with results merged on completion. |
| Structured output | Yes | Subagents can produce structured JSON output for aggregation. |
| End-to-end orchestration | Yes | Full multi-step workflows (plan, delegate, merge, verify) execute reliably. |
| Parameter handling | Yes (model-driven) | Parameters are extracted from the user's natural language prompt, not from native `$1`/`$ARGUMENTS` substitution. See [Parameter Handling](#parameter-handling). |
| Per-skill `allowed-tools` | No equivalent | Codex uses a sandbox execution policy rather than per-skill tool permissions. Skills cannot restrict their own tool access. |

## Platform Comparison

| Aspect | Claude Code | OpenCode | Codex |
|--------|-------------|----------|-------|
| Instruction file | `CLAUDE.md` | `CLAUDE.md` | `AGENTS.md` |
| Skill invocation | `/skill-name` | `/rp1-plugin-skill` | `$rp1-plugin-skill` |
| Install path (skills) | `~/.claude/commands/` | `~/.opencode/skills/` | `~/.codex/skills/` |
| Install path (agents) | N/A (inline) | N/A (inline) | `~/.codex/agents/rp1/` |
| Agent config | N/A | N/A | `~/.codex/config.toml` |
| Agent format | Markdown | Markdown | TOML with `developer_instructions` |
| Agent manifest | N/A | N/A | `openai.yaml` with `allow_implicit_invocation: false` |
| Parameter substitution | Native (`$1`, `$ARGUMENTS`) | Native (`$1`, `$ARGUMENTS`) | Model-extracted from instructional text |
| File editing model | Edit tool (exact string replacement) | edit_file (exact string replacement) | apply_patch (unified diff) |
| Tool permissions | `allowed-tools` frontmatter | Permission map | Sandbox execution policy |
| Agent dispatch | Task tool (sync) | task tool (sync) | spawn_agent + wait (async) |

## Parameter Handling

Codex does not support native argument substitution. During the rp1 build, the `param_transform` filter rewrites `$1`, `$2`, and `$ARGUMENTS` references into descriptive instructional text. The model extracts parameter values from the user's natural language prompt at runtime.

Skill authors do not need to do anything special for Codex parameter support. The `## 0. Parameters` table in each skill is preserved as instructional text, and the build pipeline handles the transformation automatically.

## Behavioral Notes for Skill Authors

- **Agent files are TOML, not markdown.** Codex agents use `.toml` files with a `developer_instructions` field instead of markdown agent files.
- **No per-skill tool restrictions.** Codex does not have an `allowed-tools` equivalent. All skills run with the same sandbox permissions.
- **Subagent dispatch is asynchronous.** Use `{% dispatch_agent %}` platform tags to generate the correct spawn/wait protocol automatically.
- **File edits use unified diffs.** Use `{% edit_model %}` platform tags to reference the correct editing tool per platform.
- **User input requires options.** The `request_user_input` tool on Codex requires an explicit options list. Use `{% ask_user %}` to handle this automatically.

## Related

- [Build Reference](build.md#codex-build-output) -- Codex build layout, install paths, and content transformations
- [Platform Tags](../../concepts/platform-tags.md) -- Semantic tags for cross-platform skill authoring
- [Platform Tags Reference](../platform-tags.md) -- Tag syntax and lint rules
- [Skill Format](../../concepts/skill-format.md) -- Canonical `SKILL.md` format including parameter tables
