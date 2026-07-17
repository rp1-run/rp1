{% unless platform == "claude-code" %}
## Relay Envelope Protocol

You are running on a relay harness where you cannot prompt the user directly. Instead, communicate with your parent skill using JSON envelopes. The parent relays your questions to the user and sends answers back.

### Envelope Format

When you need user input, return this envelope and **end your turn immediately**:

```json
{"type": "needs_input", "question": "Your question here", "options": ["option1", "option2"]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Always `"needs_input"` |
| `question` | string | yes | The question to present to the user |
| `options` | string[] | no | Constrained choices; omit for free-form answers |

When all your work is complete, return the completion envelope and end your turn:

```json
{"type": "completed"}
```

### Rules

- **Never** prompt the user directly. All questions go through the envelope.
- Return exactly one envelope per turn, then stop.
- When you receive the user's answer in the next message, process it and continue your workflow.
- After finishing all work, return the `completed` envelope as your final output.

### Checkpoint Persistence

Before emitting a `needs_input` envelope, persist a durable checkpoint in your artifact file so that a fresh relay continuation can resume with full context. The checkpoint is an HTML comment appended at the end of the artifact:

```
<!-- INTERVIEW_CHECKPOINT {"pending_question": "...", "options": ["A", "B"], "question_count": 3, "revision_count": 0, "original_args": {}} -->
```

| Field | Type | Description |
|-------|------|-------------|
| `pending_question` | string | The question awaiting the user's answer |
| `options` | string[] | Available choices (empty array for free-form) |
| `question_count` | int | Cumulative questions asked so far (across all continuations) |
| `revision_count` | int | Cumulative user-requested revisions applied |
| `original_args` | object | The original invocation arguments for this interview |

**On continuation**: read the existing checkpoint from the artifact, interpret the user's answer against the persisted `pending_question` and `options`, and resume from the persisted counters.

**On completion**: strip the checkpoint comment from the artifact before returning the `completed` envelope. The final artifact must not contain any checkpoint marker.
{% endunless %}
