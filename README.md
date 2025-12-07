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
  <a href="https://github.com/rp1-run/rp1/releases"><img src="https://img.shields.io/static/v1?label=rp1-base&message=v6.0.0&color=blue" alt="rp1-base"></a>
  <a href="https://github.com/rp1-run/rp1/releases"><img src="https://img.shields.io/static/v1?label=rp1-dev&message=v6.0.0&color=blue" alt="rp1-dev"></a>
  <!-- x-release-please-end -->
  <a href="https://rp1.run"><img src="https://img.shields.io/badge/docs-rp1.run-blue" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" alt="License"></a>
</p>

<p align="center">
  Professional development workflows for AI coding assistants.<br>
  21 commands. 18 specialized agents. Single-pass execution.
</p>

---

## Quick Start

### Claude Code

```bash
/plugin marketplace add rp1-run/rp1
/plugin install rp1-base
/plugin install rp1-dev
```

### rp1 CLI (for OpenCode)

=== "macOS / Linux (Homebrew)"

```bash
brew install rp1-run/tap/rp1
```

=== "Windows (Scoop)"

```bash
scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket
scoop install rp1
```

=== "CI/CD (curl)"

```bash
curl -fsSL https://rp1.run/install.sh | sh
```

Then install plugins for OpenCode:
```bash
rp1 install:opencode
```

### First Run

```bash
/rp1-base:knowledge-build    # Generate your codebase knowledge base
```

**[Full documentation at rp1.run →](https://rp1.run)**

---

## What You Get

- **Feature Development**: Requirements → Design → Tasks → Build → Verify
- **Code Quality**: Investigations, audits, hygiene checks
- **PR Management**: Map-reduce reviews, visual diffs, feedback workflows
- **Knowledge Base**: Auto-generated architecture docs that inform every command

---

## Platform Support

| Platform | Status |
|----------|--------|
| [Claude Code](https://www.anthropic.com/claude-code) | Available |
| [OpenCode](https://opencode.ai) | Available |
| Cursor, Goose, Amp | Coming Soon |

---

## Contributing

See the [documentation](https://rp1.run) for architecture and guides. Issues and PRs welcome!

## License

Apache 2.0 - See [LICENSE](LICENSE)

---

<p align="center">
  <a href="https://rp1.run">Documentation</a> ·
  <a href="https://github.com/rp1-run/rp1/issues">Issues</a> ·
  <a href="https://github.com/rp1-run/rp1/releases">Releases</a>
</p>
