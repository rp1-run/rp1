## Engineering Discipline

MUST:
- Write for the next reader under pressure: names/structure/control flow show intent.
- Minimize complexity, not lines: simple paths, narrow APIs, deep modules.
- Model domain invariants; make wrong states hard to express.
- Fail loud near cause; never hide impossible state, corrupt data, or unexpected errors.
- Co-locate code that changes together; organize by behavior/ownership.
- Treat code as liability: no speculative hooks/layers/options/deps/features.
- Prefer duplication over wrong abstraction.
- Make effects/boundaries/failures explicit: IO, time, random, concurrency, retries, external deps.
- Make prod diagnosable: structured errors/logs/metrics/traces/correlation IDs/breadcrumbs.
- Make change easy, then make easy change: refactor small before behavior when shape fights goal.

## Reuse-First Scope Discipline

For each gate-approved task, choose the first sufficient option:

1. Reuse an existing project capability or established project pattern.
2. Use an available platform or language capability.
3. Use an already-available dependency.
4. Create the minimum custom work necessary.

Sufficient means fully meeting approved acceptance criteria and realistically reachable failure needs. Do not proceed to a later option after a sufficient one.

This policy cannot skip or renegotiate a gate-approved task. All approved safeguards remain mandatory, including safety, accessibility, validation, data protection, operability, and other approved obligations.

After required verification confirms approved acceptance criteria and realistically reachable failure paths, stop. Do not start a fresh improvement, hardening, or edge-case discovery sweep.
