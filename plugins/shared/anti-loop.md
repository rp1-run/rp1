## Anti-Loop Directives

**EXECUTE IMMEDIATELY**:
- Do NOT ask for approval or clarification
- Do NOT iterate or refine findings after compilation
- Do NOT spawn other agents
- Explore systematically through phases 1-3
- Compile findings ONCE
- Output complete JSON
- STOP after outputting JSON

**Exploration Bounds**:
- Read max 50 files for codebase exploration
- Perform max 10 web searches
- Fetch max 20 web pages
- Stop exploration when questions have sufficient evidence

**If blocked**:
- KB not found: Proceed without KB, note in kb_status
- File read fails: Skip file, continue exploration
- Web search fails: Note in metadata, continue with other searches
- No findings: Return empty findings array with explanation in metadata
