# Copilot CLI Compatibility Validation Fixture

This fixture validates that GitHub Copilot CLI supports the six harness primitives required for rp1 platform integration (REQ-SC-001).

## Prerequisites

- GitHub CLI (`gh`) installed with version >= 2.74.0
- GitHub Copilot CLI extension installed (`gh extension install github/gh-copilot`)
- rp1 CLI installed and available on PATH
- This fixture directory as the working directory

## Harness Primitives Under Test

| # | Primitive | Test Method | Files |
|---|-----------|-------------|-------|
| P1 | AGENTS.md-based instruction loading | Start session, verify KB loads | `AGENTS.md`, `.rp1/context/index.md` |
| P2 | Skill discovery and invocation | Invoke `/echo-test` | `.github/skills/echo-test/SKILL.md` |
| P3 | Custom agent definition and delegation | Invoke echo-agent from echo-test | `.github/agents/echo-agent.md` |
| P4 | Shell command execution | Run `rp1 agent-tools` commands | Tested within echo-test skill |
| P5 | File system read/write/edit/search | CRUD operations on fixture files | Tested within echo-test skill |
| P6 | Parallel sub-agent with file-backed JSON | Run multi-agent workflow | `.github/skills/multi-agent-workflow/SKILL.md`, `.github/agents/parallel-worker.md` |

## Test Procedure

### Test 1: AGENTS.md Loading (P1)

1. Open a Copilot CLI session in this directory:
   ```bash
   gh copilot chat
   ```
2. Ask: "What project is this? Read the KB index."
3. **PASS**: Agent reads `.rp1/context/index.md` and reports "Copilot Validation Fixture"
4. **FAIL**: Agent does not load AGENTS.md or does not follow KB loading instructions

### Test 2: Skill Invocation and Parameter Passing (P2, P4, P5)

1. In a Copilot CLI session, invoke:
   ```
   /echo-test "hello copilot" json
   ```
2. **PASS criteria**:
   - [ ] Skill is discovered and invoked
   - [ ] MESSAGE parameter "hello copilot" is correctly parsed
   - [ ] FORMAT parameter "json" is correctly parsed
   - [ ] Shell command executes and returns output
   - [ ] File read of `.rp1/context/index.md` succeeds
   - [ ] File write to `.rp1/work/echo-test-output.md` succeeds
   - [ ] File search finds `.md` files in `.rp1/context/`
   - [ ] File edit appends to output file
   - [ ] `rp1 agent-tools rp1-root-dir` executes successfully
   - [ ] JSON summary output is well-formed
3. **FAIL**: Any of the above checks fail

### Test 3: Agent Delegation (P3)

1. In a Copilot CLI session, ask:
   ```
   Delegate to echo-agent with TASK_ID "test-001" and OUTPUT_PATH ".rp1/work/agent-output/test-001.json"
   ```
2. **PASS criteria**:
   - [ ] Agent definition is found and loaded
   - [ ] Agent executes in a delegated context
   - [ ] Agent reads KB from within delegated context
   - [ ] Agent runs shell commands
   - [ ] Agent writes structured JSON to the specified output path
   - [ ] Parent can read the agent's output file
3. **FAIL**: Agent is not found, fails to execute, or does not write output

### Test 4: Parallel Sub-Agent Execution with File-Backed JSON (P6)

1. In a Copilot CLI session, invoke:
   ```
   /multi-agent-workflow
   ```
2. **PASS criteria**:
   - [ ] Three worker agents are dispatched
   - [ ] Workers execute concurrently (or at minimum, all complete)
   - [ ] Each worker writes its JSON output to the designated file
   - [ ] Parent skill reads all three output files
   - [ ] Aggregated report is written to `aggregate.json`
   - [ ] Overall status is PASS
3. **FAIL**: Workers are not dispatched, output files are missing, or aggregation fails

## Results Template

Copy and fill in after running tests:

```markdown
## Validation Results

**Date**: YYYY-MM-DD
**Copilot CLI Version**: (output of `gh copilot --version`)
**GitHub CLI Version**: (output of `gh --version`)
**rp1 Version**: (output of `rp1 --version`)

| # | Primitive | Status | Notes |
|---|-----------|--------|-------|
| P1 | AGENTS.md loading | PASS/FAIL | |
| P2 | Skill invocation | PASS/FAIL | |
| P3 | Agent delegation | PASS/FAIL | |
| P4 | Shell execution | PASS/FAIL | |
| P5 | File operations | PASS/FAIL | |
| P6 | Parallel sub-agent JSON handoff | PASS/FAIL | |

### Blockers

(List any primitives that failed and cannot be worked around)

### Workarounds

(List any primitives that failed but have viable workarounds)

### Notes

(Additional observations about Copilot CLI behavior)
```

## Directory Structure

```
fixtures/copilot-validation/
├── AGENTS.md                                  # Instruction file for KB bootstrapping
├── README.md                                  # This file
├── .rp1/
│   ├── project_id                             # Project identifier
│   └── context/
│       └── index.md                           # Minimal KB for validation
└── .github/
    ├── skills/
    │   ├── echo-test/
    │   │   └── SKILL.md                       # Parameter, shell, and file operation tests
    │   └── multi-agent-workflow/
    │       └── SKILL.md                       # Parallel sub-agent orchestration test
    └── agents/
        ├── echo-agent.md                      # Single agent delegation test
        └── parallel-worker.md                 # Worker for parallel execution test
```

## Relationship to rp1 Integration

This fixture is used **before** committing to full Copilot CLI build pipeline integration. Results from this validation inform:

- Tool name mappings in `copilotRegistry` (T3)
- Template structure decisions (T4)
- Semantic tag rendering for `dispatch_agent` (T6)
- Parameter passing strategy confirmation (REQ-SC-004)
- Sub-agent output pattern confirmation (REQ-SC-005)

If any primitive fails without a viable workaround, it must be documented and escalated before proceeding with integration tasks.
