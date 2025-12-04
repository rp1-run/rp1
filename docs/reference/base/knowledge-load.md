# knowledge-load

Loads and prepares knowledge base context for downstream agents.

---

## Synopsis

=== "Claude Code"

    ```bash
    /knowledge-load
    ```

=== "OpenCode"

    ```bash
    /rp1-base/knowledge-load
    ```

## Description

The `knowledge-load` command ingests the knowledge base from `.rp1/context/` and prepares it for use by other agents. It builds an internal knowledge graph, extracts entities and relationships, and optimizes the context for memory constraints.

This command is typically called internally by other KB-aware agents, but can be invoked directly to verify the KB is loadable.

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Root directory for KB artifacts |
| `PROJECT_PATH` | `.` | Project path (for monorepo subprojects) |
| `FOCUS_MODE` | `balanced` | Context allocation strategy |
| `MEMORY_BUDGET` | Auto | Memory limit for loaded context |

### Focus Modes

| Mode | Allocation | Use Case |
|------|------------|----------|
| `project` | 80% project / 20% system | Feature development |
| `system` | 50% project / 50% system | Architecture analysis |
| `balanced` | 60% project / 40% system | General use |

## Loading Strategy

The command adapts its loading strategy based on repository type:

**Single Project:**
- Loads: `index.md`, `concept_map.md`, `architecture.md`, `modules.md`, `patterns.md`

**Monorepo Root:**
- Loads: `index.md`, `architecture.md`, `dependencies.md`, `patterns.md`
- Optional: Project summaries

**Monorepo Subproject:**
- Loads: `dependencies.md`, `patterns.md`, `projects/{name}/*.md`
- Context: System architecture and shared components

## Examples

### Basic Usage

=== "Claude Code"

    ```bash
    /knowledge-load
    ```

=== "OpenCode"

    ```bash
    /rp1-base/knowledge-load
    ```

**Expected output (single project):**
```
READY
```

**Expected output (monorepo):**
```
READY [monorepo: 2 projects - rp1-base, rp1-dev]
```

### Error Response

If the KB doesn't exist or is corrupted:

```
ERROR: Required documentation files not found. Run /knowledge-build first.
```

## Output

The command returns a simple status:

| Response | Meaning |
|----------|---------|
| `READY` | Single project KB loaded successfully |
| `READY [system: N projects]` | Monorepo root KB loaded |
| `READY [project: name]` | Monorepo subproject KB loaded |
| `ERROR: message` | Loading failed with reason |

## Memory Budget Management

If the KB exceeds memory budget, compression is applied in this order:

1. Remove tertiary project details (keep interfaces only)
2. Compress unused shared code
3. Summarize verbose descriptions
4. Remove historical information
5. Compress target project details (last resort)

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How agents use KB context
