# knowledge-build

Orchestrates parallel knowledge base generation into `.rp1/context/` using spatial analysis and a map-reduce architecture.

---

## Synopsis

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

Optional feature-learning mode:

=== "Claude Code"

    ```bash
    /knowledge-build my-feature
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build my-feature
    ```

## Description

The `knowledge-build` command analyzes your codebase and updates the structured knowledge base in `.rp1/context/`. It is a passive workflow: it does not create user-facing work artifacts under `.rp1/work/`, and it does not register an Arcade run.

The command uses a parallel map-reduce architecture:

1. **Spatial Analysis**: Categorizes files by KB section
2. **Parallel Processing**: 4 agents analyze files simultaneously
3. **Merge**: Orchestrator merges results, generates index.md, writes final KB files

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `feature-id` | No | Capture learnings from an archived or active feature into the KB |

## Build Modes

The command automatically detects the appropriate build mode:

| Mode | Condition | Duration |
|------|-----------|----------|
| **Skip** | KB exists, no git changes | Instant |
| **Full** | First build or >50 files changed | 10-15 min |
| **Incremental** | <50 files changed since last build | 2-5 min |
| **Feature Learning** | `feature-id` provided | Depends on feature scope |

`Full` means wide evidence collection, not blank-slate regeneration. If prior KB exists, agents should reconcile against it rather than rewrite from zero. They should also treat the prior as incomplete and perform an explicit novelty scan for material knowledge absent from it. In both `Full` and `Incremental`, the full in-scope change set remains explicit evidence; `Full` widens beyond that frontier, while `Incremental` stays closer to it.

## Output

The command generates knowledge base files in `.rp1/context/`.

!!! info "KB File Reference"
    See [What's in the Knowledge Base?](../../concepts/knowledge-aware-agents.md#whats-in-the-knowledge-base) for the complete list of generated files and their purposes.

**Note**: `meta.json` contains local paths and should be added to `.gitignore`. It is written locally but not intended as a shared project artifact.

## Examples

### First-Time Build

=== "Claude Code"

    ```bash
    /knowledge-build
    ```

=== "OpenCode"

    ```bash
    /rp1-base-knowledge-build
    ```

**Expected output:**
```
First-time KB generation with parallel analysis (10-15 min)
Analyzing...
✅ Knowledge Base Generated Successfully

Strategy: Parallel map-reduce
Repository: single-project
Files Analyzed: 142

KB Files Written:
- .rp1/context/index.md
- .rp1/context/concept_map.md
- .rp1/context/architecture.md
- .rp1/context/modules.md
- .rp1/context/patterns.md
- .rp1/context/state.json (shareable)
- .rp1/context/meta.json (local - add to .gitignore)

No Arcade run is created for this passive workflow.
```

### Incremental Build

When you've made changes since the last build:

**Expected output:**
```
Changes detected since last build (a1b2c3d → e4f5g6h). Analyzing 12 changed files (2-5 min)
✅ Knowledge Base Generated Successfully
```

### Feature Learning Build

Capture lessons from a completed feature:

```bash
/knowledge-build user-auth
```

**Expected output:**
```
Feature learning build for user-auth
✅ Feature Learnings Captured
```

### No Changes

When the codebase hasn't changed:

**Expected output:**
```
✓ KB is up-to-date (commit a1b2c3d). No regeneration needed.
```

## Architecture

```mermaid
flowchart TB
    subgraph "Phase 1"
        SA[Spatial Analyzer]
    end

    subgraph "Phase 2 (Parallel)"
        A1[concept-extractor]
        A2[architecture-mapper]
        A3[module-analyzer]
        A4[pattern-extractor]
    end

    subgraph "Phase 3"
        M[Merge + Generate index.md]
    end

    SA --> A1
    SA --> A2
    SA --> A3
    SA --> A4

    A1 --> M
    A2 --> M
    A3 --> M
    A4 --> M
```

## Related Commands

- [`knowledge-load`](knowledge-load.md) - Load KB context for agents

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How agents use the KB
- [Map-Reduce Workflows](../../concepts/map-reduce-workflows.md) - The parallel architecture
