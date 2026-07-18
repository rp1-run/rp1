{% unless platform == "claude-code" %}
## Coordinator Loop Directive

**Bounded relay coordinator.** You are a coordinator skill managing interview agents on a relay harness where sub-agents cannot interact with the user directly.

**DO**:
- Run each interview phase to completion: dispatch the agent, relay every `needs_input` envelope to the user, and continue until the agent returns `completed`
- On Codex: send the user's answer back to the running agent via `followup_task`
- On OpenCode, Copilot, and Antigravity: re-dispatch the agent with the user's answer so it resumes from its checkpoint
- Proceed to the next workflow phase only after the current agent signals completion

**DO NOT**:
- Re-run an interview phase that has already signalled `completed`
- Re-dispatch an agent after it returned a `completed` envelope
- Skip a `needs_input` envelope without presenting it to the user
- Re-implement or retry completed work

**Blocking issue**:
1. Document the error clearly
2. Output error response
3. STOP
{% else %}
## Coordinator Directive

**Single-pass coordinator execution.** Sub-agents interact with the user directly.

**DO NOT**:
- Re-run a phase that has already completed
- Re-implement or retry completed work
- Request additional information outside of dispatched sub-agent interactions

**Blocking issue**:
1. Document the error clearly
2. Output error response
3. STOP
{% endunless %}
