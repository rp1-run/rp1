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

The `blueprint` command creates the foundational documentation for your project through guided interviews. Each interview phase dispatches an agent once to fill sections of the artifact incrementally.

It establishes a two-tier hierarchy:

1. **Charter** - Project-level vision document (why, who, scope)
2. **PRDs** - Surface-specific requirements (what to build)

### Harness Interaction Models

How the interview agent communicates with you depends on the harness:

- **Claude Code** (direct interaction) -- The dispatched agent asks you questions directly in the conversation. You answer inline and the agent writes completed sections immediately.
- **Codex, OpenCode, Copilot, Antigravity** (relay harnesses) -- The agent cannot prompt you directly. Instead, it sends a JSON envelope to the parent skill, which relays the question to you. Your answer is passed back to the agent in a follow-up dispatch, and the agent resumes from where it left off.

On relay harnesses, each question-answer exchange is a separate dispatch cycle. The agent uses `_TBD_` gap analysis on re-dispatch to determine which sections still need input.

### Resume

If an interview is interrupted, re-running `/blueprint` detects which sections still contain `_TBD_` placeholders and asks only about those incomplete sections. Already-completed sections are preserved. This works identically across all harnesses -- the `_TBD_` gap analysis is the universal resume mechanism.

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
