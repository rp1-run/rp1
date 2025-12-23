@AGENTS.md

<!-- rp1:start -->
## rp1 Knowledge Base

KB files in `.rp1/context/`: `index.md` (load first), `architecture.md`, `modules.md`, `patterns.md`, `concept_map.md`

**Loading**: Read index.md first. Then based on task: code review → patterns.md, bugs → architecture.md + modules.md, features → modules.md + patterns.md, strategic → ALL files.

**Important**: Do NOT use `/knowledge-load` in subagents (causes early exit). Use Read tool directly.
<!-- rp1:end -->
