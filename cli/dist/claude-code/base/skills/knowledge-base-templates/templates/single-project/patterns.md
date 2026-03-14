# Implementation Patterns

**Project**: [Project Name]
**Last Updated**: [Date]

## Naming & Organization

**Files**: [file naming pattern]
**Functions**: [function naming pattern]
**Imports**: [import organization pattern]

Evidence: [file paths]

## Type & Data Modeling

**Data Representation**: [dataclass/Pydantic/TypedDict/struct pattern]
**Type Strictness**: [strict/gradual/untyped]
**Immutability**: [frozen/mutable patterns]

Evidence: [file paths with line ranges]

## Error Handling

**Strategy**: [exceptions/Result types/error codes]
**Propagation**: [raise early/catch at boundary/bubble up]
**Common Types**: [list of custom exception types if any]

Evidence: [file paths]

## Validation & Boundaries

**Location**: [API boundary/domain layer/everywhere]
**Method**: [Pydantic/manual/schema validation]
**Normalization**: [input sanitization patterns]

Evidence: [file paths]

## Observability

**Logging**: [framework and format]
**Metrics**: [metrics framework or None detected]
**Tracing**: [tracing framework or None detected]

Evidence: [file paths]

## Testing Idioms

**Organization**: [tests/ mirrors src/colocated/mixed]
**Fixtures**: [pytest/factory patterns/test builders]
**Levels**: [unit/integration/E2E distribution]

Evidence: [file paths]

<!-- Conditional sections below - include only if detected -->

## I/O & Integration

**Database**: [ORM/raw SQL/repository pattern]
**HTTP Clients**: [retry strategy/timeout handling]
**Resilience**: [circuit breaker/fallback patterns]

Evidence: [file paths]

## Concurrency & Async

**Async Usage**: [async handlers/async DB/sync-only]
**Parallelism**: [asyncio.gather/thread pools/multiprocessing]
**Safety**: [no shared state/locks/atomic operations]

Evidence: [file paths]

## Dependency & Configuration

**DI Pattern**: [constructor injection/container/manual wiring]
**Config Loading**: [env vars/config files/secret management]
**Initialization**: [lazy/eager patterns]

Evidence: [file paths]

## Extension Mechanisms

**Plugin Pattern**: [registry/decorator/class inheritance]
**Hook System**: [event emitters/callbacks/middleware]

Evidence: [file paths]
