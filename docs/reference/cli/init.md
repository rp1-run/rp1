# init

Initializes rp1 in a project directory with guided setup for AI assistant configuration.

---

## Synopsis

```bash
rp1 init [options]
```

## Description

The `init` command provides a comprehensive bootstrap experience for users adopting rp1 in their projects. It performs the following steps:

1. **Git Root Detection** - Verifies you're at the repository root (with monorepo support)
2. **Directory Setup** - Creates `.rp1/`, `.rp1/context/`, and `.rp1/work/` directories
3. **Tool Detection** - Identifies installed AI assistants (Claude Code or OpenCode)
4. **Instruction Injection** - Adds rp1 instructions to `CLAUDE.md` or `AGENTS.md`
5. **Git Configuration** - Configures `.gitignore` for rp1 artifacts
6. **Plugin Installation Offer** - Offers to install rp1 plugins
7. **Knowledge Build Suggestion** - Suggests running knowledge-build

The command is fully interactive when run in a terminal, or uses sensible defaults when run in CI/automation environments.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Non-interactive mode: use defaults without prompting |
| `--interactive` | `-i` | Force interactive mode even without TTY |

## Git Ignore Presets

During initialization, you're offered three options for configuring `.gitignore`:

| Preset | Description | `.gitignore` Content |
|--------|-------------|----------------------|
| **Recommended** | Track context (shareable KB), ignore work | `.rp1/work/`<br>`.rp1/meta.json` |
| **Track All** | Track everything except local metadata | `.rp1/meta.json` |
| **Ignore All** | Ignore entire `.rp1/` directory | `.rp1/` |

!!! tip "Recommended Preset"
    The "Recommended" preset is the best choice for most projects. It allows your team to share the generated knowledge base while keeping work-in-progress feature artifacts local.

### What Gets Tracked

| Path | Contains | Shareable? |
|------|----------|------------|
| `.rp1/context/` | Generated knowledge base files | Yes |
| `.rp1/work/` | Feature artifacts, PR reviews | Usually no |
| `.rp1/meta.json` | Local paths (repo root) | No |

## Examples

### Interactive Setup

Run init in a project directory:

```bash
cd my-project
rp1 init
```

**Expected output:**

```
Detecting git repository...
You are at the git root. Proceeding with initialization.

Checking for existing rp1 configuration...
No existing configuration found.

Creating .rp1 directory structure...
Created: .rp1/
Created: .rp1/context/
Created: .rp1/work/

Detecting agentic tools...
Detected: Claude Code v2.0.75

How would you like to configure .gitignore?
> Recommended: Track context, ignore work
  Track everything except meta.json
  Ignore entire .rp1/ directory

Configuring .gitignore...
Updated: .gitignore

Injecting rp1 instructions into CLAUDE.md...
Created: CLAUDE.md

Install rp1 plugins now? [Y/n] y

Installing plugins...
rp1-base installed successfully
rp1-dev installed successfully

Run knowledge-build now? (takes 10-15 minutes) [y/N] n

Initialization complete!

Next steps:
1. Restart Claude Code to load plugins
2. Run /knowledge-build to generate your knowledge base
```

### CI/Automation (Non-Interactive)

For use in CI pipelines or scripts:

```bash
rp1 init --yes
```

**Behavior with `--yes`:**

- Uses default `.rp1/` directory
- Applies "Recommended" gitignore preset
- Skips plugin installation
- Skips knowledge build suggestion
- Proceeds with warnings (no prompts)

### Forced Interactive Mode

Force prompts even without a TTY (e.g., in certain Docker environments):

```bash
rp1 init --interactive
```

### Re-initialization

When run on an already-initialized project:

```bash
rp1 init
```

**Expected output:**

```
rp1 already initialized. What would you like to do?
> Update configuration (refresh instructions, preserve data)
  Skip (keep existing configuration)
  Reinitialize (start fresh, preserves KB and work)

Updating configuration...
Updated: CLAUDE.md (fenced section only)
Updated: .gitignore (fenced section only)

Configuration updated successfully.
```

| Choice | Behavior |
|--------|----------|
| **Update** | Refreshes fenced content in instruction files and gitignore. Preserves all user content and `.rp1/` data. |
| **Skip** | Exits successfully without making changes. |
| **Reinitialize** | Performs fresh init but preserves `.rp1/context/` and `.rp1/work/` content. |

### Monorepo Support

When running init in a subdirectory of a git repository:

```bash
cd my-monorepo/packages/my-package
rp1 init
```

**Expected output:**

```
Detecting git repository...
Warning: You are in a subdirectory of the git repository.
  Current directory: /path/to/my-monorepo/packages/my-package
  Git root: /path/to/my-monorepo

What would you like to do?
> Continue here (monorepo - initialize this subdirectory)
  Switch to git root (initialize at repository root)
  Cancel
```

## Tool Detection

The init command automatically detects installed AI assistants:

=== "Claude Code"

    When Claude Code is detected:

    - Injects instructions into `CLAUDE.md`
    - Offers to install plugins via `claude plugin install`
    - Uses short-form command syntax in examples

=== "OpenCode"

    When OpenCode is detected:

    - Injects instructions into `AGENTS.md`
    - Shows manual plugin installation steps
    - Uses namespaced command syntax in examples

### No Tool Detected

If neither Claude Code nor OpenCode is found:

```
No supported agentic tool detected.

Which tool would you like to install?
> Claude Code
  OpenCode
  Skip (continue without a tool)

To install Claude Code, visit:
https://docs.anthropic.com/en/docs/claude-code/getting-started
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Custom location for rp1 data directory |

### Custom RP1_ROOT

To use a custom location for rp1 data:

```bash
# Set via environment variable
export RP1_ROOT=/custom/path/.rp1
rp1 init

# Or use direnv (.envrc)
echo 'export RP1_ROOT=.config/rp1' >> .envrc
direnv allow
rp1 init
```

## Idempotency

The init command is safe to run multiple times:

- **Directories**: Only creates if they don't exist
- **Instruction files**: Uses comment-fenced blocks (`<!-- rp1:start -->` ... `<!-- rp1:end -->`)
- **Gitignore**: Uses shell-style fencing (`# rp1:start` ... `# rp1:end`)

Content outside fenced sections is never modified.

## Troubleshooting

??? question "Init creates wrong instruction file"

    The instruction file (`CLAUDE.md` vs `AGENTS.md`) is determined by the detected AI tool. If the wrong file is created:

    1. Ensure the correct tool is installed and in your PATH
    2. Run `which claude` or `which opencode` to verify
    3. Re-run init after installing the correct tool

??? question "Permission denied errors"

    Ensure you have write permissions in the project directory:

    ```bash
    ls -la .
    ```

    If running in a container, ensure the mounted volume has correct permissions.

??? question "Git root detection fails"

    The command uses `git rev-parse --show-toplevel` internally. If this fails:

    1. Verify you're in a git repository: `git status`
    2. Initialize git if needed: `git init`
    3. Or proceed without git - init will still work but skip gitignore configuration

??? question "Re-init doesn't update content"

    If fenced content isn't updating:

    1. Check for malformed fence markers in your files
    2. Ensure markers are exactly `<!-- rp1:start -->` and `<!-- rp1:end -->` (or `# rp1:start`/`# rp1:end` for gitignore)
    3. Delete the markers and re-run init

??? question "Plugins fail to install"

    Plugin installation is handled by the AI tool's native plugin system:

    - **Claude Code**: Ensure `claude` command is available
    - **OpenCode**: Check that `~/.opencode/prompts/` is writable

    You can always install plugins manually after init completes.

## Related Commands

- [`install:claudecode`](../../getting-started/installation.md) - Manual plugin installation for Claude Code
- [`install:opencode`](../../getting-started/installation.md) - Manual plugin installation for OpenCode
- [`knowledge-build`](../base/knowledge-build.md) - Build knowledge base after init

## See Also

- [Installation Guide](../../getting-started/installation.md) - Full installation instructions
- [The .rp1 Directory](../../getting-started/rp1-directory.md) - Understanding the directory structure
- [First Workflow](../../getting-started/first-workflow.md) - Getting started with rp1
