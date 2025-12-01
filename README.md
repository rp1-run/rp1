# rp1

> Ready Player 1

```
                    ░████
░██░████ ░████████    ░██
░███     ░██    ░██   ░██
░██      ░██    ░██   ░██
░██      ░███   ░██   ░██
░██      ░██░█████  ░██████
         ░██
         ░██
```

> **Stop prompting. Start shipping.**

<!-- x-release-please-start-version -->
[![rp1-base](https://img.shields.io/static/v1?label=rp1-base&message=v4.2.3&color=blue)](https://github.com/rp1-run/rp1/releases)
[![rp1-dev](https://img.shields.io/static/v1?label=rp1-dev&message=v4.2.3&color=blue)](https://github.com/rp1-run/rp1/releases)
<!-- x-release-please-end -->
[![Docs](https://img.shields.io/badge/docs-rp1.run-blue)](https://rp1.run)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

Professional development workflows for AI coding assistants. No iteration loops. No guesswork. Just battle-tested patterns that execute flawlessly.

---

## Platform Support

**Currently Available:**

- [Claude Code](https://www.claude.com/product/claude-code)
- [OpenCode](https://opencode.ai) (Beta)

**Coming Soon:** Cursor, Goose, Amp

---

## The Problem

AI coding assistants are powerful, but ad-hoc prompting leads to:

- ♾️ Endless refinement loops ("let me revise that...")
- 🎯 Inconsistent results from similar prompts
- 🏗️ Generic advice that ignores your architecture
- ⏰ Time spent crafting the perfect prompt

## The Solution

**rp1** provides 21 (and counting) pre-engineered commands backed by 13 specialized agents that understand your codebase and execute complete workflows in a single pass.

```bash
# Instead of this conversation:
You: "Review this PR for security issues"
AI: "I see some issues. Would you like me to check more?"
You: "Yes, and check performance too"
AI: "Let me revise my review..."
# ... 5 more messages ...

# You get this:
/rp1-dev:pr-review "feature/user-auth"
# → Complete security, performance, and architecture review
# → Consistent with your codebase patterns
# → Done in one shot
```

---

## Quick Start

### Claude Code

Use Claude Code's native plugin system:

```bash
# Install the marketplace
/plugin marketplace add rp1-run/rp1

# Install plugins
/plugin install rp1-base
/plugin install rp1-dev

# ⏺️ Restart Claude Code
# commands should be visible when typing /
```

### OpenCode

```bash
# First, install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Then install rp1
curl -fsSL https://raw.githubusercontent.com/rp1-run/rp1/main/scripts/install-for-opencode.sh | bash
```

### First Run (Both Platforms)

```bash
# 🎯 Generate your knowledge base
# Claude Code
/rp1-base:knowledge-build

# Open Code
/rp1-base/knowledge-build


# First run can take 10 minutes, depending on your repo; subsequent runs are incremental (2-5 minutes)
```

See [Platform Comparison](docs/opencode/comparison.md) for detailed command usage differences.

### Your First Workflow

```bash
# Planning a new feature?
# Claude Code:
/rp1-dev:feature-requirements "my-awesome-feature"

# OpenCode:
/rp1-dev/feature-requirements my-awesome-feature"

# Need a quick visual overview of a PR?
# Claude Code: /rp1-dev:pr-visual "feature/my-branch"
# OpenCode:    /rp1-dev/pr-visual "feature/my-branch"

# Need a detailed code review?
# Claude Code: /rp1-dev:pr-review "feature/my-branch"
# OpenCode:  /rp1-dev/pr-review "feature/my-branch"

# Hunting a bug?
# Claude Code: /rp1-dev:code-investigate "issue-123" "Login fails"
# OpenCode: /rp1-dev/code-investigate "issue-123 'Login fails'"
```

---

## What Makes rp1 Different?

### 🎯 Constitutional Prompts

Traditional AI workflows require constant back-and-forth. rp1's prompts have built-in execution rules, structured workflows, and anti-loop directives. Result: **single-pass execution** with professional output.

### 🧠 Knowledge-Aware Agents

7 agents automatically load your codebase architecture before analysis. This means:

- **Bug investigations** understand system design
- **Code reviews** validate architectural consistency
- **Security scans** consider your threat model
- **Refactoring suggestions** respect established patterns

No generic advice. Everything is contextual.

### 📦 Complete Dev Lifecycle Coverage

```
Requirements → Design → Implementation → Testing → Review → Deploy
     ↓            ↓           ↓            ↓        ↓        ↓
  feature-   feature-    feature-      code-    pr-      analyse-
requirements  design      build        check   review   security
```

Every stage has specialized commands optimized for that phase.

---

## Key Commands

### 🏗️ Feature Development

| Command | What it does |
|---------|-------------|
| `/rp1-dev:feature-requirements "feature-id"` | Interactive requirements gathering |
| `/rp1-dev:feature-design "feature-id"` | Technical design with architecture diagrams |
| `/rp1-dev:feature-tasks "feature-id"` | Actionable implementation tasks |
| `/rp1-dev:feature-build "feature-id"` | Systematic implementation + tests |
| `/rp1-dev:feature-verify "feature-id"` | Acceptance criteria validation |

### 🔍 Code Quality

| Command | What it does |
|---------|-------------|
| `/rp1-dev:code-check` | Lints, formatters, tests, coverage |
| `/rp1-dev:code-investigate "issue-id" "description"` | Bug root cause analysis |
| `/rp1-dev:code-audit` | Pattern consistency check |

### 🚀 PR & Deployment

| Command | What it does |
|---------|-------------|
| `/rp1-dev:pr-review "branch/PR#"` | Architecture-aware code review |
| `/rp1-dev:pr-visual "branch/PR#"` | 🎨 Visualize PR changes with diagrams + HTML preview |
| `/rp1-dev:pr-feedback-collect "PR#"` | Gather GitHub review comments |
| `/rp1-dev:pr-feedback-fix` | Systematically address feedback |
| `/rp1-base:analyse-security` | Security validation & scanning |

### 📚 Knowledge & Docs

| Command | What it does |
|---------|-------------|
| `/rp1-base:knowledge-build` | Generate codebase architecture docs |
| `/rp1-base:project-birds-eye-view` | Project overview for new devs |
| `/rp1-base:strategize` | Holistic optimization recommendations |

[**See all 21 commands →**](EXAMPLES.md)

---

## Example Workflows

**Shipping a new feature:**

```bash
/rp1-dev:feature-requirements "user-authentication"  # Gather what you need to build
/rp1-dev:feature-design "user-authentication"        # Design it with diagrams
/rp1-dev:feature-tasks "user-authentication"         # Break it down into tasks
/rp1-dev:feature-build "user-authentication"         # Implement with tests
/rp1-dev:feature-verify "user-authentication"        # Validate acceptance criteria
/rp1-dev:pr-review "feature/user-auth"               # Review before merge
```

**Debugging production:**

```bash
/rp1-dev:code-investigate "prod-bug-500" "API returns 500 on user login"
                                # → Root cause with architecture context
                                # → Understands your system design
                                # → Hypothesis testing
                                # → No code changes, just investigation
```

**Onboarding a new developer:**

```bash
/rp1-base:knowledge-build       # Generate architecture docs
/rp1-base:project-birds-eye-view # Create newcomer guide
                                 # → Overview + diagrams
                                 # → Key concepts
                                 # → Where to start
```

**Visualizing PR changes:**

```bash
/rp1-dev:pr-visual "feature/user-auth"  # Transform PR into interactive diagrams
                                        # → Component relationship diagrams
                                        # → Data flow visualizations
                                        # → Auto-opens HTML preview in browser
                                        # → Architecture-aware with KB context
```

[**More examples and workflows →**](EXAMPLES.md)

---

## How It Works

### Two-Plugin Architecture

**rp1-base** (6 commands)
Core knowledge, documentation, strategy, and security. No dependencies.

**rp1-dev** (15 commands)
Feature development, code quality, and PR management. Requires rp1-base.

### Command → Agent Pattern

Commands are lightweight entry points. Agents are specialized sub-processes with deep expertise:

```
/rp1-dev:code-investigate "bug-123" "API timeout on large requests"
    ↓
 bug-investigator agent
    ↓
 • Loads codebase architecture
 • Analyzes error patterns
 • Tests hypotheses
 • Documents findings
 • No loops, executes once
```

### Knowledge Base System

Run `/rp1-base:knowledge-build` once to generate `.rp1/context/`:

- `architecture.md` - System patterns
- `concept_map.md` - Domain terminology
- `modules.md` - Component breakdown
- `index.md` - Project overview

7 agents automatically load this before analysis, ensuring every recommendation is architecturally consistent.

#### File System

<details>
<summary><b>📁 Where are files stored?</b></summary>

### Default Location

By default, rp1 stores generated files in `.rp1/` at your project root:

```
your-project/
├── .rp1/
│   ├── context/              # Knowledge base files
│   │   ├── index.md
│   │   ├── architecture.md
│   │   ├── concept_map.md
│   │   ├── modules.md
│   │   └── state.json
│   └── work/                 # Command artifacts
│       ├── feature-*/        # Feature development files
│       ├── code_check_report_*.md
│       └── feature_verify_report_*.md
```

### Customizing the Location

Set the `RP1_ROOT` environment variable to store files anywhere:

```bash
# Store in Google Drive (synced across devices)
export RP1_ROOT="$HOME/Google Drive/My Drive/rp1/my-project"

# Store in a different location
export RP1_ROOT="$HOME/Documents/rp1-data/my-project"
```

### Version Control Recommendations

**Option 1: Exclude from version control** (recommended for solo/small teams)

Add to your global `.gitignore`:

```bash
# Add to ~/.gitignore_global
.rp1/
```

Or project-specific `.gitignore`:

```bash
echo ".rp1/" >> .gitignore
```

**Option 2: Share knowledge base with team** (recommended for larger teams)

```bash
# In .gitignore - share KB but exclude work files
.rp1/work/
```

This way the knowledge base is available to all team members, but individual development artifacts are kept private.

</details>

---

## Installation

See the [Quick Start](#quick-start) section above.

### Running Without Permission Prompts (Claude Code)

By default, Claude Code asks for permission before executing certain operations. If you're working in a trusted environment and want uninterrupted execution, you can start Claude Code with elevated permissions:

```bash
claude --dangerously-skip-permissions
```

> [!WARNING]
> **Use with caution!** This flag disables permission prompts, allowing commands to execute file operations, run shell commands, and make changes without your explicit approval. Only use this in:
>
> - Projects you fully trust (your own codebase)
> - When you understand what the commands will do
>
> **Never use this flag when:**
>
> - Working with untrusted code or plugins
> - Reviewing unfamiliar codebases
> - You're unsure about a command's behavior

### Other Platforms

Support for **Cursor**, **Goose**, and **Amp** is in development. Star and watch this repo to be notified when they're available.

---

## Philosophy

### Why Constitutional Prompts?

Traditional prompting:

```
You → AI → Draft → Feedback → Revision → More feedback → ...
```

Constitutional prompts:

```
You → AI → Done
```

By embedding execution rules, workflow structures, and anti-loop directives directly in prompts, we eliminate iterative refinement while maintaining quality.

### Why Knowledge-Aware?

Generic AI advice is often wrong for your specific context. By automatically loading your codebase architecture, rp1 agents give recommendations that:

- Respect your established patterns
- Understand your system constraints
- Align with your architectural decisions
- Reference actual components and modules

---

## Contributing

Want to contribute? Check out [DEVELOPMENT.md](DEVELOPMENT.md) for:

- Project architecture
- Adding new commands/agents
- Testing guidelines
- Release process

---

## License

Apache License 2.0 - See [LICENSE](LICENSE)

---

## Links

- [**Documentation**](https://rp1.run)
- [Detailed Examples & Workflows](EXAMPLES.md)
- [Development Guide](DEVELOPMENT.md)
- [GitHub Repository](https://github.com/rp1-run/rp1)
- [Issue Tracker](https://github.com/rp1-run/rp1/issues)
- [Releases](https://github.com/rp1-run/rp1/releases)

---

<p align="center">
  <em>Built with ❤️ for developers who value consistency and speed</em>
</p>
