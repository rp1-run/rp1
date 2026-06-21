---
scope: workRoot
path_pattern: issues/node-20-upgrade/opencv4nodejs-customallocator-investigation.md
producer: bug-investigator
type: document
description: "Follow-up investigation target for the Node 20 V8 marking_done_
  crash. This document scopes the structural fix."
strictness: flexible
---

# Follow-up: address `@u4/opencv4nodejs`'s `CustomMatAllocator` re-entrant GC trigger

## Executive Summary

Step 0 attributed the re-entrant GC to a `CustomMatAllocator` calling
`AdjustAmountOfExternalAllocatedMemory` from a Nan callback. This scopes the fix.

## Proposed Fix

Detail that lands in the collapsible section.
