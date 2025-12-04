# code-check

Fast code hygiene validation including linters, formatters, tests, and coverage measurement.

---

## Synopsis

=== "Claude Code"

    ```bash
    /code-check
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-check
    ```

## Description

The `code-check` command runs your project's standard code quality tools in sequence: formatting, linting, testing, and coverage measurement. It auto-detects your build system and runs the appropriate commands.

## Auto-Detection

| Build File | Format | Lint | Test | Coverage |
|------------|--------|------|------|----------|
| `package.json` | `npm run format` | `npm run lint` | `npm test` | `npm run coverage` |
| `Cargo.toml` | `cargo fmt` | `cargo clippy` | `cargo test` | `cargo tarpaulin` |
| `pyproject.toml` | `black . && isort .` | `flake8` | `pytest` | `pytest --cov` |
| `go.mod` | `go fmt ./...` | `golangci-lint` | `go test ./...` | `go test -cover` |

## Examples

### Run All Checks

=== "Claude Code"

    ```bash
    /code-check
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/code-check
    ```

**Example output:**
```
✅ Code Check Complete

Format: ✓ Clean
Lint: ✓ 0 warnings
Tests: ✓ 45/45 passing
Coverage: 87%

Summary: All checks passed
```

### With Issues

```
⚠️ Code Check Complete (with issues)

Format: ⚠️ 3 files reformatted
Lint: ⚠️ 2 warnings
Tests: ✓ 45/45 passing
Coverage: 87%

Summary: Format and lint issues detected
```

## Related Commands

- [`code-audit`](code-audit.md) - Deeper pattern analysis
- [`feature-build`](feature-build.md) - Build workflow runs checks automatically
