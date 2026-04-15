# phase-plan

Decompose a completed PRD or oversized requirements artifact into durable
delivery phases before feature execution starts.

---

## Synopsis

=== "Claude Code"

    ```bash
    /phase-plan <source> [update-context...] [--afk]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-phase-plan <source> [update-context...] [--afk]
    ```

=== "Codex"

    ```bash
    $rp1-dev-phase-plan <source> [update-context...] [--afk]
    ```

## Description

The `phase-plan` command adds an explicit planning layer between a large
planning artifact and feature execution. It reads a completed PRD or an
oversized `requirements.md`, writes a durable source-adjacent `phase-plan.md`
artifact, and refreshes the source document with backlinks to the current
phases.

Use it when the work no longer fits a single independently executable feature.
`/phase-plan` is explicit: rp1 does not run it automatically just because a PRD
exists.

!!! tip "Typical handoff"
    A large initiative usually flows through `/blueprint` or a manually written
    PRD, then `/phase-plan`, then `/build` for each child feature.

## Accepted Sources

`SOURCE` must resolve to one of these artifact types under the canonical work
root:

| Source Type | Example | Output Path |
|-------------|---------|-------------|
| PRD | `.rp1/work/prds/auth-overhaul.md` | `.rp1/work/prds/auth-overhaul-phase-plan.md` |
| Oversized feature requirements | `.rp1/work/features/auth-overhaul/requirements.md` | `.rp1/work/features/auth-overhaul/phase-plan.md` |

Do not point `/phase-plan` at an existing `phase-plan.md` file. Refreshes still
target the original source artifact.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `SOURCE` | `$1` | Yes | - | Planning source path or identifier |
| `UPDATE_CONTEXT` | `$2` | No | `""` | Optional revision guidance when refreshing an existing phase plan |
| `--afk` | flag | No | `false` | Non-interactive mode |

## Workflow

The workflow uses one fresh tracked run per invocation:

| Phase | What Happens |
|------|---------------|
| Analyze | Validates the source, loads planning context, and decomposes the work into the smallest valuable or risk-reducing phases |
| Publish | Writes the source-adjacent phase plan and refreshes the source document's `## Delivery Phase Plan` backlink section |
| Complete | Registers the generated artifact and returns the source path, artifact path, and stable phase IDs |

## Output

### Phase Plan Artifact

`phase-plan.md` is the durable handoff between planning and execution. Every
plan includes:

- Overview of why phase decomposition is needed now
- Phase summary table with stable phase IDs (`P1`, `P2`, ...)
- Per-phase details: value or risk retired, included scope, deferred scope,
  exit criteria, and manual verification expectations
- Child feature handoff rows with next-step `/build` commands
- Traceability back to the original planning source

### Source Backlinks

The source document is refreshed with a `## Delivery Phase Plan` section that:

- links to the current phase-plan artifact
- lists the current phase anchors
- preserves the rest of the source document unchanged

### Child Feature Handoffs

Phase plans emit child-feature commands in the form:

```bash
/build child-feature-id "Implement the scoped slice" PHASE_PLAN_PATH=prds/example-phase-plan.md PHASE_ID=P1
```

`/build` converts those phase-context tokens into a durable
`## Planning Traceability` section in the child feature's `requirements.md`.

## Examples

### Decompose a PRD into phases

=== "Claude Code"

    ```bash
    /phase-plan prds/auth-overhaul.md
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-phase-plan prds/auth-overhaul.md
    ```

=== "Codex"

    ```bash
    $rp1-dev-phase-plan prds/auth-overhaul.md
    ```

### Decompose oversized feature requirements

=== "Claude Code"

    ```bash
    /phase-plan features/auth-overhaul/requirements.md
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-phase-plan features/auth-overhaul/requirements.md
    ```

=== "Codex"

    ```bash
    $rp1-dev-phase-plan features/auth-overhaul/requirements.md
    ```

### Refresh an existing plan with new guidance

=== "Claude Code"

    ```bash
    /phase-plan prds/auth-overhaul.md "Split rollout risk and platform migration into separate phases"
    ```

=== "OpenCode"

    ```bash
    /rp1-dev-phase-plan prds/auth-overhaul.md "Split rollout risk and platform migration into separate phases"
    ```

=== "Codex"

    ```bash
    $rp1-dev-phase-plan prds/auth-overhaul.md "Split rollout risk and platform migration into separate phases"
    ```

## Related Commands

| Command | When to Use |
|---------|-------------|
| [`blueprint`](blueprint.md) | Create or refine the PRD that will feed phase planning |
| [`build`](build.md) | Execute one child feature after phase planning is complete |
| [`build-fast`](build-fast.md) | Handle small and medium requests that do not need phase planning |
