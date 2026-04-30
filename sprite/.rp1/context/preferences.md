# Project Preferences
**Generated**: 2026-04-30 18:08:20 AEST | **Status**: Complete

## Technology Stack

- Language: Rust 1.95.0 stable
- Edition: Rust 2024
- MSRV: Rust 1.86
- Runtime: native binary
- Terminal UI: Ratatui 0.30.0
- ACP SDK: official `agent-client-protocol` 0.11.1
- Package manager/build: Cargo
- Testing: `cargo test`, `assert_cmd` 2.2.1, `predicates` 3.1.4
- Linting: clippy
- Formatting: rustfmt

## Rationale

sprite is a terminal-based ACP client and harness orchestration boundary. Rust
fits the native CLI/runtime requirements, Ratatui provides the terminal UI
foundation, and the official ACP SDK keeps protocol integration aligned with
the upstream Agent Client Protocol ecosystem. Cargo, clippy, rustfmt,
`assert_cmd`, and `predicates` provide a conventional Rust validation loop
without adding snapshot or property-testing dependencies before v1 needs them.

## Commands

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo build --release
```

## Research Notes

- Rust 2024 stabilized in Rust 1.85.0, and the selected toolchain is Rust 1.95.0 stable.
- Ratatui 0.30.0 requires Rust 1.86, so `Cargo.toml` declares `rust-version = "1.86"`.
- ACP stdio transport should keep stdout reserved for protocol messages and use stderr for diagnostics once real transport wiring is added.
- ACP protocol payload paths should be absolute.
- CLI integration tests live under `tests/` and use `assert_cmd::Command::cargo_bin("sprite")` with `predicates`.
