# blueprint

Guided wizard that captures project vision through a two-tier document hierarchy (charter + PRDs).

---

## Synopsis

=== "Claude Code"

    ```bash
    /blueprint
    /blueprint <prd-name>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-blueprint
    /rp1-dev-blueprint <prd-name>
    ```

## Description

The `blueprint` command creates the foundational documentation for your project through guided interviews. Each interview phase uses one logical agent to fill sections of the artifact incrementally.

It establishes a two-tier hierarchy:

1. **Charter** - Project-level vision document (why, who, scope)
2. **PRDs** - Surface-specific requirements (what to build)

### Harness Interaction Models

How the interview agent communicates with you depends on the harness topology:

- **Claude Code** (direct interaction) -- The agent runs in a single dispatch and asks you questions directly in the conversation. You answer inline and the agent writes completed sections immediately. The same agent continues throughout the phase.
- **Codex** (parent relay, same-agent continuation) -- The agent cannot prompt you directly. Instead, it yields a `needs_input` JSON envelope to the parent skill, which relays the question to you. Your answer is passed back to the **same** agent via `followup_task`, continuing the existing conversation. One logical agent handles the entire phase across multiple relay turns.
- **OpenCode, Copilot, Antigravity** (parent relay, fresh re-dispatch) -- These harnesses also relay questions via `needs_input` envelopes, but each answer triggers a **fresh re-dispatch** of the agent. The new agent instance recovers its place using a durable checkpoint embedded in the artifact, then resumes writing from where the previous instance left off.

All relay harnesses (Codex, OpenCode, Copilot, Antigravity) write sections incrementally and yield `needs_input` envelopes for each question. The difference is whether the same agent instance continues (Codex) or a new instance resumes from the checkpoint (OpenCode, Copilot, Antigravity).

### Resume

There are two distinct resume mechanisms:

- **Within-interview continuation** -- When a relay question-answer cycle completes mid-interview, the agent picks up where it left off. On Codex, this happens automatically because the same agent continues. On fresh-dispatch harnesses (OpenCode, Copilot, Antigravity), the new agent instance reads the durable checkpoint from the artifact to determine its position.
- **Re-running after interruption** -- If an interview is interrupted (agent error, session timeout, budget exhaustion), re-running `/blueprint` detects which sections still contain `_TBD_` placeholders and asks only about those incomplete sections. Already-completed sections are preserved. This `_TBD_` gap analysis works across all harnesses and is independent of the within-interview continuation mechanism.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PRD_NAME` | `$1` | No | (none) | Name of PRD to create |

## Workflows

### Default Flow (No Arguments)

Creates both charter and main PRD together:

=== "Claude Code"

    ```bash
    /blueprint
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-blueprint
    ```

### Named PRD Flow (Requires Existing Charter)

Creates additional PRD for a specific surface:

=== "Claude Code"

    ```bash
    /blueprint mobile-app
    /blueprint api
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-blueprint mobile-app
    /rp1-dev-blueprint api
    ```

## Output

| File | Location | Contents |
|------|----------|----------|
| Charter | `.rp1/context/charter.md` | Problem, users, business rationale, scope |
| PRD | `.rp1/work/prds/<name>.md` | Surface scope, requirements, timeline |

## Examples

### Starting a New Project

=== "Claude Code"

    ```bash
    /blueprint
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-blueprint
    ```

The wizard guides you through:

1. **Problem & Context** - What problem are you solving?
2. **Target Users** - Who will use this?
3. **Value Proposition** - What value does this deliver?
4. **Scope Guardrails** - What's in/out of scope?
5. **Success Criteria** - How will you measure success?

### Adding a New Surface

After creating a charter, add additional PRDs:

=== "Claude Code"

    ```bash
    /blueprint mobile
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-blueprint mobile
    ```

This creates `.rp1/work/prds/mobile.md` linked to the existing charter.

## Related Commands

- [`/build`](build.md) - End-to-end feature workflow (next step after blueprint)
- [`/build-fast`](build-fast.md) - Quick iteration for small tasks

## See Also

- [Feature Development Guide](../../guides/feature-development.md) - Complete workflow walkthrough
