<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-light.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo-dark.svg" alt="rp1" width="320">
  </picture>
</p>

<h1 align="center">Ready Player One</h1>

<p align="center">
  <strong>> stop prompting; start shipping</strong>
</p>

<p align="center">
  <!-- x-release-please-start-version -->
  <a href="https://github.com/rp1-run/rp1/releases"><img src="https://img.shields.io/static/v1?label=rp1-base&message=v0.6.5&color=blue" alt="rp1-base"></a>
  <a href="https://github.com/rp1-run/rp1/releases"><img src="https://img.shields.io/static/v1?label=rp1-dev&message=v0.6.5&color=blue" alt="rp1-dev"></a>
  <!-- x-release-please-end -->
  <a href="https://rp1.run"><img src="https://img.shields.io/badge/docs-rp1.run-blue" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" alt="License"></a>
</p>

<p align="center">
  Professional development workflows for AI coding assistants.<br>
  39 commands. 49 specialized agents. Single-pass execution.<br>
  Works today with <strong>Claude Code</strong>. Experimental support for <strong>OpenCode</strong> and <strong>Codex CLI</strong>.
</p>

---

## Why rp1?

**Single-pass execution** — Constitutional prompts encode expert patterns with built-in rules. No iteration loops, no "let me revise that" — tasks complete in one shot.

**Codebase awareness** — Run `knowledge-build` once. Your architecture becomes context for every command. No generic advice — everything respects your patterns.

**Lean context architecture** — Progressive disclosure and subagent delegation keep your main thread focused. Complex work happens in specialized agents, results flow back clean.

**Validate before you build** — Hypothesis testing catches bad assumptions early. Design decisions get validated against your codebase before implementation begins.

**Start anywhere** — Full blueprints with charters and PRDs, or jump straight in with a vague idea. Structured when you need it, flexible when you don't.

---

## Quick Start

### 1. Install the CLI

```bash
# macOS / Linux (Homebrew)
brew install rp1-run/tap/rp1
rp1 install

# Windows (Scoop)
scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
scoop install rp1
rp1 install

# Or use the install script
curl -fsSL https://rp1.run/install.sh | sh
```

Homebrew and Scoop install the rp1 CLI binary. Run `rp1 install` next to install integrations into detected host tools, then run `rp1 verify` to confirm the installation. The standalone install script already attempts the `rp1 install` step automatically.

### 2. Initialize your project

```bash
cd your-project
rp1 init
```

This will set up rp1 and install plugins for your AI assistant (Claude Code, OpenCode, or Codex CLI).

### 3. Restart your AI tool and run

```bash
/knowledge-build    # Generate your codebase knowledge base
```

**[Full installation guide →](https://rp1.run/getting-started/installation/)**

---

## Beta Releases

Want to try upcoming features before they're officially released?

### Install Beta

```bash
brew install rp1-run/tap/rp1-beta
rp1 install
```

> **Note:** You cannot have both stable and beta installed simultaneously. Installing one requires uninstalling the other first.

### Verify

```bash
rp1 --version
# Should show a pre-release version like 0.7.0-beta.1
```

### Rollback to Stable

```bash
brew uninstall rp1-beta && brew install rp1-run/tap/rp1
rp1 install
```

---

## What Can You Do?

### Ship a feature

```bash
/build user-auth
```

### Review a PR

```bash
/pr-review "feature/auth"
```

### Investigate a bug

```bash
/code-investigate "bug-123" "Login fails intermittently"
```

### Quick code check

```bash
/code-check
```

**[See all 39 commands →](https://rp1.run/reference/)**

---

## Principles

| | |
|---|---|
| **Batteries Included** | Skills, subagents, and finely-tuned prompts ship out of the box. No assembly required. |
| **Always Open Source** | Fully pluggable into existing agentic tools. Your workflows, your control. |
| **Visual-First** | Heavily leans on visual language — diagrams, charts, and structured outputs for clarity. |
| **Continuous Evolution** | Keep improving and adapting as frontier models mature. Today's best, tomorrow's baseline. |
| **Model/Tool Agnostic** | No lock-in to any frontier lab or platform. Works with Claude Code, OpenCode, Codex CLI, and more coming. |

---

## Platform Support

| Platform | Status |
|----------|--------|
| [Claude Code](https://claude.ai/code) | Available |
| [OpenCode](https://opencode.ai) | Experimental |
| [Codex CLI](https://github.com/openai/codex) | Experimental |
| Cursor, Goose, Amp | Coming Soon |

---

## Guides

- **[Feature Development](https://rp1.run/guides/feature-development/)** — End-to-end workflow from requirements to verified implementation
- **[Bug Investigation](https://rp1.run/guides/bug-investigation/)** — Systematic root cause analysis with evidence-based hypothesis testing
- **[PR Review](https://rp1.run/guides/pr-review/)** — Thorough multi-pass analysis with visual diagrams
- **[Team Onboarding](https://rp1.run/guides/team-onboarding/)** — Get new developers productive on your codebase fast

---

## Contributing

See the [documentation](https://rp1.run) for architecture and contribution guides. Issues and PRs welcome!

## License

Apache 2.0 — See [LICENSE](LICENSE)

---

<p align="center">
  <a href="https://rp1.run">Documentation</a> ·
  <a href="https://github.com/rp1-run/rp1/issues">Issues</a> ·
  <a href="https://github.com/rp1-run/rp1/releases">Releases</a>
</p>

<p align="center">
  <a href="https://github.com/rp1-run/rp1"><img src="https://img.shields.io/github/stars/rp1-run/rp1?style=social" alt="GitHub stars"></a>
</p>
