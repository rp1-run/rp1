---
scope: kbRoot
path_pattern: "features.md"
producer: knowledge-base
type: document
description: "Capability inventory with two-level surface-to-feature tree, evidence-tier badges, audience tags, and stable node IDs for a monorepo codebase."
emit_hint: |
  rp1 agent-tools emit \
    --workflow knowledge-build \
    --type artifact_registered \
    --step kb-feature-extractor:completed \
    --data '{"path": ".rp1/context/features.md", "storageRoot": "project"}'
strictness: strict
---
# Repository Capabilities

**Repository**: [Repository Name]
**Last Updated**: [Date]
**Surfaces**: [N detected]
**Scope**: Capabilities inventoried across all projects in this repository.

## [Surface Name]

- **[Capability Name]** `T{N}` -- [One-line description]
  <!-- id: {surface}.{capability} | tier: T{N} | audience: {tag} | evidence: {comma-separated paths} -->
  - [Sub-feature Name] `T{N}` -- [One-line description]
    <!-- id: {surface}.{capability}.{sub-feature} | tier: T{N} | audience: {tag} | evidence: {comma-separated paths} -->

## Surfaces Not Analyzed

[List of anchor classes that could not be mechanically detected in this repository, or "None" if all anchor classes were detected.]

## Coverage Summary

| Tier | Count | Meaning |
|------|-------|---------|
| T1 | [N] | Documented and tested |
| T2 | [N] | Documented or tested |
| T3 | [N] | Referenced but undocumented/untested |
| T4 | [N] | Investigation candidates |

## Related KB Links

- **System topology**: See [architecture.md](architecture.md)
- **Modules and projects**: See [modules.md](modules.md)
- **Dependencies**: See [dependencies.md](dependencies.md)
- **Implementation details**: See [patterns.md](patterns.md)
- **Terminology**: See [concept_map.md](concept_map.md)
- **Interaction semantics**: See [interaction-model.md](interaction-model.md)
