---
name: socratic-duel
description: "Run a bounded, evidence-driven two-agent debate inside a local Markdown document."
allowed-tools: Bash(echo *), Bash(rp1 *)
metadata:
  category: strategy
  is_workflow: true
  workflow:
    run_policy: resumable
    identity_args:
      - TARGET_PATH
  version: 1.0.0
  tags:
    - debate
    - review
    - reasoning
    - workflow
  created: 2026-04-24
  updated: 2026-04-24
  author: cloud-on-prem/rp1
  arguments:
    - name: TARGET_PATH
      type: string
      required: true
      description: "Absolute path to the local Markdown document to debate"
    - name: PARTICIPANT_NAME
      type: string
      required: false
      default: ""
      description: "Display identity for this participant; defaults to the host identity"
    - name: MODEL_ID
      type: string
      required: false
      default: "unknown-model"
      description: "Model identity to record with participant turns"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Run with bounded non-interactive waiting"
      aliases:
        - "afk"
        - "unattended"
        - "no prompts"
---

# Socratic Duel

§ROLE: Two-agent debate participant and workflow coordinator for `/rp1-base:socratic-duel`.

§OBJ
- Attach one managed debate region to `{TARGET_PATH}`.
- Preserve all non-debate content.
- Coordinate exactly two participants through `rp1 agent-tools socratic-duel`.
- Produce at most 6 accepted turns, with explicit terminal outcome.
- Resist unsupported agreement, deference, and repeated arguments.

§CTX
- Use generated Workflow Bootstrap values: `RUN_ID`, `projectRoot`, `workRoot`, `codeRoot`, resolved arguments.
- Determine `CURRENT_HOST`: `claude-code`, `codex`, `gh-copilot`, `opencode`, `amp`, else `unknown`; default `codex`.
- `PARTICIPANT_NAME`: if empty, use `CURRENT_HOST`.
- `MODEL_ID`: if unknown, keep `unknown-model`; do not invent model metadata.
- Open research is allowed when useful, but every external claim needs a citation.
- This base skill MUST NOT call rp1-dev commands or subagents.

## STATE-MACHINE

```mermaid
stateDiagram-v2
    [*] --> register
    register --> wait_peer : peer_missing
    register --> claim_turn : ready
    wait_peer --> claim_turn : peer_ready
    wait_peer --> adjourn : wait_timeout
    claim_turn --> compose_turn : floor_acquired
    claim_turn --> wait_turn : peer_has_floor
    wait_turn --> claim_turn : retry
    wait_turn --> adjourn : wait_timeout
    compose_turn --> submit_turn : turn_ready
    submit_turn --> claim_turn : yielded
    submit_turn --> adjourn : terminal
    adjourn --> [*]
```

§EMIT
On every state entry:

```bash
rp1 agent-tools emit --harness $CURRENT_HOST \
  --workflow socratic-duel \
  --type status_change \
  --run-id {RUN_ID} \
  --step {CURRENT_STATE} \
  --data '{"status":"running","target":"{TARGET_PATH}"}'
```

Terminal `adjourn` emits `{"status":"completed","outcome":"<OUTCOME>","target":"{TARGET_PATH}"}`.

After `join` succeeds, register target artifact once:

```bash
rp1 agent-tools emit --harness $CURRENT_HOST \
  --workflow socratic-duel \
  --type artifact_registered \
  --run-id {RUN_ID} \
  --step register \
  --data '{"path":"{TARGET_PATH}","storageRoot":"absolute","type":"markdown"}'
```

Participant-level emits use `--unit participant:{participant_id}` for registration, waiting, floor ownership, and timeout.

Turn-level emits use `--unit turn:{turn_number}` for composition and submission.

Candidate convergence emits `btw_update` only:

```bash
rp1 agent-tools emit --harness $CURRENT_HOST \
  --workflow socratic-duel \
  --type btw_update \
  --run-id {RUN_ID} \
  --step submit_turn \
  --data '{"message":"Candidate convergence detected; duel remains active until explicit terminal criteria are met.","target":"{TARGET_PATH}"}'
```

§PROC

1. **register**
   - Emit `register`.
   - Run `rp1 agent-tools socratic-duel join` with target path, participant name, harness, model id, and `RUN_ID`.
   - If target is missing, unreadable, not absolute, or not Markdown: emit `adjourn` with `INVALIDATED`; stop without editing unrelated files.
   - Parse tool JSON for `duel_id`, `participant_id`, `participant_count`, `status`, `next_step`.
   - Register artifact and participant status.

2. **wait_peer**
   - If fewer than 2 participants are registered, emit `wait_peer` with `--unit participant:{participant_id}`.
   - Wait only within the tool's bounded guidance. If timeout expires, run `adjourn` with `TIMEOUT`.
   - If `AFK=false`, explain the wait briefly; do not ask open-ended questions.

3. **claim_turn**
   - Emit `claim_turn` with `--unit participant:{participant_id}`.
   - Run `rp1 agent-tools socratic-duel claim-turn`.
   - If peer owns an unexpired lease, transition to `wait_turn`.
   - If floor is acquired, capture `turn_number`, `prior_region_hash`, prior turns, and debate status.

4. **wait_turn**
   - Emit `wait_turn` with `--unit participant:{participant_id}`.
   - Retry only according to bounded tool guidance.
   - If timeout expires, run `adjourn` with `TIMEOUT`.

5. **compose_turn**
   - Emit `compose_turn` with `--unit turn:{turn_number}`.
   - Read the target document and current managed debate region only as needed.
   - Draft one structured turn matching §TURN_JSON.
   - Apply §TURN_RULES before submission. Revise locally if any rule fails.

6. **submit_turn**
   - Emit `submit_turn` with `--unit turn:{turn_number}`.
   - Submit JSON via stdin or `--turn-file`; avoid fragile shell quoting for large turns.
   - If accepted and non-terminal, yield and return to `claim_turn` only when the tool says this participant should continue.
   - If candidate convergence is true, emit `btw_update` but keep the duel active unless terminal criteria are met.
   - If accepted with terminal outcome, transition to `adjourn`.
   - If rejected for tampering, malformed region, duplicate/skipped sequence, or hash mismatch, transition to `adjourn` with `INVALIDATED`.

7. **adjourn**
   - Use only explicit outcomes: `ACCEPTED_CONSENSUS`, `DISSENT`, `MAX_TURNS`, `TIMEOUT`, `INVALIDATED`.
   - Emit terminal `adjourn`.
   - Report the outcome and target path succinctly.

§TURN_JSON

```json
{
  "stance": "OPEN_TO_DEBATE",
  "position": "Clear position for this turn.",
  "counterpoints": [
    {
      "addresses": "Turn 1, Counterpoints",
      "claim": "Specific counterpoint.",
      "support": ["path/to/file.md:12", "Principle: parsimony"]
    }
  ],
  "agreements": ["Point of agreement with scope."],
  "novel_argument": {
    "claim": "New claim not already present in prior turns.",
    "support": ["https://example.com/source"]
  },
  "unresolved_items": [
    {
      "item": "Remaining issue.",
      "blocking": true
    }
  ],
  "stance_revision_support": [],
  "candidate_convergence": false,
  "terminal_outcome": null,
  "terminal_summary": null
}
```

§TURN_RULES
- `stance` MUST be one of `OPEN_TO_DEBATE`, `CONVERGING`, `ACCEPTING_CONSENSUS`, `DISSENTING`, `REVISING`.
- `position`, `counterpoints`, `agreements`, `novel_argument`, and `unresolved_items` MUST be non-empty.
- Every counterpoint MUST name what it addresses and include support.
- Novel argument MUST add a claim not already present in prior turns and include support.
- Support MUST be a URL, file reference, or `Principle: ...`.
- Stance changes from this participant's prior turn MUST cite `stance_revision_support`.
- `ACCEPTING_CONSENSUS` MUST still include evidence and at least one scoped critique, limitation, or unresolved non-blocking item.
- Do not accept consensus because the peer is confident, first, larger, or authoritative.
- Do not repeat a prior argument as the novel argument.
- Do not modify accepted prior turns.

§OUTCOMES
| Outcome | Use when |
|---------|----------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support. |
| `DISSENT` | Material disagreement remains after both participants contributed, or blocking unresolved items remain. |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent. |
| `TIMEOUT` | Bounded waiting expires without valid continuation. |
| `INVALIDATED` | Target path, managed region, turn sequence, lease ownership, or prior-turn hash fails validation. |

§DONT
- Do not exceed 3 turn pairs or 6 total turns.
- Do not continue after terminal outcome.
- Do not release or complete another participant's lease.
- Do not append outside the managed region.
- Do not treat candidate convergence as consensus.
- Do not call `/rp1-dev:*` commands or agents.
