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
- crossterm 0.29.0
- agent-client-protocol 0.11.1
- Tokio 1.52.1 and tokio-util 0.7.18
- Cargo, clippy, rustfmt

## Commands

```bash
cargo test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo run -- --help
cargo run -- launch --workdir /absolute/project gh -- copilot -- --acp
```

## Current CLI

```bash
sprite --help
sprite --version
sprite status
sprite launch --workdir /absolute/project gh -- copilot -- --acp
```

`sprite launch` validates the configured ACP agent command, starts the MVP
terminal harness, connects to the child process over stdio, and keeps prompt,
transcript, status, and permission-decision state visible in the terminal.
The first `--` separates Sprite arguments from the child command arguments; the
second `--` is passed to GitHub CLI so `--acp` reaches Copilot.

## Manual MVP verification

Use GitHub CLI with the Copilot extension installed and authenticated outside
Sprite. The reference ACP server command for the MVP is `gh copilot --acp`; the
Sprite launch form is:

```bash
sprite launch --workdir /absolute/project gh -- copilot -- --acp
```

From source, run the same launch through Cargo:

```bash
cargo run -- launch --workdir /absolute/project gh -- copilot -- --acp
```

When Sprite reaches connected or ready state, submit a minimal prompt such as
`Say hello from the ACP server.` The transcript should show the submitted prompt
as user input, then the Copilot ACP response or a clear failure state in
arrival order. If Copilot asks for a permission decision, select an option or
cancel it in the harness; Sprite must not auto-approve the request.

For acceptance evidence, record the exact launch command, connected or failed
state, prompt submitted, observed response or failure, any permission request
and selected or cancelled outcome, and any server exit or error shown by the
harness. Do not claim broader ACP coverage or production readiness from this
MVP check.
