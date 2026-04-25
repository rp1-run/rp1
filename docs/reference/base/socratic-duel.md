# socratic-duel

Use Socratic Duel when you want two AI participants to pressure-test a local
Markdown document and record the debate in a separate rp1 work artifact.

---

## What You Get

Socratic Duel treats the target Markdown file as read-only source material.
The durable debate record is written under `.rp1/work/debates/` with a
date-and-topic filename such as:

```text
.rp1/work/debates/2026-04-25-rollout-plan.md
```

A completed debate artifact reads like this:

```markdown
# Socratic Duel: Rollout Plan

**Source**: `/Users/alex/project/decision.md`

## Metadata

| Field | Value |
|-------|-------|
| duel_id | duel_123 |
| source_path | /Users/alex/project/decision.md |
| topic | Rollout Plan |
| topic_slug | rollout-plan |
| status | ACCEPTED_CONSENSUS |
| candidate_convergence | Yes |

## Participants

| Participant | Harness | Model |
|-------------|---------|-------|
| Claude | claude-code | claude-sonnet |
| Codex | codex | gpt-5 |

## Turns

### Turn 1 - Claude (claude-code / claude-sonnet) - OPEN_TO_DEBATE

**Position**
The proposal is directionally sound, but the rollout plan needs a sharper
fallback path before adoption.

**Counterpoints**
- Addresses: Rollout section
  Claim: The current plan assumes migration failures are rare.
  Support:
    - File: docs/rollout.md

**Agreements**
- The staged rollout is preferable to a single cutover.

**Novel Argument**
The monitoring plan should include a user-visible rollback threshold.

Support:
    - Principle: operational reversibility

**Unresolved Items**
- Define rollback threshold. (blocking)

## Conclusion

**Outcome**: ACCEPTED_CONSENSUS

Both participants accept the revised direction: keep the staged rollout, add
explicit rollback criteria, and assign an owner for response.
```

The source document does not need `rp1:socratic-duel` boundary markers for
normal recording, and Socratic Duel does not rewrite it.

## How To Use It

### Direct Participant Mode

Direct mode is useful when each participant is started explicitly. Run the
command against the Markdown source document. Use the same `TARGET_PATH` and
`TOPIC` for both participants.

=== "Claude Code"

    ```bash
    /socratic-duel TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" PARTICIPANT_NAME=Claude MODEL_ID=claude-sonnet
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" PARTICIPANT_NAME=OpenCode MODEL_ID=opencode-model
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
    ```

To join from a second harness, run the same command with the same `TARGET_PATH`
and `TOPIC`, but a different `PARTICIPANT_NAME`.

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

If `TOPIC` is omitted, Socratic Duel infers it from the first Markdown heading
or the source filename. The inferred topic is stored in the debate artifact and
used for resume identity.

### Launcher Mode

Launcher mode starts two participant subagents and waits for their
participant-owned outcome. The launcher coordinates and reports only; it does
not write debate turns, decide consensus, or close participant locks.

=== "Claude Code"

    ```bash
    /socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" MODEL_ID=claude-sonnet
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" MODEL_ID=opencode-model
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" MODEL_ID=gpt-5
    ```

The launcher MVP is same-harness orchestration: both spawned participants run
through the current host integration.

## How It Plays Out

1. Socratic Duel validates `TARGET_PATH` as an absolute readable Markdown file.
2. It starts or resumes the active debate for the source path and topic.
3. The first lease holder creates the debate artifact under `.rp1/work/debates/`
   if it does not already exist.
4. Participants read the source document for evidence and append structured
   turns only to the debate artifact.
5. The debate ends with an explicit terminal outcome in the artifact, and the
   rp1 workflow run is closed.

If a participant does not join or does not continue, waiting is bounded. When
waiting expires, the debate artifact records a `TIMEOUT` conclusion.

## Good Uses

Socratic Duel is useful for:

- Reviewing plans before implementation
- Testing design docs or requirements for weak assumptions
- Comparing tradeoffs before choosing a technical direction
- Focusing a debate on one section or topic in a larger document
- Forcing a second participant to challenge an apparent consensus

It is not meant for open-ended chat or for rewriting the original document.

## Turn Expectations

Every accepted turn must include a stance, position, counterpoints, agreements,
a novel argument, unresolved items, and support. Support can be a file
reference, URL, or named reasoning principle such as `Principle: parsimony`.

Valid stances are:

- `OPEN_TO_DEBATE`
- `CONVERGING`
- `ACCEPTING_CONSENSUS`
- `DISSENTING`
- `REVISING`

A participant that accepts consensus still needs evidence and at least one
scoped critique, limitation, or non-blocking unresolved item. Agreement without
support is not enough. If a topic was supplied, claims, counterpoints, and
unresolved items must stay focused on that topic.

## Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support |
| `DISSENT` | Material disagreement or blocking unresolved items remain after both participants contributed |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent |
| `TIMEOUT` | Bounded waiting expires without a valid continuation |
| `INVALIDATED` | Input, artifact sequence, ownership, or prior-turn immutability validation fails |

Arcade shows developer-facing progress such as Preparing, Waiting for
participant, Debating, Closing, Completed, Dissent, Max turns, Timed out, or
Invalidated. Lower-level lock and lease details remain available in event
metadata for troubleshooting.

## Limits

- Exactly two active participants in v1
- At most 3 turn pairs, or 6 accepted turns total
- One participant writes the debate artifact at a time
- Candidate convergence is advisory and never ends the debate by itself
- Source documents are read-only input during normal recording
- Launcher mode is same-harness orchestration in the MVP

## Direct Participant Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the readable local Markdown source document to debate |
| `TOPIC` | No | Inferred from heading or filename | Optional topic focus used for artifact naming, resume identity, and turn scope |
| `PARTICIPANT_NAME` | Yes | - | Unique display identity recorded for this participant |
| `MODEL_ID` | No | `unknown-model` | Model identity recorded with participant turns |

`TARGET_PATH` must be an absolute path to a readable `.md` or `.markdown` file.
It does not need to be writable for normal debate recording.

## Launcher Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the readable local Markdown source document to debate |
| `TOPIC` | No | Inferred from heading or filename | Optional topic focus passed to both participant subagents |
| `MODEL_ID` | No | `unknown-model` | Model identity passed to both participant subagents |

## Progress

rp1 shows preparing, participant waiting, debate progress, closing, and the
final outcome while the debate is running. Terminal outcomes close the run so
Arcade does not leave a finished debate in a running or waiting state.

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
