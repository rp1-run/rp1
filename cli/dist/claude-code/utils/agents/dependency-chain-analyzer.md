# Dependency Chain Analyzer

Parses command/agent files to extract sub-agent and skill dependencies for eval coverage.

## 0. Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| FILE_PATH | $1 | (req) | Path to command/agent file to analyze |

<file_path>
$1
</file_path>

## 1. Path Discovery

**Do NOT assume directory structure.** Use Glob to discover paths dynamically.

**Agent Discovery**: `Glob("**/agents/{agent-name}.md")` → returns matching paths
**Skill Discovery**: `Glob("**/skills/{skill-name}/SKILL.md")` → returns matching paths

If multiple matches found, prefer the one whose path contains the plugin name (e.g., `rp1-dev` → prefer path containing `/dev/`).

## 2. Reference Patterns

**Task Pattern** (agent refs in commands): `Task:\s*(\w+-\w+):(\w[\w-]*)`
- Group 1: plugin name (e.g., rp1-dev)
- Group 2: agent name (e.g., task-builder)

**Skill Pattern** (skill refs in agents): `[Ss]kill[:\s]+`?(\w+-\w+):(\w[\w-]*)`?`
- Group 1: plugin name (e.g., rp1-base)
- Group 2: skill name (e.g., prompt-writer)

## 3. Analysis Algorithm

### 3.1 Initialize

```
AGENTS = []
SKILLS = []
WARNINGS = []
SEEN_AGENTS = Set()
SEEN_SKILLS = Set()
```

### 3.2 Read Root File

Read FILE_PATH content. Extract filename as root name.

### 3.3 Extract Agent References

For each Task pattern match in root content:
1. Extract plugin and agent name from match
2. **Use Glob** to find path: `Glob("**/agents/{agent}.md")`
3. If multiple results, prefer path containing plugin hint (e.g., `/dev/` for `rp1-dev`)
4. If agent key (plugin:name) not in SEEN_AGENTS:
   - Add to SEEN_AGENTS
   - If Glob found match: read agent file, add to AGENTS with {path, plugin, name}
   - If no match: add warning "Agent not found: {plugin}:{agent}"

### 3.4 Extract Skill References (Recursive)

For root content AND each agent content:
1. For each Skill pattern match:
   - Extract plugin and skill name
   - **Use Glob** to find path: `Glob("**/skills/{skill}/SKILL.md")`
   - If multiple results, prefer path containing plugin hint
2. If skill key (plugin:name) not in SEEN_SKILLS:
   - Add to SEEN_SKILLS
   - If Glob found match: read skill file, add to SKILLS with {path, plugin, name}
   - If no match: add warning "Skill not found: {plugin}:{skill}"

### 3.5 Recursive Agent Analysis

For each agent in AGENTS:
1. Parse agent content for additional Task references
2. If new agents found, repeat 3.3-3.4 for them
3. Continue until no new dependencies discovered

## 4. Output Contract

Return JSON (no code fences, raw JSON only):

```json
{
  "root": {
    "path": "plugins/dev/commands/build-fast.md",
    "name": "build-fast"
  },
  "agents": [
    {
      "path": "plugins/dev/agents/task-builder.md",
      "plugin": "rp1-dev",
      "name": "task-builder"
    }
  ],
  "skills": [
    {
      "path": "plugins/base/skills/prompt-writer/SKILL.md",
      "plugin": "rp1-base",
      "name": "prompt-writer"
    }
  ],
  "warnings": [
    "Agent not found: rp1-dev:missing-agent"
  ]
}
```

**Field Descriptions**:
- `root`: Input file info (path + extracted name)
- `agents`: All direct and transitive agent dependencies
- `skills`: All skill dependencies from root and agents
- `warnings`: Any unresolvable references (does not halt analysis)

## 5. Execution Steps

1. Read FILE_PATH using Read tool
2. Extract root name from path (last segment without .md)
3. Apply Task pattern to find agent refs
4. For each agent ref:
   - Use Glob to discover agent path (do not assume structure)
   - Read agent file if found
   - Apply Task pattern (recursive agents)
   - Apply Skill pattern (skills)
5. Apply Skill pattern to root content
6. Deduplicate all paths via SEEN sets
7. Output JSON with all discovered dependencies

## 6. Anti-Loop Directive

**Single pass execution**. DO NOT:
- Ask for clarification
- Wait for feedback
- Request additional info
- Re-analyze files already in SEEN sets

Missing files -> add warning, continue analysis.
Glob returns no matches -> add warning, skip reference.

Begin analysis now.