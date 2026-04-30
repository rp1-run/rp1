# Project Preferences
**Generated**: 2026-04-30 18:08:20 AEST | **Status**: Complete

## Technology Stack

- Language: Rust 1.95.0 stable
- Edition: Rust 2024
- MSRV: Rust 1.86
- Runtime: native binary
- Terminal UI: Ratatui 0.30.0
- Terminal events: crossterm 0.29.0
- ACP SDK: official `agent-client-protocol` 0.11.1
- Async/process runtime: Tokio 1.52.1 with `io-util`, `process`, `rt`,
  `sync`, and `time`
- Tokio compatibility: `tokio-util` 0.7.18 with `compat`
- Package manager/build: Cargo
- Testing: `cargo test`, Ratatui `TestBackend`, `assert_cmd` 2.2.1,
  `predicates` 3.1.4
- Linting: clippy
- Formatting: rustfmt

## Rationale

sprite is a terminal-based ACP client and harness orchestration boundary. Rust
fits the native CLI/runtime requirements, Ratatui provides the terminal UI
foundation, and the official ACP SDK keeps protocol integration aligned with
the upstream Agent Client Protocol ecosystem. Tokio and `tokio-util` provide
the child-process stdio runtime and compatibility adapters needed for ACP
`ByteStreams`, while crossterm provides terminal input and screen control.
Cargo, clippy, rustfmt, Ratatui `TestBackend`, `assert_cmd`, and `predicates`
provide a conventional Rust validation loop without adding snapshot or
property-testing dependencies before v1 needs them.

## Commands

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo build --release
cargo run -- launch --workdir /absolute/project gh -- copilot -- --acp
```

## Research Notes

- Rust 2024 stabilized in Rust 1.85.0, and the selected toolchain is Rust 1.95.0 stable.
- Ratatui 0.30.0 requires Rust 1.86, so `Cargo.toml` declares `rust-version = "1.86"`.
- ACP transport uses child stdin/stdout through `agent-client-protocol::ByteStreams`; diagnostics exposed to users should stay bounded and redacted.
- ACP protocol payload paths should be absolute.
- MVP reference verification uses GitHub Copilot ACP through `gh copilot --acp`; GitHub CLI and Copilot authentication remain outside Sprite.
- The confirmed launch form is `sprite launch --workdir /absolute/project gh -- copilot -- --acp`.
- CLI integration tests live under `tests/` and use `assert_cmd::Command::cargo_bin("sprite")` with `predicates`.
