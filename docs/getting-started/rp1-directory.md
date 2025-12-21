# The .rp1 Directory

rp1 stores project-specific data in a `.rp1/` directory at your project root. This guide explains the directory structure, what to commit vs ignore, and how to customize the storage location.

---

## Directory Structure

```
.rp1/
├── context/              # Generated knowledge base (auto-generated)
│   ├── index.md          # Project overview
│   ├── architecture.md   # System architecture
│   ├── modules.md        # Component breakdown
│   ├── concept_map.md    # Domain concepts
│   ├── patterns.md       # Implementation patterns
│   └── state.json        # Build state tracking
└── work/                 # Active development work
    ├── charter.md        # Project charter (from /blueprint)
    ├── prds/             # Product requirement documents
    │   └── *.md          # PRD files created by /blueprint
    ├── features/         # Feature development artifacts
    │   └── <feature-id>/ # Per-feature directories
    │       ├── requirements.md
    │       ├── design.md
    │       ├── tasks.md
    │       └── field-notes.md
    └── archives/         # Completed/archived features
```

---

## Git Recommendations

### Recommended .gitignore

```gitignore
# rp1 working files (individual work artifacts)
.rp1/work/

# rp1 generated KB (optional - see trade-offs below)
# .rp1/context/
```

### What to Commit vs Ignore

| Directory | Recommendation | Rationale |
|-----------|---------------|-----------|
| `.rp1/work/` | **Ignore** | Individual work artifacts (features, PRDs, tasks) - typically personal workflow |
| `.rp1/context/` | **Consider** | See trade-offs below |

### Knowledge Base: To Commit or Not?

The `.rp1/context/` directory contains your auto-generated knowledge base. There's a trade-off:

**Commit `.rp1/context/`** if:

- Your team wants shared context without regenerating
- You want new developers to have immediate KB access
- Your codebase is stable (fewer regenerations needed)

**Ignore `.rp1/context/`** if:

- Your codebase changes frequently (KB regenerates often = noisy git history)
- Team members prefer fresh, local KB generation
- You want to keep repository size smaller

!!! tip "Hybrid Approach"
    Some teams commit context files but add them to `.gitattributes` with `merge=ours` to avoid merge conflicts, or only commit periodically (e.g., with releases).

!!! tip "Stealth Mode"
    To ignore `.rp1/` across all your projects without modifying each repo's `.gitignore`, add it to your global gitignore:

    ```bash
    # Add to global gitignore
    echo ".rp1/" >> ~/.gitignore_global
    git config --global core.excludesfile ~/.gitignore_global
    ```

    This keeps rp1 artifacts completely out of version control on your machine.

---

## Configuring RP1_ROOT

By default, rp1 uses `.rp1/` in your current working directory. Override this with the `RP1_ROOT` environment variable.

### Use Cases

1. **Project-local (default)**: Data stored in each project's `.rp1/` directory
2. **User-global**: Centralized data across all projects
3. **Custom path**: Specific location for your workflow

### Configuration Examples

=== "Project-local (default)"

    No configuration needed. rp1 creates `.rp1/` in your current directory.

    ```bash
    # Just run commands - .rp1/ is created automatically
    /knowledge-build
    ```

=== "User-global"

    Centralize rp1 data in your home directory with per-project subdirectories:

    ```bash
    # Add to ~/.bashrc or ~/.zshrc (include project name)
    export RP1_ROOT="$HOME/.rp1-global/my-project/"
    ```

    !!! note
        Include a project-specific subdirectory to keep each project's KB separate. The knowledge base is project-specific and shouldn't be shared across different codebases.

=== "Custom path"

    Set a specific location per-session or per-command:

    ```bash
    # Per-session
    export RP1_ROOT="/path/to/custom/rp1"

    # Or per-command (Claude Code)
    RP1_ROOT=/custom/path /knowledge-build
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

    Check your `RP1_ROOT` environment variable:

    ```bash
    echo $RP1_ROOT
    ```

    If set unexpectedly, unset it or override per-command.

??? question "Feature files not found?"

    Ensure you're in the correct directory. Feature commands look for files in `{RP1_ROOT}/work/features/{feature-id}/`.

    ```bash
    ls .rp1/work/features/
    ```

---

## Next Steps

- [:octicons-arrow-right-24: First Workflow](first-workflow.md) - Run your first commands
- [:octicons-arrow-right-24: Feature Development](../guides/feature-development.md) - Learn the feature workflow
