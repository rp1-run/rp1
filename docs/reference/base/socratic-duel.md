# socratic-duel

Run a bounded, evidence-driven two-agent debate inside a local Markdown document.

---

## Synopsis

=== "Claude Code"

    ```bash
    /socratic-duel TARGET_PATH=/absolute/path/to/document.md
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel TARGET_PATH=/absolute/path/to/document.md
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel TARGET_PATH=/absolute/path/to/document.md
    ```

## Description

The `socratic-duel` workflow attaches one managed debate region to a readable
local Markdown file. Two participants, usually from different AI harnesses,
join the same duel by using the same absolute `TARGET_PATH`.

The workflow coordinates through `rp1 agent-tools socratic-duel`, while the
target Markdown file remains the human-readable transcript. SQLite-backed
coordination enforces participant registration, exclusive turn leases, turn
alternation, append-only transcript validation, and terminal outcomes.

Socratic Duel is intentionally bounded:

- Exactly two active participants in v1
- At most 3 turn pairs, or 6 accepted turns total
- One participant owns the floor at a time
- Candidate convergence is advisory and never closes the duel by itself
- Accepted turns must include evidence-backed critique, agreement, novelty, and unresolved items

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the local Markdown document to debate |
| `PARTICIPANT_NAME` | No | Host identity | Display identity recorded for this participant |
| `MODEL_ID` | No | `unknown-model` | Model identity recorded with participant turns |
| `AFK` | No | `false` | Use bounded non-interactive waiting |

`TARGET_PATH` must be an absolute path to a readable `.md` or `.markdown`
file. Missing, unreadable, relative, or non-Markdown paths invalidate the
attempt without modifying unrelated files.

## Turn Protocol

Each accepted turn is submitted as structured JSON and rendered into the
managed Markdown region. A turn must include:

| Field | Requirement |
|-------|-------------|
| `stance` | One of `OPEN_TO_DEBATE`, `CONVERGING`, `ACCEPTING_CONSENSUS`, `DISSENTING`, or `REVISING` |
| `position` | The participant's current position |
| `counterpoints` | Specific critiques that name the prior turn or section being addressed and include support |
| `agreements` | Scoped points of agreement |
| `novel_argument` | A supported claim not already present in prior turns |
| `unresolved_items` | Remaining issues, including whether each one is blocking |
| `stance_revision_support` | Evidence or reasoning required when changing stance |

Support entries must be file references, URLs, or named reasoning principles
such as `Principle: parsimony`. A participant that accepts consensus still has
to provide evidence and scoped critique, limitation, or non-blocking unresolved
items so agreement is not mere deference.

## Managed Markdown Region

The tool creates one region bounded by `rp1:socratic-duel` HTML comments. It
may update the region header, participant table, candidate convergence note,
and conclusion. Accepted turn bodies are append-only and hash-checked before
later turns are accepted.

Surrounding document content is preserved. Duplicate managed regions, malformed
markers, skipped or duplicate turn numbers, and edited prior turns are treated
as invalidation conditions.

## Terminal Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support |
| `DISSENT` | Material disagreement or blocking unresolved items remain after both participants contributed |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent |
| `TIMEOUT` | Bounded waiting expires without a valid continuation |
| `INVALIDATED` | Path, managed region, sequence, lease ownership, or prior-turn hash validation fails |

## Workflow Visibility

Socratic Duel is a resumable tracked workflow. It emits:

- `artifact_registered` for the absolute target Markdown file with `storageRoot: "absolute"`
- Participant status with `--unit participant:{participant_id}`
- Floor ownership and waiting status for the participant holding or awaiting the turn
- Turn composition and submission status with `--unit turn:{turn_number}`
- `btw_update` when candidate convergence is detected
- Terminal `adjourn` status with the exact outcome

These events make registration, waiting, floor ownership, turn progress,
candidate convergence, and terminal outcomes visible in Arcade run tracking.

## Examples

### Start the First Participant

=== "Claude Code"

    ```bash
    /socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Claude MODEL_ID=claude-sonnet
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
    ```

If no peer has joined yet, the participant waits only within the workflow's
bounded guidance.

### Join From a Second Harness

Use the same absolute `TARGET_PATH` from the second harness. The coordinator
resumes the active duel instead of creating a separate transcript.

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
