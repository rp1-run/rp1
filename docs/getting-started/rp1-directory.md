# The .rp1 Directory

rp1 stores all project-specific data in a `.rp1/` directory at your project root. This includes the knowledge base (`.rp1/context/`), work artifacts (`.rp1/work/`), and a stable project identity file (`.rp1/project_id`). This guide explains the directory structure, what to commit vs ignore, and how project discovery works.

---

## Directory Structure

```
.rp1/                         # Project root marker
├── project_id                # Stable UUID identity (checked in)
├── context/                  # Generated knowledge base
│   ├── index.md              # Project overview
│   ├── architecture.md       # System architecture
│   ├── interaction-model.md  # Cross-surface interaction semantics
│   ├── modules.md            # Component breakdown
│   ├── concept_map.md        # Domain concepts
│   ├── patterns.md           # Implementation patterns
│   ├── state.json            # Build state tracking (shareable)
│   └── meta.json             # Local paths (NOT shareable - add to .gitignore)
├── config/                   # Project configuration
├── settings.toml             # Project settings (model tiers, argument defaults)
├── work/                     # Work artifacts (ignored by git)
│   ├── charter.md            # Project charter (from /blueprint)
│   ├── prds/                 # Product requirement documents
│   │   └── *.md              # PRD files created by /blueprint
│   ├── features/             # Feature development artifacts
│   │   └── <feature-id>/     # Per-feature directories
│   │       ├── requirements.md
│   │       ├── design.md
│   │       ├── tasks.md
│   │       └── field-notes.md
│   └── archives/             # Completed/archived features
```

The `settings.toml` file can include a `[models]` section for remapping
abstract model tiers (deep, standard, fast) to concrete model identifiers per
platform. This lets you control which models rp1 agents use without rebuilding.
See [Configuration](../reference/configuration.md) for the full schema and
available presets.

---

## Project Identity

Every rp1 project has a `.rp1/project_id` file containing a UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`). Think of this as the stable identity rp1 uses to tell one project apart from another. It lets rp1 and Arcade keep runs, artifacts, and tasks attached to the right project even if you clone the repo elsewhere, rename the parent folder, or work from linked worktrees.

This file is:

- **Created automatically** by `rp1 init` or `rp1 migrate`.
- **Checked into version control** so all team members and clones share the same identity.
- **Immutable** once created -- rp1 never regenerates or modifies it.
- **Used by Arcade** to correlate runs, artifacts, and tasks across clones and worktrees.

## Project Discovery

rp1 discovers your project by walking up the directory tree from the current working directory, looking for `.rp1/project_id`. This means you can run rp1 commands from any subdirectory within your project.

rp1 does not auto-discover your home directory as a project root. If you want rp1 in a specific project, run `rp1 init` from that project directory rather than relying on a home-level `.rp1/` marker.

If `.rp1/project_id` is not found but `.rp1/` exists (pre-migration project), rp1 still functions but logs a warning recommending `rp1 migrate`.

For git worktrees, rp1 resolves back to the main worktree's `.rp1/` directory so all worktrees share the same project identity, knowledge base, and work artifacts.

---

## Git Recommendations

When you run `rp1 init`, it automatically configures `.gitignore` with one of three presets. See [Git Ignore Presets](../reference/cli/init.md#git-ignore-presets) for details on each option.

The recommended preset:

- **Tracks** `.rp1/project_id` (stable identity shared across team)
- **Tracks** `.rp1/context/` (knowledge base, optionally shared)
- **Tracks** `.rp1/config/` (project configuration)
- **Ignores** `.rp1/work/` (local work artifacts)
- **Ignores** `.rp1/settings.toml` (local settings)
- **Ignores** `.rp1/context/meta.json` (local paths)

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

---

## Monorepo Considerations

For monorepos, initialize rp1 inside each project you want rp1 to track. Do not create a single `.rp1/` at the monorepo root.

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

This is the supported pattern:

- Keeps knowledge bases focused on each project's domain
- Allows independent KB regeneration
- Reduces noise when working on a single project
- Gives each project its own `project_id`, so Arcade and rp1 do not mix activity from unrelated packages

Root-level monorepo `.rp1/` setup is not a supported pattern. If you want rp1 coverage for multiple packages or services, initialize each one separately and run rp1 from the project you are actively working in.

This does not block cross-project workflows. Commands such as `deep-research` can still switch into multi-project analysis when your request spans multiple codebases, then load the relevant rp1 context for each project they inspect.

---

## Migration from External Work Roots

If you are upgrading from a version of rp1 that stored work artifacts externally (under `~/.rp1/work/<project-key>/`), run:

```bash
rp1 migrate
```

This command:

1. Creates `.rp1/project_id` if missing
2. Creates `.rp1/work/` if missing
3. Moves legacy work artifacts from `~/.rp1/work/<key>` into `.rp1/work/`
4. Updates `.gitignore` with appropriate rules
5. Backfills `project_id` in Arcade database records

The command is idempotent and safe to run multiple times. See [`rp1 migrate`](../reference/cli/rp1-migrate.md) for details.

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

??? question "Feature files not found?"

    Ensure you're in the correct directory. Feature commands look for files in `.rp1/work/features/{feature-id}/`.
    If you are using linked worktrees, remember that rp1 resolves back to the
    shared project-level `.rp1/` directory.

??? question "Getting a warning about missing project_id?"

    Run `rp1 migrate` to create the `.rp1/project_id` file and complete the migration to the new directory model.

---

## Next Steps

- [:octicons-arrow-right-24: First Workflow](first-workflow.md) - Run your first commands
- [:octicons-arrow-right-24: Feature Development](../guides/feature-development.md) - Learn the feature workflow
