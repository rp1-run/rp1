# Why rp1?

Raw prompting works. You can accomplish real development tasks with freeform AI conversations. But as projects grow in complexity and team size, the cracks appear: inconsistent results, lost context, repeated setup, and no audit trail.

rp1 addresses these pain points with structured workflows that execute in a single pass.

---

## The Raw Prompting Problem

Raw prompting treats every conversation as a blank slate:

- **Context rebuilding**: Each session starts fresh. You re-explain your architecture, conventions, and constraints.
- **Inconsistent outputs**: The same request yields different approaches depending on how you phrase it.
- **No memory between tasks**: Yesterday's decisions are forgotten. You re-discover the same patterns.
- **Hidden rework**: What looks like "one prompt" often requires 3-5 iterations to get right.
- **Team divergence**: Each developer prompts differently, producing inconsistent code styles and patterns.

These friction points compound. What starts as minor inconvenience becomes significant overhead as projects mature.

---

## Side-by-Side Comparison

| Dimension | Raw Prompting | With rp1 |
|-----------|---------------|----------|
| **Iterations to complete** | 3-5 typical | 1 (single-pass) |
| **Context setup per task** | Manual each time | Automatic via KB |
| **Output consistency** | Varies by phrasing | Constitutional constraints |
| **Codebase awareness** | None / manual context | Built-in knowledge base |
| **Audit trail** | Chat history only | Structured artifacts |
| **Team alignment** | Per-developer style | Shared workflows |

---

## Before/After Examples

### Example 1: Feature Implementation

=== "Raw Prompting"

    ```text
    Prompt 1: "Add a dark mode toggle to the settings page"

    Response: Generic React component, doesn't match your patterns

    Prompt 2: "Actually we use Zustand for state, not Redux"

    Response: Rewrites with Zustand, wrong file structure

    Prompt 3: "Put it in src/components/settings/, use our Button component"

    Response: Better, but tests are missing

    Prompt 4: "Add tests using our testing patterns with Vitest"

    Response: Tests added, but component doesn't persist preference

    Prompt 5: "Store preference in localStorage, check system preference on load"

    Response: Finally complete

    Result: 5 iterations, 20+ minutes, still may not match team conventions
    ```

=== "With rp1"

    ```bash
    # One-time setup (already done)
    /knowledge-build

    # Single command
    /feature-requirements dark-mode-toggle
    /feature-design dark-mode-toggle
    /feature-build dark-mode-toggle

    # What happens:
    # - KB provides your architecture, patterns, conventions
    # - Requirements agent clarifies scope upfront
    # - Design agent creates spec matching your patterns
    # - Builder implements with reviewer validation
    # - Tests included, style matches codebase

    Result: Single pass, structured artifacts, team-consistent output
    ```

### Example 2: Bug Investigation

=== "Raw Prompting"

    ```text
    Prompt 1: "Users report login fails intermittently"

    Response: "Could be network issues, session timeout, or auth server"
    (Generic suggestions, no codebase context)

    Prompt 2: "Here's our auth flow: [paste 200 lines of code]"

    Response: "I see a potential race condition in..."
    (Context window filling up)

    Prompt 3: "What about the token refresh logic?"

    Response: "Can you share that code too?"

    Prompt 4: [Paste more code, hit context limits]

    Response: "Based on what I can see..."
    (Lost earlier context)

    Result: Fragmented investigation, context thrashing, uncertain conclusions
    ```

=== "With rp1"

    ```bash
    /code-investigate login-bug "Users report intermittent login failures"

    # What happens:
    # - KB provides auth architecture understanding
    # - Agent systematically traces auth flow
    # - Generates hypotheses ranked by likelihood
    # - Tests hypotheses against codebase
    # - Produces evidence-based findings

    Result: Structured investigation, clear findings, reproducible process
    ```

---

## When to Use Raw Prompting

rp1 covers most development scenarios with dedicated commands:

| Task | rp1 Command |
|------|-------------|
| Quick fixes, small scripts | `/build-fast` |
| Learning, research, exploration | `/deep-research` |
| Bug investigation | `/code-investigate` |
| Strategic decisions | `/strategize` |

Raw prompting remains useful for:

!!! tip "Good candidates for raw prompting"
    - **Non-project conversations**: Learning a new language, general CS questions
    - **Iterative dialogue**: When you want back-and-forth refinement
    - **Outside your codebase**: Work unrelated to the current project
    - **Syntax lookups**: Simple "how do I X" questions

rp1 shines when you need:

!!! success "Good candidates for rp1"
    - **Codebase-aware work**: Any task benefiting from KB context
    - **Team consistency**: Multiple developers, shared conventions
    - **Audit requirements**: Traceability from requirements to code
    - **Reproducible workflows**: PR reviews, feature builds, quality checks
    - **Single-pass execution**: Get it right the first time

**Rule of thumb**: If the task involves your codebase, use rp1.

---

## How Much Time Will You Save?

### Per Task

| Activity | Raw Prompting | With rp1 | Savings |
|----------|---------------|----------|---------|
| Context setup | 5-10 min | 0 (uses KB) | 5-10 min |
| Iteration cycles | 3-5 rounds | 1 pass | 10-20 min |
| Consistency fixes | 10 min | 0 | 10 min |
| **Total per task** | **25-40 min** | **5-10 min** | **~75% faster** |

### Per Week

For a developer running ~8 AI tasks per day (40/week):

| Metric | Raw Prompting | With rp1 | Savings |
|--------|---------------|----------|---------|
| Time per task | ~32 min | ~8 min | 75% |
| Weekly AI task time | 21 hours | 5 hours | 16 hours |
| **% of 40-hour week** | **53%** | **13%** | **40%** |

### Team Multiplier

Benefits scale with team size:

- **Shared KB**: One knowledge base, all developers benefit
- **Consistent patterns**: Reduced code review friction
- **Onboarding acceleration**: New developers inherit team workflows
- **Audit trail**: Requirements-to-code traceability

!!! info "Calculate your savings"
    ```
    Weekly hours saved = (tasks/week) x (minutes saved/task) x (team size) / 60

    Example: 40 tasks x 24 min x 5 developers = 80 hours/week (2 FTEs)
    ```

---

## Get Started

Ready to try structured workflows?

1. **Install rp1**: [Installation Guide](../getting-started/installation.md)
2. **Build your knowledge base**: Run `/knowledge-build` once
3. **Try a feature workflow**: [Feature Development Tutorial](../guides/feature-development.md)

Or start small:

```bash
# Review a PR (no setup required)
/pr-review 123
/pr-review https://github.com/org/repo/pull/123

# Quick code check
/code-check
```

---

## Related

- [Constitutional Prompting](../concepts/constitutional-prompting.md) - How rp1 achieves single-pass execution
- [Knowledge-Aware Agents](../concepts/knowledge-aware-agents.md) - How the KB provides codebase context
- [Feature Development](../guides/feature-development.md) - Full workflow tutorial
