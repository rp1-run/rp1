---
rp1_run_id: 9fcdc375-88ec-4a4d-b645-edbe6700c6b9
rp1_doc_id: 2f0db7d5-d4ac-4cac-98c6-b6459380155a
---
# Requirements Specification: Dockerized Eval Isolation

**Feature ID**: fix-evals
**Version**: 1.1.0
**Status**: Draft
**Created**: 2026-04-11

## 1. Feature Overview
The required delivery scope for `fix-evals` is narrow: evals must run inside Docker using rp1's existing Docker infrastructure. Docker container boundaries, not a new native runtime-context system, provide the isolation that keeps eval traffic from clobbering or being clobbered by a host rp1 daemon. Evals must continue to exercise real rp1 behavior inside the container, and any host-side change must stay limited to the minimum launch-time guardrails needed to keep host and container state separate.

## 2. Business Context
### 2.1 Problem Statement
Host-native eval execution can interfere with an interactive host rp1 daemon because both sides may compete for the same default runtime surfaces, ports, and process ownership. The repo already has Docker-based developer infrastructure, but evals are not yet routed through it as the default isolation boundary.

### 2.2 Business Value
- Protects the host interactive runtime without redesigning rp1's in-process runtime ownership model.
- Keeps evals closer to real behavior than a bookkeeping no-op path because rp1 runs normally inside the container.
- Reuses existing Docker assets instead of introducing a second large isolation mechanism.
- Gives operators a clearer, tighter way to debug eval failures without contaminating the host machine state.

### 2.3 Success Metrics
- The supported eval entry path runs inside Docker and completes without writing to the host interactive rp1 runtime by default.
- Running dockerized evals does not stop, reuse, or hide a host rp1 daemon.
- Existing prompt and skill content remains reusable inside eval execution without authored prompt rewrites.
- The implementation adds only narrow Docker-launch plumbing rather than a broad runtime-context or schema redesign.

## 3. Stakeholders & Users
### 3.1 User Types
- **Evaluation operators**: maintainers running prompt attestation, harnesses, or release checks.
- **Prompt and skill authors**: contributors who need one command surface that remains valid when evals run in Docker.
- **Interactive rp1 users**: developers running Arcade or local workflows on the host machine.
- **Platform maintainers**: owners responsible for eval reliability and host/runtime safety.

### 3.2 Stakeholder Interests
- Evaluation operators need a supported way to run evals without host-runtime contamination.
- Prompt and skill authors need prompt reuse, not a split authored surface.
- Interactive users need their host daemon and UI left alone.
- Platform maintainers need a fix that is small, defensible, and easy to operate.

## 4. Scope Definition
### 4.1 In Scope
- Run eval workflows inside Docker using the existing Docker image and launch infrastructure already present in the repo.
- Use container-local process, filesystem, home-directory, and network isolation to keep eval runtime state separate from the host runtime.
- Preserve real rp1 workflow lifecycle behavior inside the container.
- Keep prompt and skill command usage compatible inside eval execution.
- Add only the minimal Docker-specific launch or harness plumbing required for eval execution.
- Add a narrow host-side launch guard only if it is strictly necessary to prevent env or port leakage between host and container.

### 4.2 Out of Scope
- A native runtime-context refactor or any broad in-process runtime ownership redesign.
- New general-purpose runtime storage topologies such as per-context `.rp1/runtime` directories on the host.
- Broad database schema, API, or UI redesign to model runtime ownership as the primary isolation mechanism.
- Rewriting prompts, skills, or examples to use eval-specific rp1 commands.
- Making host-native eval execution a required or supported release path for this feature.

### 4.3 Assumptions
- The existing Docker infrastructure (`docker/Dockerfile`, `start-docker-*` patterns, mounted repo workflow) is sufficient to host eval execution.
- The container's default rp1 runtime locations are acceptable because they are isolated from the host by Docker.
- If Arcade inspection is needed during debugging, using a non-default host port mapping is sufficient to avoid colliding with the host daemon.

## 5. Functional Requirements
### REQ-001: Dockerized Eval Execution
- **Priority**: Must Have
- **Actor**: Evaluation operator
- **Action**: Launch evals through the supported Docker path.
- **Outcome**: Eval-created runs, events, artifacts, daemon state, and other mutable rp1 runtime data stay inside the container rather than the host interactive runtime.
- **Rationale**: Container isolation is the delivery mechanism for this feature.
**Acceptance**
- The documented eval entry path runs rp1 inside a Docker container built from the repo's existing Docker infrastructure.
- The supported path does not require mounting the host's `.rp1` or host rp1 config directories into the container.
- Normal eval execution can be cleaned up by removing the container and its container-local temp state, without host rp1 cleanup steps.

### REQ-002: Evaluation Fidelity Inside Docker
- **Priority**: Must Have
- **Actor**: Platform maintainer
- **Action**: Execute evals inside Docker against normal rp1 behavior.
- **Outcome**: Evals remain a useful signal for regressions while using container isolation.
- **Rationale**: Docker should replace host interference, not replace real workflow behavior with mocks or bookkeeping bypasses.
**Acceptance**
- Evals executed through the Docker path still exercise real run lifecycle updates, state validation, and artifact registration inside the container.
- The supported Docker flow does not depend on treating `emit` or equivalent bookkeeping as a no-op to stay safe from host interference.
- Workflow defects that would affect normal rp1 behavior inside the container surface in eval results.

### REQ-003: Prompt And Skill Compatibility
- **Priority**: Must Have
- **Actor**: Prompt and skill author
- **Action**: Reuse existing prompts, skills, and command examples during eval execution.
- **Outcome**: One authored workflow corpus remains usable; Dockerization happens at the launch boundary rather than inside prompt text.
- **Rationale**: Prompt duplication would create drift and maintenance cost without helping the isolation goal.
**Acceptance**
- Existing prompt and skill content does not require eval-specific rp1 command renaming to run under the supported Docker eval path.
- Introducing Dockerized eval isolation does not require authors to maintain separate prompt versions for Docker versus host execution.
- User-facing command examples inside prompts remain valid for normal rp1 usage; Docker-specific wrapping belongs to eval launch docs or harness tooling, not authored prompt content.

### REQ-004: Host Daemon Non-Interference
- **Priority**: Must Have
- **Actor**: Interactive rp1 user
- **Action**: Continue using the host interactive runtime while evals run in Docker.
- **Outcome**: Host daemon ownership, port usage, and runtime state remain independent of containerized eval activity.
- **Rationale**: The feature exists to stop host/eval interference, not just to move files around.
**Acceptance**
- Starting or stopping a dockerized eval does not stop, restart, reuse, or orphan a host rp1 daemon.
- A host interactive session can continue before, during, and after a dockerized eval without being redirected into container-owned state.
- If eval debugging exposes Arcade outside the container, the host-facing port mapping avoids collision with the host default port rather than replacing it.

### REQ-005: Reuse Existing Docker Infrastructure
- **Priority**: Must Have
- **Actor**: Platform maintainer
- **Action**: Implement the feature by extending the repo's current Docker tooling.
- **Outcome**: The fix stays small and operationally consistent with existing Docker workflows.
- **Rationale**: The requested pivot is specifically away from a new native isolation system and toward existing Docker assets.
**Acceptance**
- The implementation reuses the existing Docker image and container-launch patterns already present in the repo rather than introducing a separate isolation stack.
- New Docker-specific additions are limited to the plumbing needed to run evals and debug failures.
- The implementation does not require a new shared `RuntimeContext` abstraction, runtime-tagged persistence schema, or broad daemon ownership redesign on the host.

### REQ-006: Debuggable Containerized Evals
- **Priority**: Should Have
- **Actor**: Evaluation operator
- **Action**: Inspect a failed dockerized eval.
- **Outcome**: Operators can debug the failure from the container context without contaminating the host runtime.
- **Rationale**: A contained isolation model is only useful if failures can still be diagnosed.
**Acceptance**
- Preserved failing eval state remains inspectable from the Docker context used to run the eval.
- Documentation identifies how to inspect container-local eval state and, if supported, how to access Arcade for debugging without touching the host default daemon port.
- Debugging guidance does not rely on searching or repairing the host interactive runtime state.

### REQ-007: Safe Cleanup
- **Priority**: Should Have
- **Actor**: Evaluation operator
- **Action**: Dispose of dockerized eval state after a run or test cycle.
- **Outcome**: Cleanup is predictable and does not delete or corrupt host rp1 state.
- **Rationale**: Disposable eval state is one of the main benefits of container isolation.
**Acceptance**
- Normal dockerized eval cleanup removes container-local eval state without deleting host interactive runtime data.
- Preserved debug state is opt-in rather than the default behavior.
- Cleanup instructions are clear enough that operators know what is removed from the container context versus what remains on the host.

## 6. Non-Functional Requirements
### 6.1 Performance Expectations
- Docker startup overhead must stay reasonable for local and release-gating eval use.
- The Docker path must not make eval execution materially slower than needed beyond the expected container startup cost.

### 6.2 Security Requirements
- The supported Docker eval flow must not mount or rely on host interactive rp1 runtime directories.
- Host-side launch plumbing must avoid leaking rp1 runtime override environment variables into places where they would alter host daemon behavior.

### 6.3 Usability Requirements
- Operators should have a single documented Docker entry path for evals.
- Prompt and skill authors should not need to reason about Docker details while authoring prompts.

### 6.4 Compliance Requirements
- Eval evidence must remain attributable to the dockerized eval context through the container or preserved workspace it ran in, without requiring a broader host runtime ownership model.
- The feature must remain consistent with rp1's reproducibility and first-pass correctness goals.

## 7. User Stories
### STORY-001
As an evaluation operator, I want evals to run inside Docker so that host rp1 state stays untouched while evals still execute real rp1 behavior.

**GIVEN** a supported dockerized eval command
**WHEN** I run evals
**THEN** rp1 behavior executes inside the container and host runtime state is left alone.

### STORY-002
As an interactive rp1 user, I want my host daemon to keep working while evals run in Docker so that test traffic does not replace or hide my normal workflow activity.

**GIVEN** a host rp1 daemon may already be running
**WHEN** someone launches dockerized evals
**THEN** the host daemon is not stopped, reused, or masked by the eval run.

### STORY-003
As a prompt author, I want the same prompts and skills to keep working in evals so that Dockerization stays outside the prompt text I maintain.

**GIVEN** a prompt or skill already calls rp1 commands
**WHEN** it is executed under the supported Docker eval path
**THEN** it remains valid without authored prompt changes.

### STORY-004
As a maintainer, I want to debug a failing dockerized eval from inside the container context so that I can investigate the failure without digging through host rp1 runtime state.

**GIVEN** a failing eval has been preserved for debugging
**WHEN** I inspect the containerized environment
**THEN** I can access the relevant workspace and runtime state without relying on the host interactive runtime.

## 8. Business Rules
- Docker is the primary isolation boundary for this feature.
- Host-side changes must stay narrow and launch-oriented.
- Prompt and skill text stays shared between normal and eval execution.
- Broad host runtime ownership redesign is explicitly deferred out of this feature.

## 9. Dependencies & Constraints
- Depends on the existing Docker development infrastructure already present in the repo.
- Must avoid mounting host `.rp1` or host rp1 config directories into the eval container.
- Must keep using the repo's normal rp1 command surface inside the container.
- Must work with the credentials and harness CLIs already forwarded into Docker-based workflows.

## 10. Clarifications Log
- This pivot supersedes the prior plan to pursue a native runtime-context refactor within `fix-evals`.
- Dockerized eval execution is now the required delivery scope; host-native eval isolation is not a required outcome for this feature.
- The preferred Docker design uses the container's normal rp1 runtime locations instead of adding new host-side runtime storage layers.
- A small host-side guard is acceptable only if needed to prevent env or port leakage between the Docker launcher and the host runtime.

## AFK Mode: Auto-Selected Defaults

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| Isolation boundary | Existing Docker infrastructure | Matches the requested pivot and minimizes scope |
| Host-side changes | Minimal launch-time guard only if needed | Keeps the fix tight and avoids runtime redesign |
| Prompt compatibility | Preserve existing prompt and skill text | Dockerization belongs at the eval launch boundary |

## AFK Mode: Inferred Decisions

| Ambiguity | Resolution | Source |
|-----------|------------|--------|
| Default eval storage | Use container-local default rp1 runtime paths | Pivot requested Docker isolation over native runtime refactor |
| Host daemon protection | Prefer Docker namespace separation; add only narrow launch guards if needed | Pivot requested tight scope and minimal host-side change |
| Debug path | Reuse Docker context and non-default host port mapping if Arcade inspection is needed | Existing Docker tooling already forwards non-default host ports |

---

## EDIT-001: Explicit Cross-Runtime Daemon Isolation

**Date**: 2026-04-11
**Type**: CONCERN
**Status**: Applied

### Context
The feature already required eval and interactive runtime separation, but the daemon lifecycle boundary was only implicit in the requirements. Restarting `rp1 arcade` in one runtime must never stop, reuse, or assume ownership of daemon state that belongs to another runtime.

### Change Summary
This edit clarifies that cross-runtime isolation must explicitly cover restart, shutdown, PID lookup, port ownership, registry access, and recovery-state handling across eval and interactive contexts.
It strengthens the interpretation of `REQ-004`, `REQ-005`, `REQ-006`, and `REQ-007` so daemon interference is treated as a feature-level failure mode, not just an implementation detail.
It does not change prompt or command compatibility requirements; the change is stricter runtime ownership and lifecycle isolation within the existing command surface.

### Impact Analysis
- **Completed Tasks Affected**: None
- **In-Progress Tasks Affected**: None
- **New Tasks Required**: Not recorded because `tasks.md` is missing; implementation must explicitly verify restart/shutdown isolation, runtime-local PID and registry ownership, eval-only port ownership, and recovery-state scoping.

### Related Sections
- `REQ-004: Host Daemon Non-Interference`
- `REQ-005: Reuse Existing Docker Infrastructure`
- `REQ-006: Debuggable Containerized Evals`
- `REQ-007: Safe Cleanup`
- `6.2 Security Requirements`

---

## EDIT-002: Docker-First Scope Pivot

**Date**: 2026-04-11
**Type**: PIVOT
**Status**: Applied

### Context
The feature direction changed from a native runtime-context refactor to a tighter Docker-first delivery scope. The only required outcome is safe eval execution inside Docker using the repo's existing Docker infrastructure, with container isolation protecting the host rp1 daemon and interactive runtime.

### Change Summary
This edit rewrites the requirements around Dockerized eval execution, container-local runtime state, host-daemon non-interference, reuse of existing Docker tooling, and minimal host-side launch guards.
It explicitly removes broad runtime-context redesign, runtime-tagged persistence, and host-side storage or API ownership modeling from the required scope for this feature.
It preserves the requirement that evals continue to exercise real rp1 behavior and keep prompt or skill text reusable, but now treats Docker launch boundaries as the isolation mechanism.

### Impact Analysis
- **Completed Tasks Affected**: None
- **In-Progress Tasks Affected**: None
- **New Tasks Required**: Not recorded because `tasks.md` is missing; downstream implementation should focus on a Docker eval launcher, small harness changes for container-local runtime use, and only a minimal host-side guard if strictly necessary.

### Related Sections
- `4.1 In Scope`
- `4.2 Out of Scope`
- `REQ-001: Dockerized Eval Execution`
- `REQ-004: Host Daemon Non-Interference`
- `REQ-005: Reuse Existing Docker Infrastructure`

---

## Addendum

### ADD-001: Docker-Only Design Lock (added during design)
- **Source**: Design session feedback
- **Change**: The implementation design must not introduce a native `RuntimeContext`, runtime-ownership schema, or host-side runtime storage refactor. The supported outcome is only a Dockerized eval entry path built on the existing `rp1-dev` Docker flow, with eval DB, daemon, registry, settings, and temp state remaining container-local by default.
- **Rationale**: This keeps the feature aligned to the scope pivot and prevents design drift back into a broader host-native isolation project.

### ADD-002: Launcher Boundary Contract (added during docs pass)
- **Source**: Documentation alignment for completed implementation
- **Change**: `just eval-run` remains the public host entrypoint for supported eval execution, but it now Docker-wraps the run and delegates to `just eval-run-local` inside `rp1-dev`. Dockerization belongs only at that launcher boundary. The feature explicitly rejects re-expanding scope into host-native runtime-context work, runtime-tagged persistence changes, schema redesign, or broader daemon-ownership modeling.
- **Rationale**: This locks the delivered behavior to one shared command surface for authors while keeping isolation responsibility inside the existing Docker infrastructure rather than in prompt text or new runtime abstractions.
