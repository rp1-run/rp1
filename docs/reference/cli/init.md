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
6. **Plugin Installation** - Installs rp1 plugins for detected AI tools
7. **Plugin Verification** - Verifies plugins were installed correctly
8. **Health Check** - Validates the complete setup
9. **Summary & Next Steps** - Displays actions taken and recommended next steps

The command is fully interactive when run in a terminal, or uses sensible defaults when run in CI/automation environments.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Non-interactive mode: use defaults without prompting |
| `--interactive` | `-i` | Force interactive mode even without TTY |

## Progress Visualization

The init command displays real-time progress with visual indicators:

```
◐ Loading tools registry...
✔ Loading tools registry...
◐ Checking git repository...
✔ Checking git repository...
◐ Setting up directory structure...
✔ Setting up directory structure...
◐ Detecting agentic tools...
✔ Claude Code v2.0.75
✔ Detecting agentic tools...
◐ Installing plugins...
✔ Installing plugins...
◐ Verifying plugin installation...
✔ Verifying plugin installation...
◐ Performing health check...
✔ Performing health check...
◐ Generating summary...
✔ Generating summary...
```

| Icon | Meaning |
|------|---------|
| `◐` | Step in progress |
| `✔` | Step completed successfully |
| `✖` | Step failed |
| `ℹ` | Informational message |

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

## Plugin Installation

When an AI tool is detected, init will offer to install rp1 plugins:

=== "Claude Code"

    For Claude Code, plugins are installed automatically using the `claude plugin install` command:

    ```
    ◐ Installing plugins...
    ✔ rp1-base installed
    ✔ rp1-dev installed
    ✔ Installing plugins...
    ```

    After installation, the verification step confirms plugins exist in `~/.claude/plugins/`.

=== "OpenCode"

    For OpenCode, init displays manual installation instructions since OpenCode doesn't have a CLI plugin command:

    ```
    ℹ Manual plugin installation required for OpenCode.
    ℹ Visit: https://opencode.ai/docs/plugins
    ```

=== "No Tool Detected"

    If no AI tool is found, init skips plugin installation and suggests installing a supported tool:

    ```
    ℹ No AI tool detected. Install Claude Code or OpenCode to use rp1 plugins.
    ℹ Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started
    ℹ OpenCode: https://opencode.ai/docs/installation
    ```

## Health Check

After setup, init performs a health check to verify everything is configured correctly:

| Check | What It Verifies |
|-------|-----------------|
| `.rp1/` directory | Directory exists and is accessible |
| Instruction file | `CLAUDE.md` or `AGENTS.md` contains rp1 fenced content |
| `.gitignore` | Contains rp1 entries (if git repository) |
| Plugins installed | Both rp1-base and rp1-dev are installed |

**Health check output:**

```
Health Check:
  ✔ .rp1/ directory exists
  ✔ Instruction file configured
  ✔ .gitignore configured
  ✔ Plugins installed
```

If any check fails, init reports the issue with remediation steps.

## Summary & Next Steps

At the end of initialization, a summary is displayed:

```
✔ rp1 initialized successfully!

Actions: 3 created, 1 updated
Detected tool: Claude Code v2.0.75

Health Check:
  ✔ .rp1/ directory exists
  ✔ Instruction file configured
  ✔ .gitignore configured
  ✔ Plugins installed

Next Steps:
  1. → Restart Claude Code to load plugins (required)
  2. ○ Run /knowledge-build to analyze your codebase (optional)

Documentation: https://rp1.run
```

| Next Step Icon | Meaning |
|----------------|---------|
| `→` | Required action |
| `○` | Optional action |

## Examples

### Interactive Setup

Run init in a project directory:

```bash
cd my-project
rp1 init
```

### CI/Automation (Non-Interactive)

For use in CI pipelines or scripts:

```bash
rp1 init --yes
```

**Behavior with `--yes`:**

- Uses default `.rp1/` directory
- Applies "Recommended" gitignore preset
- Installs plugins automatically if AI tool is detected
- Skips re-initialization prompts
- Outputs only errors and final summary (minimal output)

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Success (including with warnings) |
| `1` | Critical failure (setup incomplete) |

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
ℹ Existing rp1 configuration detected:
ℹ   - .rp1/ directory exists
ℹ   - Instruction file has rp1 content
ℹ   - Knowledge base content exists
ℹ   - Work artifacts exist

✔ rp1 is already initialized. What would you like to do? Update configuration
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
    - Installs plugins via `claude plugin install`
    - Verifies plugins in `~/.claude/plugins/`
    - Uses short-form command syntax in examples

=== "OpenCode"

    When OpenCode is detected:

    - Injects instructions into `AGENTS.md`
    - Shows manual plugin installation steps
    - Uses namespaced command syntax in examples

### No Tool Detected

If neither Claude Code nor OpenCode is found:

```
ℹ No supported agentic tool detected.

Next Steps:
  1. → Install Claude Code or OpenCode (required)

Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started
OpenCode: https://opencode.ai/docs/installation
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
- **Plugins**: Skips installation if already installed

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

    Plugin installation requires the AI tool's CLI to be in your PATH:

    - **Claude Code**: Run `which claude` to verify. If not found, add to PATH or reinstall.
    - **OpenCode**: Plugin installation is manual - follow the displayed instructions.

    If installation fails, you can install plugins manually:

    ```bash
    # Claude Code
    rp1 install:claudecode

    # OpenCode
    rp1 install:opencode
    ```

??? question "Health check reports issues"

    The health check verifies your setup is complete. Common issues:

    | Issue | Solution |
    |-------|----------|
    | Missing `.rp1/` directory | Re-run `rp1 init` |
    | Instruction file missing rp1 content | Delete the file and re-run init, or manually add the fenced section |
    | Plugins not installed | Run `rp1 install:claudecode` or `rp1 install:opencode` |
    | `.gitignore` not configured | Re-run init and select a gitignore preset |

??? question "Tool not detected but installed"

    If your AI tool is installed but not detected:

    1. Verify the binary is in your PATH: `which claude` or `which opencode`
    2. Check the version: `claude --version` or `opencode --version`
    3. If using Homebrew Cask, ensure the symlink exists in `/opt/homebrew/bin/`

## Related Commands

- [`install:claudecode`](../../getting-started/installation.md) - Manual plugin installation for Claude Code
- [`install:opencode`](../../getting-started/installation.md) - Manual plugin installation for OpenCode
- [`knowledge-build`](../base/knowledge-build.md) - Build knowledge base after init

## See Also

- [Installation Guide](../../getting-started/installation.md) - Full installation instructions
- [The .rp1 Directory](../../getting-started/rp1-directory.md) - Understanding the directory structure
- [First Workflow](../../getting-started/first-workflow.md) - Getting started with rp1
