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

1. **State IDs must match step field values** used in `rp1 agent-tools emit --step` commands
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
rp1 agent-tools emit \
  --workflow {WORKFLOW_NAME} \
  --type status_change \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --data '{"status": "running"}'

- Generate `RUN_ID` as a UUID at workflow start
- Report each step with `--data '{"status": "running"}'` when entering it
- For non-terminal states: moving to the next state implies the previous completed
- For terminal states (those with `→ [*]` transitions): report with `--data '{"status": "completed"}'` when the step's work finishes
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
rp1 agent-tools emit \
  --workflow {WORKFLOW} \
  --type status_change \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --unit {TASK_ID} \
  --data '{"status": "running"}'
```

### Agent Status Reporting

Agents report status using the same `emit` command. The `--unit` flag can be used for per-task tracking:

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step building \
  --unit T1 \
  --data '{"status": "running"}'
```

- `--workflow` identifies which workflow this run belongs to
- `--run-id` associates the event with the parent workflow run
- `--unit` enables per-task tracking within the agent

### Sub-Agent Namespaced Steps

Sub-agents that emit steps into a parent run must prefix their step names with the agent identifier and a colon separator. This prevents sub-agent state IDs from colliding with parent workflow states.

**Format:** `{agent-name}:{step-name}`

| Agent | Namespaced Steps |
|-------|-----------------|
| task-builder | `task-builder:building`, `task-builder:completed`, `task-builder:failed` |
| feature-verifier | `feature-verifier:verifying`, `feature-verifier:completed`, `feature-verifier:failed` |
| task-reviewer | `task-reviewer:reviewing`, `task-reviewer:completed`, `task-reviewer:failed` |
| hypothesis-tester | `hypothesis-tester:testing`, `hypothesis-tester:completed`, `hypothesis-tester:failed` |

Namespaced steps are persisted with their full prefixed name and are not validated against the parent workflow's state machine.

### Per-Task Tracking with `--unit`

When an agent processes multiple tasks (e.g., task-builder implementing T1, T2, T3), each task's state is tracked independently using the `--unit` flag:

```bash
# T1 starts building
rp1 agent-tools emit --workflow build --type status_change --run-id run-1 \
  --step building --unit T1 --data '{"status": "running"}'

# T1 completes
rp1 agent-tools emit --workflow build --type status_change --run-id run-1 \
  --step completed --unit T1 --data '{"status": "completed"}'

# T2 starts building (independent of T1)
rp1 agent-tools emit --workflow build --type status_change --run-id run-1 \
  --step building --unit T2 --data '{"status": "running"}'
```

- Each task progresses through the workflow independently
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
| **StatusValue** | Activity category (WHAT is happening) | not_started, running, waiting, completed, failed, skipped | `status` column |
| **WorkflowState** | Workflow phase (WHERE in the workflow) | Defined by state diagram (e.g., requirements, design, build) | `step` column |

These are independent: a workflow can be "in_progress" at the "design" phase, or "waiting-input" at the "requirements" phase.

---

## CLI Usage

### Reporting State Transitions (Skills)

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step design \
  --data '{"status": "running", "feature": "my-feature"}'
```

### Reporting State Transitions (Agents)

```bash
rp1 agent-tools emit \
  --workflow build \
  --type status_change \
  --run-id "550e8400-e29b-41d4-a716-446655440000" \
  --step building \
  --unit T1 \
  --data '{"status": "running", "feature": "my-feature"}'
```

### CLI Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--type` | Yes | Event type (e.g., `status_change`, `artifact_registered`) |
| `--workflow` | Yes | Workflow name (e.g., `build`, `pr-review`) |
| `--run-id` | Yes | UUID grouping events into a discrete workflow run |
| `--step` | Yes (for status_change) | The workflow/agent state (must be a valid state ID) |
| `--unit` | No | Task/unit identifier for per-task tracking |
| `--data` | Yes (for status_change) | JSON payload with status (e.g., `'{"status": "running"}'`) |
| `--project` | No | Project path (defaults to cwd) |

### Step Validation

Every `--step` value is validated against the workflow's state machine before the event is persisted. Validation is strict -- there is no lenient mode, no opt-out flag, and no warn-and-persist fallback.

**Rules:**

- If the step name is not a valid state ID in the workflow's state machine, the emit is rejected with a non-zero exit code and the event is not persisted.
- Workflows without a `## STATE-MACHINE` section skip validation entirely (no error).
- Namespaced steps (containing a colon, e.g., `task-builder:building`) bypass parent state machine validation. See [Sub-Agent Namespaced Steps](#sub-agent-namespaced-steps).

**Error message format (with known current state):**

```
Error: step "biulding" is not a valid state in the "build" state machine. Valid states: [requirements, design, tasks, build, verify, archive]. Current state: "tasks". Valid transitions from "tasks": [build].
```

**Error message format (unknown current state, e.g., first emit):**

```
Error: step "biulding" is not a valid state in the "build" state machine. Valid states: [requirements, design, tasks, build, verify, archive].
```

Error messages include valid transitions from the current state so that calling agents can self-correct on retry without consulting external documentation.

### Predecessor Auto-Completion

When a step-level `status_change` event with status `"running"` is emitted (and no `--unit` is set), the system automatically completes direct predecessor steps that are still in `"running"` or `"waiting"` status.

**How it works:**

1. The system uses the state machine's transition graph to identify direct predecessors of the current step. A direct predecessor is any state that has a transition edge leading to the current step.
2. For each direct predecessor whose latest status is `"running"` or `"waiting"`, a `status_change` event with `{ "status": "completed" }` is automatically inserted, timestamped just before the current event.
3. Predecessors with other statuses (`"completed"`, `"failed"`, `"skipped"`) are not modified.

**Why graph-based predecessors only:**

Only direct predecessors in the state machine graph are auto-completed -- not all steps currently in `"running"` status. This preserves correctness for parallel workflow branches where multiple steps may legitimately be running concurrently. Sibling branches are never touched.

**Exclusions:**

| Condition | Behavior |
|-----------|----------|
| `--unit` is set | No predecessor auto-completion (unit-level events manage their own lifecycle) |
| Step is namespaced (contains colon) | No predecessor auto-completion |
| Status is not `"running"` | No predecessor auto-completion |

**Example:**

Given a workflow with transitions `tasks --> build --> verify`, and `tasks` has latest status `"running"`:

```bash
rp1 agent-tools emit --workflow build --type status_change --run-id run-1 \
  --step build --data '{"status": "running"}'
```

The system auto-inserts a `"completed"` event for `tasks` (timestamped just before the `build` event), then persists the `build` running event. The run timeline shows `tasks` as completed and `build` as running.

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
rp1 agent-tools emit --workflow build --type status_change --run-id run-A --step verify --data '{"status": "running"}'

# Run B at "design" phase (independent)
rp1 agent-tools emit --workflow build --type status_change --run-id run-B --step design --data '{"status": "running"}'
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

1. Add a `## STATE-MACHINE` section to the agent `.md` file with the state diagram and CLI template.

2. Ensure the parent skill passes `WORKFLOW`, `RUN_ID`, and `FEATURE_ID` to the agent.

3. Agent state transitions appear nested within the parent workflow's phase on the dashboard.

### Registering Artifacts

Skills that produce output files (reports, design docs, task files) should register them explicitly so the dashboard can display them:

```bash
rp1 agent-tools emit \
  --workflow {WORKFLOW} \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step {step} \
  --data '{"path": "{relative_path_to_artifact}", "feature": "{FEATURE_ID}"}'
```

- `path` in the data payload is relative to the project root (e.g., `.rp1/work/features/my-feature/tasks.md`)
- For subflow diagrams, add `"subflow": true` to the data payload
- Artifacts are stored in the `artifacts` table in `~/.rp1/rp1.db`
- The dashboard queries this table instead of scanning the filesystem

---

## Related Concepts

- [SKILL.md Format](skill-format.md) -- How skills are structured
- [Skill-Agent Pattern](command-agent-pattern.md) -- How skills delegate to agents
- [Web UI Dashboard](../web-ui/v2-dashboard.md) -- Where workflow progress is displayed
