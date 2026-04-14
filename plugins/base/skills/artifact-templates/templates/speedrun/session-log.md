---
scope: workRoot
path_pattern: "speedrun/{SESSION_ID}/log.md"
producer: speedrun
type: document
description: "Session log tracking tasks completed during a /speedrun session. Rewritten after each task resolution."
strictness: flexible
emit_hint: |
  rp1 agent-tools emit \
    --workflow speedrun \
    --type artifact_registered \
    --run-id {RUN_ID} \
    --step active \
    --unit task-{TASK_COUNT} \
    --data '{"path": "speedrun/{DATESTAMP}-{RUN_ID}/session-log.md", "storageRoot": "work_dir", "format": "markdown"}'
---

# Speedrun Session Log

| # | Request | Change | Status |
|---|---------|--------|--------|
| 1 | {brief summary of what was requested} | {brief summary of what builder changed} | committed |
| 2 | {brief summary of what was requested} | {brief summary of what builder changed} | skipped |
