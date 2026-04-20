# Constitutional Governance Primitives

Reference layer for prompt-writer pipeline. Defines the 10 governance primitives derived from existing rp1 agents, plus four agent-type profiles that filter which primitives apply.

Load this file when applying constitutional governance to a prompt via the constitutional-checklist pipeline stage.

## Governance Primitives

### 1. Anti-Loop

**Definition**: Prevent infinite execution cycles by enforcing single-pass execution with explicit termination.

**When to Apply**: Any agent that could enter retry loops, clarification cycles, or recursive re-implementation.

**Agent-Type Relevance**: leaf-worker, orchestrator, interactive-skill, kb-investigator

**Directive Pattern**:

```markdown
Single-pass execution. NO clarification, NO iteration.

DO NOT:
- Ask for clarification mid-workflow
- Wait for user feedback between sections
- Loop or re-implement
- Request additional info after workflow starts

Blocking issue: document error -> output error -> STOP.
```

**Exemplar**: `plugins/dev/agents/feature-architect.md` -- section `## 13 Anti-Loop`. Enforces "EXECUTE IMMEDIATELY: Single-pass execution" with explicit blocking-issue handling: document, output error JSON, STOP.

---

### 2. Output Discipline

**Definition**: Strict output format contracts that define exactly what the agent produces, in what structure, with no ambiguity.

**When to Apply**: Any agent whose output is consumed by another agent, a workflow orchestrator, or a structured parser.

**Agent-Type Relevance**: leaf-worker, interactive-skill

**Directive Pattern**:

```markdown
## OUT
[Exact output format specification with field names, types, and examples]

Output MUST conform to the specified structure. No additional commentary outside the format.
```

**Exemplar**: `plugins/dev/agents/feature-tasker.md` -- produces structured task breakdown in a precise markdown format (task IDs, acceptance criteria, effort estimates, DAG). The output contract is consumed by task-builder and build orchestrator.

---

### 3. Role

**Definition**: Clear agent identity, scope of expertise, and behavioral persona declared at the top of the prompt.

**When to Apply**: Every agent and skill. The role establishes what the agent is and is not.

**Agent-Type Relevance**: leaf-worker, orchestrator, interactive-skill, kb-investigator

**Directive Pattern**:

```markdown
ROLE: [Identity] - [one-line purpose statement].

Constraint: [What this agent does NOT do].
```

**Exemplar**: `plugins/dev/agents/feature-architect.md` -- `ROLE: TechDesigner - transforms requirements into technical design. HOW to implement via architecture, tech choices, APIs, data models.` Followed by explicit constraint: "Follow existing patterns. Only introduce new if user explicitly requests."

---

### 4. Scope Limits

**Definition**: Explicit boundaries on what the agent may and may not modify, access, or decide.

**When to Apply**: Any agent that modifies code, files, or configuration. Critical for agents operating in shared workspaces.

**Agent-Type Relevance**: leaf-worker, orchestrator, interactive-skill

**Directive Pattern**:

```markdown
Core: Implement ONLY assigned tasks. DO NOT modify code outside scope.

Scope check (state before impl):
- Files I WILL modify: [list]
- Files I will NOT touch: [all else]

MUST NOT modify code outside assigned task scope.
Violations: modifying unscoped files, adding unspecified features, refactoring unrelated code.
```

**Exemplar**: `plugins/dev/agents/task-builder.md` -- enforces "Implement ONLY assigned tasks. DO NOT modify code outside scope" with a pre-implementation scope check listing files to modify vs. files to leave untouched. Section `## 7. Discipline Rules` enumerates specific violation types that trigger reviewer rejection.

---

### 5. Orchestrator Purity

**Definition**: Orchestrators coordinate work by spawning agents -- they never perform the work themselves. No inline logic, no file I/O, no code generation.

**When to Apply**: Any skill or agent that delegates to sub-agents. The orchestrator pattern ensures separation of coordination from execution.

**Agent-Type Relevance**: orchestrator

**Directive Pattern**:

```markdown
YOU ARE A PURE ORCHESTRATOR. Spawn agents for all work.
NEVER write/edit/read files yourself. NEVER implement code, requirements, designs, or tests.
Use exact agent references per step. If agent fails, retry it -- never do its work.
```

**Exemplar**: `plugins/dev/skills/build/SKILL.md` -- opens with "YOU ARE A PURE ORCHESTRATOR" and enforces that all file operations, code generation, and analysis are delegated to named sub-agents. Also `plugins/dev/skills/build-fast/SKILL.md` -- "You are an orchestrator. You MUST delegate implementation to task-builder by spawning an agent. Do NOT write, edit, or create source code files yourself."

---

### 6. Error Degradation

**Definition**: Graceful failure with clear, structured error output rather than silent failure or partial results.

**When to Apply**: Any agent that can encounter blocking issues, missing prerequisites, or runtime errors.

**Agent-Type Relevance**: leaf-worker, orchestrator, kb-investigator

**Directive Pattern**:

```markdown
Blocking issue handling:
1. Document error clearly
2. Output structured error: {"status": "error", "message": "[description]"}
3. STOP

Non-blocking: log warning, continue without blocking.
```

**Exemplar**: `plugins/dev/agents/feature-architect.md` -- on missing requirements.md, exits with structured error JSON `{"status": "error", "message": "Requirements document required. Run /build Step 1 first."}`. On artifact registration failure: logs warning, continues without blocking. Distinguishes blocking vs. non-blocking errors.

---

### 7. Exploration Bounds

**Definition**: Explicit limits on search scope, analysis depth, and investigation breadth to prevent unbounded exploration.

**When to Apply**: Any agent that searches codebases, explores documentation, or investigates issues. Prevents context exhaustion and ensures timely completion.

**Agent-Type Relevance**: interactive-skill, kb-investigator

**Directive Pattern**:

```markdown
Investigation depth: [quick | standard | deep]
Scope: [bounded to specific directories/files/topics]
Time box: [effort allocation percentages per phase]
```

**Exemplar**: `plugins/dev/agents/bug-investigator.md` -- accepts `INVESTIGATION_DEPTH` parameter (quick/standard/deep) and breaks investigation into phases with effort allocation percentages. `plugins/dev/skills/code-investigate/SKILL.md` -- scopes investigation to a specific problem statement with deterministic workspace paths.

---

### 8. Anti-Bias

**Definition**: Avoid premature conclusions by requiring balanced evaluation of competing hypotheses before declaring results.

**When to Apply**: Any agent that evaluates hypotheses, makes recommendations, or classifies findings. Prevents confirmation bias.

**Agent-Type Relevance**: interactive-skill, kb-investigator

**Directive Pattern**:

```markdown
VALIDATE only - no design decisions. Test systematically, document evidence, report.
Each hypothesis: CONFIRMED | REJECTED based on evidence.
Do not favor confirmation over rejection.
```

**Exemplar**: `plugins/dev/agents/hypothesis-tester.md` -- validates hypotheses via code experiments with explicit CONFIRMED/REJECTED outcomes. Reports both confirmed and rejected results with equal rigor. Includes `CONFIRMED_BY_USER` as a separate status to distinguish empirical from authority-based validation.

---

### 9. Truth Constraints

**Definition**: Claims must be backed by evidence. Sources must be cited. Speculative statements must be explicitly marked.

**When to Apply**: Any agent that produces reports, findings, or recommendations that inform decisions.

**Agent-Type Relevance**: kb-investigator, interactive-skill

**Directive Pattern**:

```markdown
Evidence format: file:line for code, URLs for external sources.
Every claim must trace to a source.
Speculative findings must be explicitly marked as such.
```

**Exemplar**: `plugins/base/agents/research-reporter.md` -- requires structured source arrays (`codebase: string[], external: string[]`) in synthesis data. All findings must trace back to specific evidence. `plugins/dev/agents/hypothesis-tester.md` -- each hypothesis result requires evidence summary documenting the validation basis.

---

### 10. Transition Guards

**Definition**: Explicit state transition validation ensuring agents progress through defined workflow states in the correct order.

**When to Apply**: Any agent or skill that participates in a tracked workflow with observable state progression.

**Agent-Type Relevance**: orchestrator, leaf-worker

**Directive Pattern**:

```markdown
## STATE-MACHINE
stateDiagram-v2
    [*] --> state_a
    state_a --> state_b : condition
    state_b --> [*]

On each transition, report via:
rp1 agent-tools emit --workflow {WORKFLOW} --step {CURRENT_STATE} --data '{"status": "running"}'

Follow graph transitions exactly; invalid steps are rejected.
```

**Exemplar**: `plugins/dev/agents/task-builder.md` -- declares a `STATE-MACHINE` section with `stateDiagram-v2` defining `building -> completed | failed` transitions. Each state transition emits via `rp1 agent-tools emit` with validated step names. The state machine framework rejects invalid transitions with actionable error messages.

---

## Agent-Type Profiles

Each profile defines which governance primitives are applicable. When generating constitutional directives for a prompt, filter the 10 primitives through the agent-type profile to produce a relevant, non-overwhelming governance set.

### Leaf Worker

Agents that perform bounded, specific work (code generation, file editing, analysis). They receive instructions from an orchestrator and return results.

| Primitive | Applicable | Rationale |
|-----------|:----------:|-----------|
| Anti-loop | Yes | Prevent retry spirals on implementation failures |
| Output discipline | Yes | Orchestrator consumes structured output |
| Role | Yes | Clear identity prevents scope creep |
| Scope limits | Yes | Prevent unscoped file modifications |
| Orchestrator purity | No | Not an orchestrator |
| Error degradation | Yes | Structured errors enable orchestrator retry logic |
| Exploration bounds | No | Work is pre-scoped by orchestrator |
| Anti-bias | No | Executes, does not evaluate |
| Truth constraints | Yes | Claims in summaries must be evidence-backed |
| Transition guards | Yes | Emit workflow state for dashboard visibility |

**Applicable set**: Anti-loop, Output discipline, Role, Scope limits, Error degradation, Truth constraints, Transition guards

### Orchestrator

Skills or agents that coordinate multi-agent workflows. They spawn sub-agents, manage state, and aggregate results.

| Primitive | Applicable | Rationale |
|-----------|:----------:|-----------|
| Anti-loop | No | Orchestrators may legitimately retry failed agents |
| Output discipline | No | Output is the aggregated sub-agent result |
| Role | Yes | Establishes coordinator identity |
| Scope limits | Yes | Boundaries on what the orchestrator manages |
| Orchestrator purity | Yes | Core constraint: never do sub-agent work |
| Error degradation | Yes | Structured error propagation to callers |
| Exploration bounds | No | Scope defined by the workflow, not exploration |
| Anti-bias | No | Does not evaluate hypotheses |
| Truth constraints | No | Passes through sub-agent claims |
| Transition guards | Yes | Workflow state progression must be validated |

**Applicable set**: Role, Scope limits, Orchestrator purity, Error degradation, Transition guards

### Interactive Skill

Skills invoked directly by users for analysis, writing, or guidance. They interact with the user's context and may explore codebases.

| Primitive | Applicable | Rationale |
|-----------|:----------:|-----------|
| Anti-loop | No | May legitimately iterate with user |
| Output discipline | Yes | Structured output for downstream consumption |
| Role | Yes | Clear identity and expertise declaration |
| Scope limits | Yes | Prevent overreach beyond user's request |
| Orchestrator purity | No | May perform direct work |
| Error degradation | No | Conversational error handling preferred |
| Exploration bounds | Yes | Prevent unbounded codebase/doc exploration |
| Anti-bias | Yes | Recommendations must be balanced |
| Truth constraints | No | Conversational context, not evidentiary |
| Transition guards | No | Typically not workflow-tracked |

**Applicable set**: Output discipline, Role, Scope limits, Exploration bounds, Anti-bias

### KB-Investigator

Agents that explore knowledge bases, codebases, or external sources to produce findings and reports.

| Primitive | Applicable | Rationale |
|-----------|:----------:|-----------|
| Anti-loop | No | May need iterative search refinement |
| Output discipline | No | Report format varies by investigation |
| Role | Yes | Clear investigator identity |
| Scope limits | No | Investigation scope is dynamic |
| Orchestrator purity | No | Performs direct exploration |
| Error degradation | Yes | Missing sources must be reported, not swallowed |
| Exploration bounds | Yes | Prevent unbounded search and context exhaustion |
| Anti-bias | Yes | Findings must not favor pre-existing conclusions |
| Truth constraints | Yes | Every claim must cite sources |
| Transition guards | No | Typically sub-agent, not workflow-tracked |

**Applicable set**: Role, Error degradation, Exploration bounds, Anti-bias, Truth constraints
