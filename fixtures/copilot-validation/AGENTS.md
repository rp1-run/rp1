# rp1 Copilot CLI Validation Fixture

This project validates that GitHub Copilot CLI supports the six harness primitives required by rp1.

## Instructions

1. Read `.rp1/context/index.md` first.
2. Then load only the KB files needed for the task.

Project understanding belongs in `.rp1/context/`. This file covers runtime and authoring constraints.

## Core Rules

### Namespace prefixes

Use these prefixes exactly:

- Skills: `/echo-test`
- Agent references: `rp1-fixture/echo-agent`

### KB Loading

When starting a session in this project, read `.rp1/context/index.md` to understand the project structure and conventions. This validates that Copilot CLI follows AGENTS.md instructions for knowledge base bootstrapping.
