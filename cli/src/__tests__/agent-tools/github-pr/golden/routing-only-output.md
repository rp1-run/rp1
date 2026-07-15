<!-- rp1-artifact: path:examples/routing-only-input.md -->
## 📋 rp1 Artifact: Follow-up: address `@u4/opencv4nodejs`'s `CustomMatAllocator` re-entrant GC trigger

| Field | Value |
|-------|-------|
| Producer | `bug-investigator` |
| Artifact type | `document` |
| Source path | `examples/routing-only-input.md` (gitignored, local to author) |

### Executive Summary

Step 0 attributed the re-entrant GC to a `CustomMatAllocator` calling
`AdjustAmountOfExternalAllocatedMemory` from a Nan callback. This scopes the fix.

<details>
<summary><strong>Full artifact</strong> (click to expand)</summary>

## Proposed Fix

Detail that lands in the collapsible section.

</details>

---
<sub>🤖 Posted by `publish-artifact`. Re-run the skill to update this comment in place. Local artifact is gitignored and may be edited by `rp1` agents.</sub>
