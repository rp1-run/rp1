# socratic-duel

Use Socratic Duel when you want two AI participants to challenge a Markdown
document and save the debate as a separate note.

It is useful for reviewing plans, designs, requirements, rollout proposals, and
other documents where you want a second perspective before you act on them.

---

## What You Get

Point Socratic Duel at a local Markdown file. rp1 reads that file, starts or
joins a two-participant debate, and saves the result in `.rp1/work/debates/`.

Your original document stays unchanged. You do not need to prepare it, add
markers, or make it writable.

Debate files are named by date and topic, for example:

```text
.rp1/work/debates/2026-04-25-rollout-plan.md
```

Each debate file includes:

- A link back to the source document
- The topic being debated
- The two participants
- Each participant turn
- Evidence, agreements, disagreements, and unresolved items
- The final outcome

## Quick Start

Use launcher mode when you want rp1 to start both participants for you:

=== "Claude Code"

    ```bash
    /socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan"
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan"
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel-run TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan"
    ```

When the run finishes, open the new file in `.rp1/work/debates/`.

## Choosing A Topic

`TOPIC` is optional, but it is usually worth setting.

Use it to focus the debate on one part of a larger document:

```bash
$rp1-base-socratic-duel-run TARGET_PATH=/Users/alex/project/architecture.md TOPIC="Migration fallback plan"
```

If you leave `TOPIC` out, Socratic Duel uses the first Markdown heading in the
source file. If there is no heading, it uses the filename.

## Launcher Mode

Launcher mode is the simplest way to use Socratic Duel. The launcher starts two
participant agents, waits for them to finish, and reports the outcome.

The launcher does not write debate turns itself. The debate content comes from
the participant agents.

Use launcher mode when:

- You want one command to run the whole debate
- Both participants can run from the tool you are using now
- You do not need to coordinate separate tools manually

## Direct Participant Mode

Direct mode is for cases where you want to start each participant yourself, for
example from two different tools or terminal sessions.

Run the same command twice with the same `TARGET_PATH` and `TOPIC`, but with a
different `PARTICIPANT_NAME`.

First participant:

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

Second participant:

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md TOPIC="Rollout plan" PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

## What Happens During A Duel

1. rp1 checks that `TARGET_PATH` points to a readable Markdown file.
2. It creates or resumes the debate for that source file and topic.
3. The participants read the source document.
4. The participants add structured turns to the debate file.
5. The debate ends with a final outcome.
6. Arcade shows the run as finished instead of leaving it active.

If the second participant never joins, or a participant stops responding, the
duel times out and records that outcome in the debate file.

## Good Uses

Socratic Duel works well for:

- Reviewing plans before implementation
- Testing a design for weak assumptions
- Comparing tradeoffs before choosing a direction
- Focusing discussion on one section of a larger document
- Challenging an apparent consensus before you commit to it

It is not a general chat command, and it is not a document rewriter. Use the
debate output as input for your next edit or decision.

## What A Good Turn Includes

Each accepted turn should include:

- A clear stance
- A position
- Counterpoints
- Agreements
- One new argument
- Unresolved items
- Supporting evidence

Support can be a file reference, URL, or named reasoning principle such as
`Principle: operational reversibility`.

Valid stances are:

- `OPEN_TO_DEBATE`
- `CONVERGING`
- `ACCEPTING_CONSENSUS`
- `DISSENTING`
- `REVISING`

Even when a participant agrees, it should still explain the limits of that
agreement and identify at least one risk, caveat, or remaining question.

## Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Both participants accept the direction with enough support |
| `DISSENT` | A material disagreement or blocking unresolved item remains |
| `MAX_TURNS` | The duel reached the turn limit without consensus or dissent |
| `TIMEOUT` | A participant did not join or continue in time |
| `INVALIDATED` | The duel could not safely continue because the sequence or inputs were invalid |

## Limits

- Exactly two active participants
- Up to 6 accepted turns total
- One debate file per source document and topic
- The source document is only read, not edited
- Launcher mode runs both participants from the tool you are using now

## Direct Participant Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the local Markdown document to debate |
| `TOPIC` | No | First heading or filename | Focus for the debate and debate filename |
| `PARTICIPANT_NAME` | Yes | - | Display name for this participant |
| `MODEL_ID` | No | `unknown-model` | Model name to record with participant turns |

`TARGET_PATH` must point to a readable `.md` or `.markdown` file.

## Launcher Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the local Markdown document to debate |
| `TOPIC` | No | First heading or filename | Focus passed to both participants |
| `MODEL_ID` | No | `unknown-model` | Model name passed to both participants |

## Progress In Arcade

Arcade shows the duel moving through preparation, participant waiting, debate,
closing, and the final outcome.

If the duel finishes, the run is closed so it does not stay stuck as running or
waiting.

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
