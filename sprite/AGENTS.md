# sprite Agent Guide

This project is a Rust terminal client for ACP-based harness orchestration.

## Project Context

- Read `.rp1/context/charter.md` before changing product behavior.
- Read `.rp1/context/preferences.md` before changing tooling or dependency choices.
- Keep changes scoped to this repository.

## Engineering Defaults

- Use Rust 1.95.0 stable with Rust 2024 edition.
- Preserve the MSRV declared in `Cargo.toml` unless there is an explicit decision to raise it.
- Prefer small, testable library modules over putting logic in `main.rs`.
- Keep terminal UI state separate from ACP transport and process orchestration.
- ACP protocol payload paths must be absolute.
- Start with stdio transport support before adding other transports.

## Validation

Run these before handing off code changes when practical:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

## Commits

Use Conventional Commits, for example `feat(cli): add launch command`.

