# Claude Guidance

Follow `AGENTS.md` for project-specific instructions.

Key constraints:

- Rust 1.95.0 stable, Rust 2024 edition, MSRV 1.86.
- Native binary built with Cargo.
- Terminal UI: Ratatui 0.30.0.
- ACP integration: official `agent-client-protocol` crate 0.11.1.
- Tests: `cargo test`, with `assert_cmd` and `predicates` for CLI integration tests.

