---
producer: bug-investigator
artifact: investigation-report
issue_id: split-marker-test
status: complete
date: 2026-05-29
rp1_doc_id: 5p1i7000-0000-0000-0000-00000000spl1
---

# Follow-up: re-entrant GC crash

This artifact has no Executive Summary heading, so the heuristic ladder would
guess at the break point. Instead the author placed an explicit split marker
below to put exactly this paragraph above the fold.

<!-- rp1:split -->

## Mechanism

The custom allocator reports external memory to V8 synchronously, which can
trigger a GC finalization mid-callback.

## Candidate fixes

1. Bump the dependency to a version that defers the report.
2. Keep the atomic-marking workaround in the test harness.
