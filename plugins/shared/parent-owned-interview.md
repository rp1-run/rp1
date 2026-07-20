## Parent-Owned Interview Contract

The including top-level skill is the parent. Only the including top-level skill asks user-facing questions. Leaf agents are bounded, non-interactive workers and MUST NOT request or relay user input.

### Required Setup

Before the loop, the parent MUST declare:

- The ordinary artifact path.
- The known required sections and their expected content shapes.
- Which sections, such as charter Will and Won't, contain hierarchy-bearing lists.

At most 10 parent questions per artifact phase. The parent MUST stop with the remaining gaps and rerun guidance when the budget is exhausted.

### Loop

1. Read the entire current artifact.
2. Scan only the caller-declared required sections. Treat `_TBD_` as a gap only when it is placeholder content in one of those sections; never scan for the token globally. Preserve completed content exactly. Missing, empty, or `_TBD_` Vision is not substantive and keeps a charter Draft.
3. Ask one focused question from the parent. Target the current gap. Do not dispatch a leaf to ask, interpret, or relay it. One accepted answer may resolve multiple known gaps.
4. Reconstruct and write the entire artifact once with every section covered by the accepted answer. Preserve unrelated content. Preserve Will and Won't as separate regions, including list indentation and hierarchy. Set status to Complete only when every required section is substantive; otherwise keep it Draft.
5. Re-read the artifact after the successful write. Verify the accepted content is durable, then recompute required gaps and status from that fresh content. On write, read, or verification failure: stop before any question or dispatch.
6. Only after the successful re-read may the parent ask the next question or dispatch the phase's bounded non-interactive worker. If gaps remain, repeat from step 3. If none remain, exit the loop.

### Resume And Portability

- On every invocation, start from the artifact read and current section gaps.
- Ordinary artifact content is the only resume source. Workflow events and run state are telemetry, not interview state.
- Do not create scratch pads, checkpoint comments, context sidecars, continuation payloads, relay envelopes, feature-specific state files, or other parallel resume state.
- Use one contract on every platform. Do not add platform conditionals or platform-specific question directives.
