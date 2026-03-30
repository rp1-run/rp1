# The .rp1 Directory

rp1 stores project-specific knowledge base data in a `.rp1/` directory at your project root, while work artifacts are stored externally in `~/.rp1/<project-key>/`. This guide explains the directory structure, what to commit vs ignore, and how to customize storage locations using the `RP1_PROJECT_ROOT`, `RP1_KB_ROOT`, and `RP1_WORK_ROOT` environment variables.

---

## Directory Structure

```
.rp1/                         # Project-local (RP1_KB_ROOT)
├── context/                  # Generated knowledge base (auto-generated)
│   ├── index.md              # Project overview
│   ├── architecture.md       # System architecture
│   ├── modules.md            # Component breakdown
│   ├── concept_map.md        # Domain concepts
│   ├── patterns.md           # Implementation patterns
│   ├── state.json            # Build state tracking (shareable)
│   └── meta.json             # Local paths (NOT shareable - add to .gitignore)
├── config/                   # Project configuration
└── settings.toml             # Directory and project settings

~/.rp1/<project-key>/         # External work dir (RP1_WORK_ROOT)
├── charter.md                # Project charter (from /blueprint)
├── prds/                     # Product requirement documents
│   └── *.md                  # PRD files created by /blueprint
├── features/                 # Feature development artifacts
│   └── <feature-id>/         # Per-feature directories
│       ├── requirements.md
│       ├── design.md
│       ├── tasks.md
│       └── field-notes.md
└── archives/                 # Completed/archived features
```

---

## Git Recommendations

When you run `rp1 init`, it automatically configures `.gitignore` with one of three presets. See [Git Ignore Presets](../reference/cli/init.md#git-ignore-presets) for details on each option.

### Knowledge Base: To Commit or Not?

The `.rp1/context/` directory contains your auto-generated knowledge base. There's a trade-off:

**Commit `.rp1/context/`** if:

- Your team wants shared context without regenerating
- You want new developers to have immediate KB access
- Your codebase is stable (fewer regenerations needed)

**Ignore `.rp1/context/`** if:

- Your codebase changes frequently (KB regenerates often = noisy git history)
- Team members prefer fresh, local KB generation

!!! tip "Hybrid Approach"
    Some teams commit context files but add them to `.gitattributes` with `merge=ours` to avoid merge conflicts, or only commit periodically (e.g., with releases).

!!! warning "Stealth Mode (Discouraged)"
    You can ignore `.rp1/` across all projects by adding it to your global gitignore:

    ```bash
    echo ".rp1/" >> ~/.gitignore_global
    git config --global core.excludesfile ~/.gitignore_global
    ```

    This is **heavily discouraged** as it prevents sharing KB with your team. Consider using the `RP1_KB_ROOT` environment variable to customize the KB storage location.

---

## Configuring Directory Paths

rp1 uses three environment variables for directory resolution:

| Variable | Default | Description |
|----------|---------|-------------|
| `RP1_PROJECT_ROOT` | Auto-detected | Repository root directory |
| `RP1_KB_ROOT` | `<project>/.rp1/context/` | Knowledge base directory |
| `RP1_WORK_ROOT` | `~/.rp1/<project-key>/` | Work artifact directory |

!!! tip "Advanced Configuration"
    For automatic per-directory configuration using `direnv`, see [Custom Directory Paths](../reference/cli/init.md#custom-rp1_root) in the init reference.

### Use Cases

1. **Project-local KB (default)**: KB stored in each project's `.rp1/context/` directory
2. **Custom KB path**: Override KB location for specific workflows
3. **Custom work path**: Override work artifact storage location

### Configuration Examples

=== "Default (recommended)"

    No configuration needed. rp1 auto-detects project root and derives KB and work paths.

    ```bash
    # Just run commands - paths are resolved automatically
    /knowledge-build
    ```

=== "Custom KB path"

    Override the knowledge base location:

    ```bash
    # Add to ~/.bashrc or ~/.zshrc
    export RP1_KB_ROOT="/path/to/custom/kb"
    ```

=== "Custom work path"

    Override where work artifacts are stored:

    ```bash
    # Add to ~/.bashrc or ~/.zshrc
    export RP1_WORK_ROOT="/path/to/custom/work"
    ```

### Monorepo Considerations

For monorepos, you have two options:

**Option A: Per-project .rp1 directories (Recommended)**

Create `.rp1/` inside each project to keep context tight and focused:

```
my-monorepo/
├── packages/
│   ├── frontend/
│   │   └── .rp1/         # Frontend-specific KB
│   └── backend/
│       └── .rp1/         # Backend-specific KB
└── services/
    └── api/
        └── .rp1/         # API-specific KB
```

This approach:

- Keeps knowledge bases focused on each project's domain
- Allows independent KB regeneration
- Reduces noise when working on a single project

**Option B: Root-level .rp1 directory**

Place `.rp1/` at the repository root for a unified view:

```
my-monorepo/
├── .rp1/                 # Shared KB at repo root
│   └── context/
│       └── index.md      # Lists all projects
├── packages/
└── services/
```

rp1 automatically detects monorepo structures and creates project-specific sections. Use this when you need cross-project context.

---

## Troubleshooting

??? question "Knowledge base not updating?"

    Delete `.rp1/context/state.json` to force a full rebuild:

    ```bash
    rm .rp1/context/state.json
    /knowledge-build
    ```

??? question "Want to start fresh?"

    Remove the entire directory and rebuild:

    ```bash
    rm -rf .rp1/
    /knowledge-build
    ```

??? question "KB building in wrong location?"

    Check your `RP1_KB_ROOT` environment variable:

    ```bash
    echo $RP1_KB_ROOT
    ```

    If set unexpectedly, unset it or override per-command.

??? question "Feature files not found?"

    Ensure you're in the correct directory. Feature commands look for files in `${RP1_WORK_ROOT}/features/{feature-id}/`.

    ```bash
    # Check your resolved work directory
    rp1 agent-tools rp1-root-dir
    ```

---

## Next Steps

- [:octicons-arrow-right-24: First Workflow](first-workflow.md) - Run your first commands
- [:octicons-arrow-right-24: Feature Development](../guides/feature-development.md) - Learn the feature workflow
