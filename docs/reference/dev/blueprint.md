# blueprint

Guided wizard that captures project vision through a two-tier document hierarchy (charter + PRDs).

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-dev:blueprint
    /rp1-dev:blueprint <prd-name>
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint
    /rp1-dev/blueprint <prd-name>
    ```

## Description

The `blueprint` command creates the foundational documentation for your project through guided questioning. It establishes a two-tier hierarchy:

1. **Charter** - Project-level vision document (why, who, scope)
2. **PRDs** - Surface-specific requirements (what to build)

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PRD_NAME` | `$1` | No | (none) | Name of PRD to create |

## Workflows

### Default Flow (No Arguments)

Creates both charter and main PRD together:

=== "Claude Code"

    ```bash
    /rp1-dev:blueprint
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint
    ```

### Named PRD Flow (Requires Existing Charter)

Creates additional PRD for a specific surface:

=== "Claude Code"

    ```bash
    /rp1-dev:blueprint mobile-app
    /rp1-dev:blueprint api
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint mobile-app
    /rp1-dev/blueprint api
    ```

## Output

| File | Location | Contents |
|------|----------|----------|
| Charter | `.rp1/work/charter.md` | Problem, users, business rationale, scope |
| PRD | `.rp1/work/prds/<name>.md` | Surface scope, requirements, timeline |

## Examples

### Starting a New Project

=== "Claude Code"

    ```bash
    /rp1-dev:blueprint
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint
    ```

The wizard guides you through:

1. **Problem & Context** - What problem are you solving?
2. **Target Users** - Who will use this?
3. **Business Rationale** - Why build this now?
4. **Scope Guardrails** - What's in/out of scope?
5. **Success Criteria** - How will you measure success?

### Adding a New Surface

After creating a charter, add additional PRDs:

=== "Claude Code"

    ```bash
    /rp1-dev:blueprint mobile
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/blueprint mobile
    ```

This creates `.rp1/work/prds/mobile.md` linked to the existing charter.

## Related Commands

- [`feature-requirements`](feature-requirements.md) - Define specific features (next step)
- [`feature-design`](feature-design.md) - Create technical design

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Complete workflow walkthrough
