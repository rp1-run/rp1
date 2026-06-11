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
