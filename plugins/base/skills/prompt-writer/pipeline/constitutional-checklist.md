# Stage: Constitutional Checklist

Pipeline stage 1 of 6. Selects and tailors governance primitives for the target prompt based on agent-type profile.

## Purpose

Filter the 10 governance primitives defined in `references/constitution.md` through the agent-type profile to produce a relevant set of constitutional directives. Each directive is tailored to the user's description and cross-referenced to its rp1 exemplar.

## Input

The agent MUST have the following before executing this stage:

| Field | Source | Description |
|-------|--------|-------------|
| DESCRIPTION | User input | Natural-language description of the skill/agent being created |
| AGENT_TYPE | User input (default: leaf-worker) | One of: `leaf-worker`, `orchestrator`, `interactive-skill`, `kb-investigator` |
| constitution.md | `references/constitution.md` | Loaded on demand at stage start |

## Process

1. **Load** `references/constitution.md` if not already in context.

2. **Identify agent-type profile**. Look up the AGENT_TYPE in the Agent-Type Profiles section of constitution.md. Extract the applicable primitive set for that profile:

   | Profile | Applicable Primitives |
   |---------|----------------------|
   | leaf-worker | Anti-loop, Output discipline, Role, Scope limits, Error degradation, Truth constraints, Transition guards |
   | orchestrator | Role, Scope limits, Orchestrator purity, Error degradation, Transition guards |
   | interactive-skill | Output discipline, Role, Scope limits, Exploration bounds, Anti-bias |
   | kb-investigator | Role, Error degradation, Exploration bounds, Anti-bias, Truth constraints |

3. **For each applicable primitive**, generate a constitutional directive tailored to the DESCRIPTION:
   - Read the primitive's Definition, Directive Pattern, and Exemplar from constitution.md
   - Adapt the Directive Pattern to the specific skill/agent described by DESCRIPTION
   - Keep the directive concise -- use the terse style from `references/tersify.md` patterns
   - Preserve normative language exactly (MUST, MUST NOT, SHOULD, MAY)
   - Include the exemplar citation as a trailing comment: `<!-- exemplar: {agent path} -->`

4. **Order directives** by structural priority:
   1. Role (always first -- establishes identity)
   2. Scope limits / Orchestrator purity (boundary-setting)
   3. Behavioral primitives (Anti-loop, Output discipline, Exploration bounds, Anti-bias, Truth constraints)
   4. Error degradation (failure handling)
   5. Transition guards (workflow integration, always last if present)

5. **Validate completeness**: confirm every applicable primitive for the profile has a corresponding directive. If any primitive cannot be meaningfully adapted to the DESCRIPTION, include it with a minimal default directive from constitution.md rather than omitting it.

## Output

Produce the following structured output for downstream stages:

```markdown
## Constitutional Directives ({AGENT_TYPE})

**Primitives applied**: {count} of 10 (filtered by {AGENT_TYPE} profile)

### 1. {Primitive Name}
{Tailored directive text}
<!-- exemplar: {path to exemplar agent} -->

### 2. {Primitive Name}
{Tailored directive text}
<!-- exemplar: {path to exemplar agent} -->

[... repeat for each applicable primitive ...]
```

**Downstream contract**: The accumulated constitutional directives are consumed by Stage 2 (fallibilist-overlay) and Stage 6 (prompt-validation). Stage 6 verifies that every directive from this stage appears in the final prompt.
