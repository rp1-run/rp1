# socratic-duel

Run a bounded, evidence-driven two-participant debate in a local Markdown document.

---

## Synopsis

=== "Claude Code"

    ```bash
    /socratic-duel TARGET_PATH=/absolute/path/to/document.md PARTICIPANT_NAME=Claude
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel TARGET_PATH=/absolute/path/to/document.md PARTICIPANT_NAME=OpenCode
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel TARGET_PATH=/absolute/path/to/document.md PARTICIPANT_NAME=Codex
    ```

## Description

The `socratic-duel` workflow adds a clearly marked debate section to a readable
and writable local Markdown file. Two participants use the same absolute
`TARGET_PATH` to join the same debate and take turns critiquing, refining, and
testing the document's ideas.

The document remains the durable review surface. Participants preserve
surrounding content, append structured turns inside the debate section, and end
with an explicit outcome such as consensus, dissent, timeout, invalidation, or
maximum turns reached.

Socratic Duel is intentionally bounded:

- Exactly two active participants in v1
- At most 3 turn pairs, or 6 accepted turns total
- One participant writes at a time
- Candidate convergence is advisory and never ends the debate by itself
- Accepted turns must include evidence-backed critique, agreement, novelty, and unresolved items

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the readable and writable local Markdown document to debate |
| `PARTICIPANT_NAME` | Yes | - | Unique display identity recorded for this participant |
| `MODEL_ID` | No | `unknown-model` | Model identity recorded with participant turns |

`TARGET_PATH` must be an absolute path to a readable and writable `.md` or
`.markdown` file. Missing, unreadable, unwritable, relative, or non-Markdown
paths invalidate the attempt without modifying unrelated files.

Waiting is bounded and non-interactive. If a peer has not joined or currently
has the turn, the participant waits according to the workflow's retry guidance.
If waiting expires, the debate records a `TIMEOUT` conclusion in the Markdown
file before the workflow completes.

## Turn Protocol

Each accepted turn is written into the managed debate section. A turn must
include:

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

## Managed Debate Section

The workflow creates one clearly bounded section in the target Markdown file.
It may update the section header, participant table, candidate convergence note,
and conclusion. Accepted turn bodies are append-only.

Surrounding document content is preserved. Duplicate debate sections, malformed
markers, skipped or duplicate turn numbers, and edited prior turns are treated
as invalidation conditions.

## Terminal Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support |
| `DISSENT` | Material disagreement or blocking unresolved items remain after both participants contributed |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent |
| `TIMEOUT` | Bounded waiting expires without a valid continuation |
| `INVALIDATED` | Path, managed section, sequence, ownership, or prior-turn immutability validation fails |

## Progress Visibility

Socratic Duel is a resumable tracked workflow. rp1 surfaces participant
registration, waiting, turn progress, candidate convergence, and the terminal
outcome so long-running cross-participant debates are observable without
manually inspecting the file after every step.

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

Use the same absolute `TARGET_PATH` from the second harness. The workflow
resumes the active debate instead of creating a separate participant set.

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
