# sprite

sprite is a terminal-based ACP client and orchestration boundary for agentic
coding harnesses. It is intended to let rp1 users launch supported harnesses,
run workflows end to end, and receive reliable lifecycle and progress state
without host-specific hook wiring.

## Stack

- Rust 1.95.0 stable
- Rust 2024 edition
- MSRV: Rust 1.86
- Ratatui 0.30.0
- agent-client-protocol 0.11.1
- Cargo, clippy, rustfmt

## Commands

```bash
cargo test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo run -- --help
```

## Current CLI

```bash
sprite --help
sprite --version
sprite status
sprite launch --workdir /absolute/path codex -- --model gpt-5
```

The initial `launch` command validates and prepares an ACP launch request. The
transport and harness lifecycle implementation should build on `src/acp.rs`
without moving protocol-specific details into the UI layer.

