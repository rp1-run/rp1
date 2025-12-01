---
hide:
  - navigation
  - toc
---

# Stop prompting. **Start shipping.**

Professional development workflows for AI coding assistants.
21 commands. 18 specialized agents. Single-pass execution.

[Get Started](getting-started/quickstart.md){ .md-button .md-button--primary }
[View on GitHub](https://github.com/rp1-run/rp1){ .md-button }

---

## Try it out

<div class="grid" markdown>

<div markdown>

**Ship a feature**

```bash
/rp1-dev:feature-requirements "user-auth"
/rp1-dev:feature-design "user-auth"
/rp1-dev:feature-build "user-auth"
```

**Review a PR**

```bash
/rp1-dev:pr-review "feature/auth"
```

**Investigate a bug**

```bash
/rp1-dev:code-investigate "bug-123" "Login fails"
```

</div>

<div markdown>

**Generate knowledge base**

```bash
/rp1-base:knowledge-build
```

**Quick code check**

```bash
/rp1-dev:code-check
```

**Strategic analysis**

```bash
/rp1-base:strategize
```

[See all 21 commands :material-arrow-right:](reference/index.md)

</div>

</div>

---

## Commands by workflow

<div class="grid cols-3" markdown>

<div markdown>

**Planning**

- [blueprint](reference/dev/blueprint.md) - Project vision wizard
- [feature-requirements](reference/dev/feature-requirements.md) - Gather specifications
- [feature-design](reference/dev/feature-design.md) - Technical architecture
- [feature-tasks](reference/dev/feature-tasks.md) - Break down work

</div>

<div markdown>

**Implementation**

- [feature-build](reference/dev/feature-build.md) - Systematic development
- [feature-verify](reference/dev/feature-verify.md) - Acceptance validation
- [code-check](reference/dev/code-check.md) - Fast hygiene checks
- [code-audit](reference/dev/code-audit.md) - Pattern consistency

</div>

<div markdown>

**Review & Analysis**

- [pr-review](reference/dev/pr-review.md) - Map-reduce code review
- [pr-visual](reference/dev/pr-visual.md) - Diagram PR changes
- [code-investigate](reference/dev/code-investigate.md) - Bug root cause
- [strategize](reference/base/strategize.md) - Holistic recommendations

</div>

</div>

---

## Platform support

<div class="grid" markdown>

<div markdown>

![Claude Code](assets/brands/claude.png){ width="24" } **Claude Code**

```bash
/plugin marketplace add rp1-run/rp1
/plugin install rp1-base
/plugin install rp1-dev
```

[Claude Code setup :material-arrow-right:](getting-started/claude-code.md)

</div>

<div markdown>

![OpenCode](assets/brands/opencode.png){ width="24" } **OpenCode**

```bash
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

[OpenCode setup :material-arrow-right:](getting-started/opencode.md)

</div>

</div>

**Coming soon:** Cursor, Goose, Amp

---

## Why rp1?

<div class="grid" markdown>

<div markdown>

**Single-pass execution**

Constitutional prompts encode expert patterns with built-in rules. No iteration loops, no "let me revise that" — tasks complete in one shot.

[Learn about constitutional prompting :material-arrow-right:](concepts/constitutional-prompting.md)

</div>

<div markdown>

**Codebase awareness**

Run `knowledge-build` once. Your architecture becomes context for every command. No generic advice — everything respects your patterns.

[Learn about knowledge-aware agents :material-arrow-right:](concepts/knowledge-aware-agents.md)

</div>

</div>

---

<div align="center" markdown>

[Get Started](getting-started/quickstart.md){ .md-button .md-button--primary }

[![GitHub stars](https://img.shields.io/github/stars/rp1-run/rp1?style=social)](https://github.com/rp1-run/rp1)

</div>
