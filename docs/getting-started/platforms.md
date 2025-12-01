# Platform Comparison

rp1 supports two AI coding assistant platforms: **Claude Code** and **OpenCode**. This page helps you choose the right platform for your needs.

---

## Quick Comparison

| Feature | Claude Code | OpenCode |
|---------|-------------|----------|
| **Provider** | Anthropic | Community |
| **LLM** | Claude | Configurable |
| **Command Syntax** | `/rp1-base:command` | `/rp1-base/command` |
| **Installation** | Plugin marketplace | Python wheel |
| **All 21 commands** | :material-check: Yes | :material-check: Yes |
| **Automatic updates** | :material-check: Yes | Manual |
| **Open source** | :material-close: No | :material-check: Yes |

---

## Feature Parity

Both platforms support the **full rp1 command set**:

### Base Plugin (6 commands)

| Command | Claude Code | OpenCode |
|---------|:-----------:|:--------:|
| knowledge-build | :material-check: | :material-check: |
| knowledge-load | :material-check: | :material-check: |
| project-birds-eye-view | :material-check: | :material-check: |
| strategize | :material-check: | :material-check: |
| write-content | :material-check: | :material-check: |
| analyse-security | :material-check: | :material-check: |

### Dev Plugin (15 commands)

| Command | Claude Code | OpenCode |
|---------|:-----------:|:--------:|
| blueprint | :material-check: | :material-check: |
| feature-requirements | :material-check: | :material-check: |
| feature-design | :material-check: | :material-check: |
| feature-tasks | :material-check: | :material-check: |
| feature-build | :material-check: | :material-check: |
| feature-verify | :material-check: | :material-check: |
| feature-edit | :material-check: | :material-check: |
| feature-archive | :material-check: | :material-check: |
| feature-unarchive | :material-check: | :material-check: |
| validate-hypothesis | :material-check: | :material-check: |
| code-check | :material-check: | :material-check: |
| code-audit | :material-check: | :material-check: |
| code-investigate | :material-check: | :material-check: |
| code-clean-comments | :material-check: | :material-check: |
| code-quick-build | :material-check: | :material-check: |
| pr-review | :material-check: | :material-check: |
| pr-visual | :material-check: | :material-check: |
| pr-feedback-collect | :material-check: | :material-check: |
| pr-feedback-fix | :material-check: | :material-check: |

---

## Syntax Differences

The main difference between platforms is the command separator:

=== "Claude Code"

    Uses `:` as the separator:
    ```bash
    /rp1-base:knowledge-build
    /rp1-dev:feature-requirements my-feature
    /rp1-dev:pr-review
    ```

=== "OpenCode"

    Uses `/` as the separator:
    ```bash
    /rp1-base/knowledge-build
    /rp1-dev/feature-requirements my-feature
    /rp1-dev/pr-review
    ```

!!! tip "Documentation Conventions"
    Throughout this documentation, examples are shown with tabs for both platforms. The command functionality is identical; only the syntax differs.

---

## Choose Claude Code If...

<div class="grid cards" markdown>

-   :material-check-circle:{ .lg .middle } **You want the simplest setup**

    ---

    Plugin marketplace installation with automatic updates. Just add the marketplace and install.

-   :material-check-circle:{ .lg .middle } **You're already using Claude Code**

    ---

    Native integration means zero additional setup if Claude Code is your primary AI assistant.

-   :material-check-circle:{ .lg .middle } **You prefer managed solutions**

    ---

    Anthropic maintains Claude Code, providing a polished, supported experience.

-   :material-check-circle:{ .lg .middle } **You want Claude specifically**

    ---

    Claude Code uses Claude models exclusively, which rp1 was originally designed for.

</div>

---

## Choose OpenCode If...

<div class="grid cards" markdown>

-   :material-check-circle:{ .lg .middle } **You want vendor independence**

    ---

    OpenCode is open source and supports multiple LLM providers.

-   :material-check-circle:{ .lg .middle } **You need flexibility**

    ---

    Configure your preferred LLM backend, API endpoints, and settings.

-   :material-check-circle:{ .lg .middle } **You prefer open source tools**

    ---

    Full visibility into how your AI assistant works.

-   :material-check-circle:{ .lg .middle } **Enterprise requirements**

    ---

    Self-hosted options and custom configurations for organizational needs.

</div>

---

## Installation Comparison

### Claude Code

```bash
# Add marketplace (one-time)
/plugin marketplace add rp1-run/rp1

# Install plugins
/plugin install rp1-base
/plugin install rp1-dev

# Restart Claude Code
```

**Time**: ~2 minutes

### OpenCode

```bash
# Install uv (if needed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Run installer
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash

# Restart OpenCode
```

**Time**: ~5 minutes

---

## Switching Platforms

rp1 stores its data in `.rp1/` within your project directory. This data is **platform-independent**, meaning:

- Knowledge bases work on both platforms
- Feature documents are portable
- No migration needed when switching

If you switch platforms, simply install rp1 on the new platform and continue where you left off.

---

## Next Steps

Ready to install?

- [:octicons-arrow-right-24: Claude Code Installation](claude-code.md)
- [:octicons-arrow-right-24: OpenCode Installation](opencode.md)
