# socratic-duel

Run a bounded, evidence-driven two-agent debate in a local Markdown document with backend locks only.

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

The backend tool is intentionally thin. `rp1 agent-tools socratic-duel`
registers participants and controls one exclusive lock lease at a time. The
agents own Markdown parsing, local debate state, turn numbering, alternation,
candidate convergence, evidence checks, terminal summaries, and template-based
updates using the existing `rp1-base:artifact-templates` reference.

## Design Boundary

Socratic Duel deliberately keeps debate-state intelligence out of TypeScript.
The backend is a lock service, not a debate engine. It stores participant
identity, active/closed status, current lock owner, lease token, and lease
expiry. It does not store turn bodies, candidate state, terminal summaries, or
template-rendered Markdown.

Agents derive all debate state from the target Markdown after acquiring the
lock. They are responsible for detecting malformed managed regions, preserving
accepted turns, applying the artifact template, and choosing terminal outcomes
from the written debate record.

Socratic Duel is intentionally bounded:

- Exactly two active participants in v1
- At most 3 turn pairs, or 6 accepted turns total
- One participant owns the document lock at a time
- Candidate convergence is advisory and never closes the duel by itself
- Accepted turns must include evidence-backed critique, agreement, novelty, and unresolved items

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the local Markdown document to debate |
| `PARTICIPANT_NAME` | No | Host identity | Display identity recorded for this participant |
| `MODEL_ID` | No | `unknown-model` | Model identity recorded with participant turns |

`TARGET_PATH` must be an absolute path to a readable `.md` or `.markdown`
file. Missing, unreadable, relative, or non-Markdown paths invalidate the
attempt without modifying unrelated files.

Waiting is always bounded and non-interactive. If a peer has not joined or the
peer owns the lock, the agent follows the workflow's retry guidance and exits
with `TIMEOUT` when the bounded wait expires.

## Backend Lock Commands

The workflow uses these commands internally:

| Command | Responsibility |
|---------|----------------|
| `join` | Create or resume an active lock context and register a participant |
| `status` | Return participant count and current lock owner/expiry |
| `claim-lock` | Acquire the exclusive document lock or receive wait guidance |
| `refresh-lock` | Extend the current owner's lease while composing or writing |
| `release-lock` | Release the lock, optionally closing the lock context |

The backend does not parse or render Markdown, validate turn content, derive
candidate convergence, choose terminal outcomes, or manage templates.

## Turn Protocol

Each accepted turn is written by the agent into the managed Markdown region. A
turn must include:

| Section | Requirement |
|---------|-------------|
| `STANCE` | One of `OPEN_TO_DEBATE`, `CONVERGING`, `ACCEPTING_CONSENSUS`, `DISSENTING`, or `REVISING` |
| `Position` | The participant's current position |
| `Counterpoints` | Specific critiques that name the prior turn or section being addressed and include support |
| `Agreements` | Scoped points of agreement |
| `Novel Argument` | A supported claim not already present in prior turns |
| `Unresolved Items` | Remaining issues, including whether each one is blocking |
| `Stance Revision Support` | Evidence or reasoning required when changing stance |

Support entries must be file references, URLs, or named reasoning principles
such as `Principle: parsimony`. A participant that accepts consensus still has
to provide evidence and scoped critique, limitation, or non-blocking unresolved
items so agreement is not mere deference.

## Managed Markdown Region

The agent creates one region bounded by `rp1:socratic-duel` HTML comments using
the `managed-debate-region` template from `rp1-base:artifact-templates`. It may
update the region header, participant table, candidate convergence note, and
conclusion. Accepted turn bodies are append-only by prompt contract.

Surrounding document content is preserved. Duplicate managed regions, malformed
markers, skipped or duplicate turn numbers, and edited prior turns are treated
as invalidation conditions by the agent before releasing or closing the lock.

## Terminal Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support |
| `DISSENT` | Material disagreement or blocking unresolved items remain after both participants contributed |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent |
| `TIMEOUT` | Bounded waiting expires without a valid continuation |
| `INVALIDATED` | Path, managed region, sequence, lock ownership, or prior-turn immutability validation fails |

## Workflow Visibility

Socratic Duel is a resumable tracked workflow. It emits:

- `artifact_registered` for the absolute target Markdown file with `storageRoot: "absolute"`
- Participant status with `--unit participant:{participant_id}`
- Lock ownership, release, and waiting status for participants
- Turn composition and Markdown update status with `--unit turn:{turn_number}`
- `btw_update` when candidate convergence is detected
- Terminal `adjourn` status with the exact outcome

These events make registration, waiting, lock ownership, turn progress,
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

Use the same absolute `TARGET_PATH` from the second harness. The lock service
resumes the active context instead of creating a separate participant set.

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
