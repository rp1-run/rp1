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
{% endunless %}
