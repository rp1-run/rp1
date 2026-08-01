# rp1-dev Agents

| Agent | Role | Description |
|-------|------|-------------|
| task-builder | worker | Implements feature tasks |
| pr-reviewer | reviewer | Reviews pull requests |

## Subagent Waiting

Do not assume a subagent has failed merely because it has not answered quickly. Use longer wait windows for artifact-producing agents, and check for expected artifact side effects on disk before concluding a subagent is stuck.
