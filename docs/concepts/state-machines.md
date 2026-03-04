# Declarative State Machines

rp1 supports declarative workflow state management via embedded Mermaid state diagrams. Skills and agents that include a `## STATE-MACHINE` section with a `stateDiagram-v2` block get validated state transitions, dashboard visibility with step timelines, and run isolation -- without any changes to CLI, API, or UI code.

---

## How It Works

A skill or agent opts in to state management by embedding a `stateDiagram-v2` mermaid block inside a `## STATE-MACHINE` section in its markdown file:

```markdown
## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
```

**On each phase transition**, report via:
...
```

The system extracts and parses the state diagram into a typed model and uses it for:
- **Transition validation**: The CLI rejects invalid state transitions
- **Dashboard step timelines**: Steps are derived dynamically from the state machine
- **Run isolation**: Each workflow invocation is tracked independently via run IDs
- **WebSocket events**: Real-time progress updates pushed to the dashboard
- **Agent sub-state tracking**: Agents report state validated against their own state machine, nested within the parent workflow

Skills and agents without a `## STATE-MACHINE` section are completely unaffected -- no tracking, no validation, no dashboard presence.

---

## Defining a State Machine

Embed a standard [Mermaid stateDiagram-v2](https://mermaid.js.org/syntax/stateDiagram.html) block inside a `## STATE-MACHINE` section:

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
```

### Supported Syntax

| Syntax | Example | Purpose |
|--------|---------|---------|
| Initial transition | `[*] --> state_id` | Marks the starting state(s) |
| Terminal transition | `state_id --> [*]` | Marks ending state(s) |
| Simple transition | `source --> target` | State-to-state edge |
| Labeled transition | `source --> target : label` | Edge with description (informational) |
| State declaration | `state state_id : Description` | State with display label |
| Comment | `%% comment text` | Ignored by parser |

### Not Supported

These features are intentionally out of scope:
- Nested/composite states (`state Parent { ... }`)
- Fork/join (`<<fork>>`, `<<join>>`)
- Concurrent regions
- Notes, direction directives

### Rules

1. **State IDs must match step field values** used in `rp1 agent-tools work update --step` commands
2. **At least one initial state** is required (`[*] --> state_id`)
3. **Terminal states** are optional but recommended (`state_id --> [*]`)
4. **Transition labels** are informational -- validation operates on state-to-state edges, not labels
5. **One state machine per file** -- the extractor uses the first `stateDiagram-v2` block in the `## STATE-MACHINE` section

---

## Skill State Machines

Skills define their state machine directly in `SKILL.md`:

```markdown
## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
```

**On each phase transition**, report via:
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature {FEATURE_ID} \
  --workflow {SKILL_NAME} \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --status started

- Generate `RUN_ID` as a UUID at workflow start
- Report each step once when entering it; do not re-report the same step
- Follow transition edges in the graph; do not skip states
```

---

## Agent State Machines

Agents can also define state machines, enabling validated state tracking at the agent level. Agent state machines are embedded in the agent `.md` file:

```markdown
## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> building
    building --> completed : build_success
    building --> failed : build_error
    completed --> [*]
    failed --> [*]
```

**On each transition**, report via:
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature {FEATURE_ID} \
  --workflow {WORKFLOW} \
  --agent {AGENT_NAME} \
  --task {TASK_ID} \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --status started
```

### The `--agent` Flag

When an agent reports status, it uses the `--agent` flag to route validation to its own state machine instead of the parent workflow's:

```bash
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature auth-refactor \
  --workflow build \
  --agent task-builder \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step building \
  --status started
```

- `--workflow` remains required -- it determines which run the update is attributed to
- `--agent` determines which state machine to validate against
- If the named agent has no embedded state machine, the CLI returns an error listing available agent state machines

### Per-Task Tracking with `--task`

When an agent processes multiple tasks (e.g., task-builder implementing T1, T2, T3), each task's state is tracked independently using the `--task` flag:

```bash
# T1 starts building
rp1 agent-tools work update --workflow build --agent task-builder --task T1 \
  --run-id run-1 --step building --status started

# T1 completes
rp1 agent-tools work update --workflow build --agent task-builder --task T1 \
  --run-id run-1 --step completed --status started

# T2 starts building (independent of T1)
rp1 agent-tools work update --workflow build --agent task-builder --task T2 \
  --run-id run-1 --step building --status started
```

- `--task` requires `--agent` (error if used alone)
- Each task progresses through the agent's state machine independently
- The dashboard shows per-task state within the agent's nested view

### Parent Skill Context

Parent skills that spawn agents with state machines must pass workflow context so agent updates are attributed to the correct run:

| Parameter | Purpose |
|-----------|---------|
| WORKFLOW | Parent skill name (e.g., "build") |
| RUN_ID | Parent workflow's run UUID |
| FEATURE_ID | Feature identifier |

---

## Two-Layer State Model

The system maintains two orthogonal state dimensions for state-machine-enabled workflows:

| Dimension | What it represents | Values | Storage |
|-----------|--------------------|--------|---------|
| **StatusValue** | Activity category (WHAT is happening) | started, in_progress, waiting-input, needs-review, completed, failed | `status` column |
| **WorkflowState** | Workflow phase (WHERE in the workflow) | Defined by state diagram (e.g., requirements, design, build) | `step` column |

These are independent: a workflow can be "in_progress" at the "design" phase, or "waiting-input" at the "requirements" phase.

---

## CLI Usage

### Reporting State Transitions (Skills)

```bash
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --workflow build \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step design \
  --status started
```

### Reporting State Transitions (Agents)

```bash
rp1 agent-tools work update \
  --project "$(pwd)" \
  --feature my-feature \
  --workflow build \
  --agent task-builder \
  --task T1 \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step building \
  --status started
```

### CLI Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--workflow` | Yes (for state-machine skills/agents) | Skill name whose state machine to validate against (or parent workflow for agents) |
| `--agent` | No | Agent name -- routes validation to agent's state machine |
| `--task` | No | Task identifier for per-task tracking (requires `--agent`) |
| `--run-id` | Optional | UUID grouping updates into a discrete workflow run |
| `--step` | Yes | The workflow/agent state (must be a valid state ID) |
| `--status` | Yes | Activity status (started, in_progress, etc.) |
| `--ttl` | Optional | TTL in seconds for expiry (default: 28800 = 8 hours) |

### Transition Validation

Invalid transitions are rejected:

```
Error: Invalid transition from 'requirements' to 'verify'.
Valid next states: design
```

The first update for a run must target an initial state (one reached via `[*] -->` in the diagram).

### Run Isolation

Each `--run-id` creates an independent workflow invocation. Multiple concurrent runs of the same workflow on the same feature are tracked separately:

```bash
# Run A at "verify" phase
rp1 agent-tools work update --workflow build --run-id run-A --step verify --status in_progress

# Run B at "design" phase (independent)
rp1 agent-tools work update --workflow build --run-id run-B --step design --status in_progress
```

### Cleaning Up Stale Runs

Agents that crash mid-workflow leave rows with an `expires_at` timestamp. These rows are automatically filtered on read. For manual cleanup:

```bash
# Preview what would be deleted
rp1 agent-tools work cleanup --dry-run

# Delete all expired runs
rp1 agent-tools work cleanup

# Delete runs expired more than 24 hours ago
rp1 agent-tools work cleanup --older-than 24
```

---

## Examples

### Existing State Machines

**Skills**:

| Skill | States | Shape |
|-------|--------|-------|
| build | requirements, design, tasks, build, verify, archive | Linear with verify->build retry loop |
| build-fast | plan, build, review | Linear (3 steps) |
| pr-review | split, review, synthesize, post | Linear (4 steps) |
| deep-research | clarify, plan, explore, synthesize, report | Linear (5 steps) |
| blueprint | detect, charter, prd | Branching (detect -> charter or prd) |

**Agents**:

| Agent | States | Shape |
|-------|--------|-------|
| task-builder | building, completed, failed | Linear with error branch |
| task-reviewer | reviewing, completed, failed | Linear with error branch |
| feature-verifier | verifying, completed, failed | Linear with error branch |
| hypothesis-tester | testing, completed, failed | Linear with error branch |

### Adding State Tracking to a New Skill

1. Add a `## STATE-MACHINE` section to your `SKILL.md`:

```markdown
## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> scan
    scan --> analyze : scan_complete
    analyze --> report : analysis_complete
    report --> [*] : done
```
```

2. Include the CLI command template for reporting transitions (see template above).

3. The skill now appears in the dashboard with a 3-step timeline -- no API or UI code changes needed.

### Adding State Tracking to an Agent

1. Add a `## STATE-MACHINE` section to the agent `.md` file with the state diagram and CLI template using `--agent`.

2. Ensure the parent skill passes `WORKFLOW`, `RUN_ID`, and `FEATURE_ID` to the agent.

3. Agent state transitions appear nested within the parent workflow's phase on the dashboard.

---

## Related Concepts

- [SKILL.md Format](skill-format.md) -- How skills are structured
- [Skill-Agent Pattern](command-agent-pattern.md) -- How skills delegate to agents
- [Web UI Dashboard](../web-ui/v2-dashboard.md) -- Where workflow progress is displayed
