# Guides

Practical tutorials that walk you through complete rp1 workflows from start to finish.

---

## Available Tutorials

<div class="grid cards" markdown>

-   :material-feature-search-outline:{ .lg .middle } **Feature Development**

    ---

    Build your first feature with rp1's 6-step workflow: blueprint, requirements, design, tasks, build, and verify.

    [:octicons-arrow-right-24: Start tutorial](feature-development.md)

-   :material-bug-outline:{ .lg .middle } **Bug Investigation**

    ---

    Systematically investigate bugs using hypothesis-driven debugging. Gather evidence, test theories, and identify root causes.

    [:octicons-arrow-right-24: Start tutorial](bug-investigation.md)

-   :material-source-pull:{ .lg .middle } **PR Review**

    ---

    Perform thorough code reviews with map-reduce analysis, confidence gating, and automated feedback handling.

    [:octicons-arrow-right-24: Start tutorial](pr-review.md)

-   :material-account-group:{ .lg .middle } **Team Onboarding**

    ---

    Help new team members get productive quickly with generated knowledge bases and orientation documentation.

    [:octicons-arrow-right-24: Start tutorial](team-onboarding.md)

</div>

---

## Learning Path

New to rp1? Follow this recommended sequence:

```mermaid
flowchart LR
    QS[Quick Start] --> FD[Feature Development]
    FD --> BI[Bug Investigation]
    BI --> PR[PR Review]
    PR --> TO[Team Onboarding]
```

1. **[Quick Start](../getting-started/quickstart.md)** - Install and configure rp1
2. **[Feature Development](feature-development.md)** - Learn the core workflow
3. **[Bug Investigation](bug-investigation.md)** - Debug issues systematically
4. **[PR Review](pr-review.md)** - Automate code review
5. **[Team Onboarding](team-onboarding.md)** - Share knowledge with your team

---

## Guide Philosophy

rp1 guides are designed to be:

- **Practical** - Real tasks you'll actually do
- **Complete** - Start to finish, no gaps
- **Platform-aware** - Syntax for both Claude Code and OpenCode
- **Checkpoint-driven** - Verify progress at each step
