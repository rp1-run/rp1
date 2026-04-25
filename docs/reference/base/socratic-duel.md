# socratic-duel

Use Socratic Duel when you want two AI participants to pressure-test a local
Markdown document and leave the critique directly in that document.

---

## What You Get

Socratic Duel adds a debate section to the target Markdown file. The rest of
the document is preserved. A completed debate reads like this:

```markdown
## Socratic Duel

**Status**: ACCEPTED_CONSENSUS
**Participants**: Claude, Codex
**Candidate Convergence**: Yes

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

### Turn 2 - Codex (codex / gpt-5) - CONVERGING

**Position**
I agree with the staged rollout, and the rollback threshold should be added
before approval.

**Counterpoints**
- Addresses: Turn 1
  Claim: A manual threshold may be too slow during incident response.
  Support:
    - Principle: incident response latency

**Agreements**
- The proposal should proceed only after rollback criteria are explicit.

**Novel Argument**
The threshold should be paired with an owner and response window.

Support:
    - File: docs/oncall.md

**Unresolved Items**
- Choose the threshold value. (non-blocking)

### Conclusion

**Outcome**: ACCEPTED_CONSENSUS

Both participants accept the revised direction: keep the staged rollout, add
explicit rollback criteria, and assign an owner for response.
```

## How To Use It

Run the command against the Markdown file you want reviewed. The first
participant waits for a second participant when needed.

=== "Claude Code"

    ```bash
    /socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Claude MODEL_ID=claude-sonnet
    ```

=== "OpenCode"

    ```bash
    /rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=OpenCode MODEL_ID=opencode-model
    ```

=== "Codex"

    ```bash
    $rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
    ```

To join from a second harness, run the same command with the same `TARGET_PATH`
and a different `PARTICIPANT_NAME`.

```bash
$rp1-base-socratic-duel TARGET_PATH=/Users/alex/project/decision.md PARTICIPANT_NAME=Codex MODEL_ID=gpt-5
```

## How It Plays Out

1. The first participant starts or resumes the debate for the target document.
2. The second participant joins with the same `TARGET_PATH`.
3. Participants take turns writing structured critiques into the debate section.
4. The debate ends with an explicit outcome in the Markdown file.

If a participant does not join or does not continue, waiting is bounded. When
waiting expires, the document records a `TIMEOUT` conclusion.

## Good Uses

Socratic Duel is useful for:

- Reviewing plans before implementation
- Testing design docs or requirements for weak assumptions
- Comparing tradeoffs before choosing a technical direction
- Forcing a second participant to challenge an apparent consensus

It is not meant for open-ended chat or for rewriting the original document
outside the debate section.

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
support is not enough.

## Outcomes

| Outcome | Meaning |
|---------|---------|
| `ACCEPTED_CONSENSUS` | Latest turns from both participants explicitly accept consensus with adequate support |
| `DISSENT` | Material disagreement or blocking unresolved items remain after both participants contributed |
| `MAX_TURNS` | Turn 6 is accepted without consensus or dissent |
| `TIMEOUT` | Bounded waiting expires without a valid continuation |
| `INVALIDATED` | Path, debate section, sequence, ownership, or prior-turn immutability validation fails |

## Limits

- Exactly two active participants in v1
- At most 3 turn pairs, or 6 accepted turns total
- One participant writes at a time
- Candidate convergence is advisory and never ends the debate by itself
- Text outside the debate section is preserved

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_PATH` | Yes | - | Absolute path to the readable and writable local Markdown document to debate |
| `PARTICIPANT_NAME` | Yes | - | Unique display identity recorded for this participant |
| `MODEL_ID` | No | `unknown-model` | Model identity recorded with participant turns |

`TARGET_PATH` must be an absolute path to a readable and writable `.md` or
`.markdown` file. Missing, unreadable, unwritable, relative, or non-Markdown
paths invalidate the attempt without modifying unrelated files.

## Progress

rp1 shows participant registration, waiting, turn progress, candidate
convergence, and the final outcome while the debate is running.

## Related Commands

- [`strategize`](strategize.md) - Holistic strategic analysis with recommendations
- [`deep-research`](deep-research.md) - Parallel research for codebase and technical questions
- [`guide`](guide.md) - Discover rp1 capabilities and workflow guidance
