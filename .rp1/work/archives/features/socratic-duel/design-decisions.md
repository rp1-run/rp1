---
rp1_doc_id: 4660b783-5f41-4303-957c-205091e705eb
---
# Design Decisions: Socratic Duel

**Feature ID**: socratic-duel
**Created**: 2026-04-24
**Updated**: 2026-04-25

## Decision Log

| ID | Decision | Choice | Rationale | Alternatives Considered |
|----|----------|--------|-----------|-------------------------|
| D1 | Plugin placement | Add `socratic-duel` to `rp1-base` with category `strategy` | The workflow is a general local reasoning and design-validation capability, not a dev-only implementation workflow. | `rp1-dev` review skill; rejected because it would make a foundation reasoning workflow depend on the dev plugin. |
| D2 | Backend boundary | Backend owns participant registration and lock leases only | Agents are better at text parsing, debate-state derivation, and local Markdown stewardship; code should only serialize concurrent writers. | Heavy TypeScript coordinator owning Markdown parsing, turn validation, candidate state, and terminal derivation; rejected after EDIT-001. |
| D3 | Durable state split | SQLite stores lock context; Markdown stores debate record | Cross-process locks need atomic updates, while debate content should remain readable and document-local. | Store turns, candidates, hashes, and outcomes in SQLite; rejected because it reintroduces backend-owned content state. |
| D4 | Coordination API | `rp1 agent-tools socratic-duel` with `join`, `status`, `claim-lock`, `refresh-lock`, and `release-lock` | These commands provide the minimum backend surface required for safe concurrent document updates. | `submit-turn`, `claim-turn`, or `adjourn` backend commands; rejected because they imply backend ownership of turn content and outcomes. |
| D5 | Template ownership | Agents load `managed-debate-region` from `rp1-base:artifact-templates` | Central templates keep the managed-region shape consistent without adding TypeScript template rendering. | Hardcode template text in TypeScript or duplicate it in the skill; rejected because it fragments ownership. |
| D6 | Turn format | Prompt-enforced Markdown sections | Agents can apply semantic judgment to novelty, support, and stance changes while preserving readable output. | Structured JSON submitted to backend; rejected because it leads to deterministic validators for content that should remain agent-owned. |
| D7 | Consensus policy | Explicit participant stances, no judge | Requirements reject third-party judge dependency and require evidence-backed participant acceptance. | LLM judge or similarity threshold; rejected because it risks false consensus and adds a cloud/model dependency. |
| D8 | Debate budget | Hard v1 ceiling of 6 turns | Direct requirement and anti-sycophancy constraint. | Configurable turn budget; rejected for v1 because higher limits are explicitly out of bounds. |
| D9 | Visibility | Existing `emit` event types with participant/turn units | Uses the current Arcade event model without adding custom event types. | New event type for duel turns; rejected because status/unit plus artifact registration covers v1 visibility. |
| D10 | Timeout default | 15-minute lock lease in v1 | Provides bounded waiting without making cross-harness handoffs too brittle. | Indefinite wait; rejected by requirements. Very short timeout; rejected as too fragile for manual cross-harness use. |
| D11 | Lease capability visibility | Status and denied lock attempts redact lease tokens; close requires an active owned lease | The lease token is the write capability for the target document, so only successful owner acquisition/refresh may reveal it. Closing without current ownership would let peers terminate contexts they do not own. | Return token from status or allow ownerless `release-lock --close`; rejected because both break the lock-only safety contract. |

---

## Auto-Selected Technology Decisions

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Runtime language | Bun/TypeScript for lock backend only | KB `index.md`, `patterns.md` | rp1 CLI and agent-tools are implemented in Bun/TypeScript, but EDIT-001 limits this code to coordination. |
| Persistence | SQLite in `~/.rp1/rp1.db` for locks only | KB `architecture.md`, `modules.md` | Existing local-first runtime state uses SQLite, and leases need cross-process transactions. |
| Debate state | Target Markdown document | User pivot, requirements REQ-005 | Debate content, candidate state, terminal summaries, and turn history should remain agent-owned and readable. |
| Workflow host | `rp1-base` strategy skill | KB `modules.md`, skill layout | The feature is a general reasoning workflow aligned with base strategy capabilities. |
| Coordination API | Lock-only `rp1 agent-tools socratic-duel` tool | Existing `task` and `emit` agent-tool patterns | The backend only needs to register participants and serialize write access. |
| Turn limit | 6 total turns | Requirements REQ-004 | V1 explicitly caps debate at 3 turn pairs. |
| Lock lease | 15 minutes | Conservative default | Meets bounded wait requirements while allowing cross-harness handoff time. |
| Close authority | Active owner token | Lock service contract | Terminal Markdown writes and backend close must be tied to the same current lease; timeout paths that cannot acquire a lock emit terminal status without editing Markdown. |
| Artifact registration | Absolute Markdown artifact | Existing `artifact_registered` storageRoot contract | Target documents may live outside `.rp1/work`, so `storageRoot: "absolute"` is required. |
| Template source | `rp1-base:artifact-templates` | Artifact template contract | Agents should use the central managed-region template instead of backend template management. |
| Test approach | Unit-heavy with focused integrations | KB `patterns.md:Testing` | Tests should cover lock behavior, schema migration, and prompt/template boundary contracts without testing agent semantic judgment in TypeScript. |
