<!-- rp1-artifact: 5p1i7000-0000-0000-0000-00000000spl1 -->
## 📋 rp1 Artifact: Investigation Report — split-marker-test

| Field | Value |
|-------|-------|
| Producer | `bug-investigator` |
| Artifact type | `investigation-report` |
| Issue ID | `split-marker-test` |
| Status | `complete` |
| Generated | 2026-05-29 |
| Doc ID | `5p1i7000-0000-0000-0000-00000000spl1` |
| Source path | `examples/split-marker-input.md` (gitignored, local to author) |

### Executive Summary

This artifact has no Executive Summary heading, so the heuristic ladder would
guess at the break point. Instead the author placed an explicit split marker
below to put exactly this paragraph above the fold.

<details>
<summary><strong>Full artifact</strong> (click to expand)</summary>

## Mechanism

The custom allocator reports external memory to V8 synchronously, which can
trigger a GC finalization mid-callback.

## Candidate fixes

1. Bump the dependency to a version that defers the report.
2. Keep the atomic-marking workaround in the test harness.

</details>

---
<sub>🤖 Posted by `publish-artifact`. Re-run the skill to update this comment in place. Local artifact is gitignored and may be edited by `rp1` agents.</sub>
