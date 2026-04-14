---
scope: kbRoot
path_pattern: "interaction-model.md"
producer: knowledge-base
type: document
description: "Cross-surface interaction semantics, UX principles, user-visible states, and accessibility constraints for a single-project codebase."
strictness: strict
---
# [Project Name] - Interaction Model

**Project**: [Project Name]
**Analysis Date**: [Date]
**Surfaces**: [CLI, web, chat, mobile, other]

## Experience Principles

- **[Principle]**: [How the product should feel and behave]
- **[Principle]**: [How attention, complexity, or discoverability is handled]

## Actors & Surfaces

| Actor | Surface | Goal | Entry Points |
|-------|---------|------|--------------|
| [actor] | [surface] | [goal] | [command, route, screen, shortcut] |

## Primary Actions

### [Surface Name]
**Role**: [What this surface is for]
**Primary actions**: [What users can do here]
**Intentional constraints**: [What is deliberately omitted or limited]

## User-Visible States

| State | Meaning | Surface Signals |
|-------|---------|-----------------|
| [state] | [meaning] | [status badge, copy, animation, color, sound] |

## Feedback Loops

- **[Loop]**: [Trigger] -> [feedback] -> [next user choice]
- **[Loop]**: [Trigger] -> [feedback] -> [next user choice]

## Accessibility & Discoverability

- **Keyboard / touch / voice rules**: [stable affordances]
- **Focus / announcement behavior**: [critical constraints]
- **Reduced motion / sensory load**: [interaction consequences]

## Cross-Surface Deltas

| Behavior | Surfaces | Delta | Reason |
|----------|----------|-------|--------|
| [behavior] | [surfaces] | [difference] | [why it differs intentionally] |

## Related KB Links

- **System topology**: See [architecture.md](architecture.md)
- **Component inventory**: See [modules.md](modules.md)
- **Terminology**: See [concept_map.md](concept_map.md)
- **Implementation details**: See [patterns.md](patterns.md)
