# Implementation Patterns

**Project**: rp1-eval-project

## Naming

**Files**: kebab-case TypeScript modules
**Functions**: camelCase
**Types**: PascalCase

## Error Handling

Simple try/catch with descriptive error messages. No external error handling libraries.

## Testing

Bun's built-in test runner with `describe`/`test`/`expect` pattern. Tests co-located with source as `*.test.ts`.

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- No external dependencies beyond Bun built-ins
