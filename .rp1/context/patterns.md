# Implementation Patterns

**Repository**: rp1
**Current Project**: `.`
**Last Updated**: 2026-03-15

## Naming and Organization

**Files**: Source-of-truth workflows live in `plugins/*/skills/*/SKILL.md` and `plugins/*/agents/*.md`; generated artifacts stay under `cli/dist/`.
**Functions**: CLI/runtime code uses descriptive camelCase verbs such as `installRp1`, `executeUpdate`, and `buildDependencyGraph`.
**Imports**: Keep host- or runtime-heavy imports behind focused modules and lazy-load at command boundaries when possible.

Evidence: `plugins/base/skills/knowledge-build/SKILL.md`, `plugins/dev/skills/build/SKILL.md`, `cli/src/main.ts`

## Type and Data Modeling

**Data Representation**: TypeScript models plus structured JSON contracts for skills, state, and generated artifacts.
**Type Strictness**: Strongly typed; explicit schemas and typed command/runtime boundaries are preferred.
**Immutability**: Favor transformation pipelines and return new values instead of mutating shared state.

Evidence: `cli/src/build/`, `cli/src/agent-tools/`, `cli/src/config/supported-tools.yaml`

## Error Handling

**Strategy**: Prefer typed boundary errors and result-oriented flows over deep exception-led control flow.
**Propagation**: Validate early, normalize at command boundaries, and fail before writing published artifacts.
**Common Types**: Command and build paths center failures around explicit CLI/runtime validation.

Evidence: `cli/src/main.ts`, `cli/src/build/command.ts`, `cli/src/agent-tools/work/index.ts`

## Validation and Boundaries

**Location**: At skill metadata, parser, build, install, and workflow-state boundaries.
**Method**: Parse, lint, and validate prompts or diagrams before publishing or executing them.
**Normalization**: Resolve `RP1_ROOT`, namespace conventions, and step IDs into canonical forms.

Evidence: `docs/concepts/skill-format.md`, `docs/concepts/state-machines.md`, `plugins/base/skills/knowledge-build/SKILL.md`

## Observability

**Logging**: Runtime state is captured through agent-tools event and work records rather than ad hoc console output.
**Metrics**: Repository-level metrics are lightweight and usually derived from persisted run data or KB metadata.
**Tracing**: No general distributed tracing layer is evident; the local event store is the main audit trail.

Evidence: `cli/src/agent-tools/emit/`, `cli/src/agent-tools/work/`, `cli/web-ui/src/server/routes/v2-api.ts`

## Testing Idioms

**Organization**: Tests mirror source areas under `cli/src/__tests__/` and `cli/web-ui/src/__tests__/`.
**Fixtures**: Prefer isolated fixtures, temp directories, and golden outputs for build/render validation.
**Levels**: Strong unit coverage with focused integration tests around install, build, emit, and workflow behavior.

Evidence: `cli/src/__tests__/build/`, `cli/src/__tests__/install/`, `cli/web-ui/src/__tests__/`

## I/O and Integration

**Database**: Local SQLite stores workflow events, annotations, artifacts, and legacy work status.
**HTTP Clients**: External integrations are explicit and narrow, especially around GitHub workflows.
**Resilience**: Replay, recovery, and staged install/build flows reduce partial-state failures.

Evidence: `cli/src/agent-tools/emit/database.ts`, `cli/web-ui/src/server/`, `cli/src/install/installer.ts`

## Concurrency and Async

**Async Usage**: Asynchronous behavior is concentrated in server handlers, file I/O, installation, and workflow orchestration.
**Parallelism**: Large workflows use map-reduce style fan-out and gather patterns for specialist analysis.
**Safety**: Persist shared state through the local databases and validate transitions rather than relying on shared in-memory mutation.

Evidence: `plugins/base/skills/knowledge-build/SKILL.md`, `cli/web-ui/src/server/websocket.ts`, `cli/src/install/installer.ts`

## Dependency and Configuration

**DI Pattern**: Mostly manual wiring through focused entrypoints and runtime helpers.
**Config Loading**: Mix of local files, package metadata, supported-tool registries, and environment variables such as `GITHUB_TOKEN`.
**Initialization**: Favor lazy initialization for expensive services and daemon-only modules.

Evidence: `cli/src/main.ts`, `cli/src/config/supported-tools.yaml`, `cli/web-ui/src/daemon/`

## Extension Mechanisms

**Plugin Pattern**: Namespaced plugin directories plus build-time transforms let the same markdown source target multiple host platforms.
**Hook System**: Semantic tags, registries, and build filters extend prompt behavior without rewriting source assets per platform.

Evidence: `plugins/base/`, `plugins/dev/`, `plugins/utils/`, `cli/src/build/filters/`
