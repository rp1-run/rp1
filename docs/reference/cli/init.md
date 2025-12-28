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

The init command displays a step-by-step wizard interface with real-time progress. The wizard shows all 8 steps with their current status, and each step displays activity logs as it executes:

```
┌─────────────────────────────────────────────────────────────────┐
│  rp1 init                                          Step 4 of 8  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Loading tools registry                                      │
│    └─ Registry loaded successfully                             │
│                                                                 │
│  ✓ Checking git repository                                     │
│    └─ At repository root                                       │
│                                                                 │
│  ✓ Setting up directories                                      │
│    └─ Created .rp1/context/                                    │
│                                                                 │
│  ◐ Detecting AI tools...                                       │
│    └─ Found: Claude Code v2.0.75                               │
│                                                                 │
│  ○ Configuring instruction file                                │
│  ○ Configuring .gitignore                                      │
│  ○ Installing plugins                                          │
│  ○ Health check                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The 8 Steps

| Step | Name | Description |
|------|------|-------------|
| 1 | Loading tools registry | Loads the supported AI tools configuration |
| 2 | Checking git repository | Detects git root and offers monorepo options |
| 3 | Setting up directories | Creates `.rp1/`, `.rp1/context/`, and `.rp1/work/` |
| 4 | Detecting AI tools | Finds installed AI assistants (Claude Code, OpenCode) |
| 5 | Configuring instruction file | Injects rp1 content into `CLAUDE.md` or `AGENTS.md` |
| 6 | Configuring .gitignore | Adds rp1 entries with selected preset |
| 7 | Installing plugins | Installs rp1-base and rp1-dev for all detected tools |
| 8 | Health check | Validates the complete setup |

### Status Icons

| Icon | Meaning |
|------|---------|
| `✓` | Step completed successfully |
| `◐` | Step in progress (animated spinner) |
| `○` | Step pending |
| `✗` | Step failed |

!!! note "Interactive vs Non-Interactive"
    In TTY environments (interactive terminals), the wizard displays with animated spinners and real-time updates. In non-TTY environments (CI/CD), each step is printed on a separate line without animation.

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

The init wizard automatically installs rp1 plugins for **all detected AI tools**. If both Claude Code and OpenCode are installed, plugins are installed for both tools automatically.

=== "Claude Code"

    For Claude Code, plugins are installed automatically using the `claude plugin install` command:

    ```
    ✓ Installing plugins
      └─ Installing for Claude Code...
      └─ rp1-base installed
      └─ rp1-dev installed
    ```

    After installation, the health check step confirms plugins exist in `~/.claude/plugins/`.

=== "OpenCode"

    For OpenCode, init displays manual installation instructions since OpenCode doesn't have a CLI plugin command:

    ```
    ✓ Installing plugins
      └─ Manual installation required for OpenCode
      └─ Visit: https://opencode.ai/docs/plugins
    ```

=== "Multiple Tools"

    When both Claude Code and OpenCode are detected, plugins are installed for all tools:

    ```
    ✓ Installing plugins
      └─ Installing for Claude Code...
      └─ rp1-base installed
      └─ rp1-dev installed
      └─ Manual installation required for OpenCode
    ```

=== "No Tool Detected"

    If no AI tool is found, init skips plugin installation and the summary shows guidance:

    ```
    ✗ Installing plugins
      └─ No AI tool detected
    ```

    The next steps will recommend installing a supported tool.

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

At the end of initialization, a comprehensive summary is displayed:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✨ rp1 initialized successfully!                              │
│                                                                 │
│  Detected Tools:                                               │
│    ✓ Claude Code v2.0.75                                       │
│                                                                 │
│  Setup Status:                                                 │
│    ✓ .rp1/ directory                                           │
│    ✓ CLAUDE.md configured                                      │
│    ✓ .gitignore configured                                     │
│    ✓ Plugins installed                                         │
│    ✗ Knowledge base (not built)                                │
│    ✗ Project charter (not created)                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Next Steps:                                                   │
│                                                                 │
│  → 1. Restart Claude Code to load plugins  [required]          │
│                                                                 │
│  ○ 2. Build knowledge base                                     │
│       Run: /knowledge-build                                    │
│       Analyzes your codebase for AI context awareness          │
│                                                                 │
│  ○ 3. Create project charter                                   │
│       Run: /blueprint                                          │
│       Captures project vision to guide feature development     │
│                                                                 │
│  Documentation: https://rp1.run                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Summary Sections

| Section | Description |
|---------|-------------|
| **Detected Tools** | Lists all AI tools found with their versions |
| **Setup Status** | Shows what was configured and what's still needed |
| **Next Steps** | Prioritized actions to complete your setup |

### Next Step Icons

| Icon | Meaning |
|------|---------|
| `→` | Required action (must complete before using rp1) |
| `○` | Optional action (recommended but not blocking) |

### Setup Status Items

| Status | Icon | Meaning |
|--------|------|---------|
| Configured | `✓` | Item was set up successfully |
| Not configured | `✗` | Item needs attention (see Next Steps) |

## Examples

### Interactive Setup

Run init in a project directory:

```bash
cd my-project
rp1 init
```

**Expected wizard output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  rp1 init                                          Step 8 of 8  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Loading tools registry                                      │
│    └─ Registry loaded successfully                             │
│                                                                 │
│  ✓ Checking git repository                                     │
│    └─ At repository root                                       │
│                                                                 │
│  ✓ Setting up directories                                      │
│    └─ Created .rp1/context/                                    │
│                                                                 │
│  ✓ Detecting AI tools                                          │
│    └─ Found: Claude Code v2.0.75                               │
│                                                                 │
│  ✓ Configuring instruction file                                │
│    └─ Updated CLAUDE.md                                        │
│                                                                 │
│  ✓ Configuring .gitignore                                      │
│    └─ Applied recommended preset                               │
│                                                                 │
│  ✓ Installing plugins                                          │
│    └─ rp1-base installed                                       │
│    └─ rp1-dev installed                                        │
│                                                                 │
│  ✓ Health check                                                │
│    └─ All checks passed                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### CI/Automation (Non-Interactive)

For use in CI pipelines or scripts:

```bash
rp1 init --yes
```

**Expected output (non-TTY):**

```
[1/8] Loading tools registry... done
[2/8] Checking git repository... done
[3/8] Setting up directories... done
[4/8] Detecting AI tools... Claude Code v2.0.75
[5/8] Configuring instruction file... done
[6/8] Configuring .gitignore... done (recommended preset)
[7/8] Installing plugins... done
[8/8] Health check... done

rp1 initialized successfully!
```

**Behavior with `--yes`:**

- Uses default `.rp1/` directory
- Applies "Recommended" gitignore preset
- Installs plugins automatically if AI tool is detected
- Skips re-initialization prompts (uses safe defaults)
- Outputs step-by-step progress without ANSI codes

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

When run on an already-initialized project, the wizard prompts for action:

```bash
rp1 init
```

**Expected wizard output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  rp1 init                                          Step 3 of 8  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Loading tools registry                                      │
│                                                                 │
│  ✓ Checking git repository                                     │
│    └─ At repository root                                       │
│                                                                 │
│  ? Existing configuration detected                             │
│    └─ .rp1/ directory exists                                   │
│    └─ CLAUDE.md has rp1 content                                │
│                                                                 │
│    What would you like to do?                                  │
│    > Update configuration                                      │
│      Skip (exit without changes)                               │
│      Reinitialize                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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

**Expected wizard output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  rp1 init                                          Step 2 of 8  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Loading tools registry                                      │
│                                                                 │
│  ? Checking git repository                                     │
│    └─ Not at repository root                                   │
│    └─ Current: /path/to/my-monorepo/packages/my-package        │
│    └─ Git root: /path/to/my-monorepo                           │
│                                                                 │
│    What would you like to do?                                  │
│    > Continue here (initialize this subdirectory)              │
│      Switch to git root                                        │
│      Cancel                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tool Detection

When both Claude Code and OpenCode are installed:

```bash
rp1 init
```

**Expected summary output:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✨ rp1 initialized successfully!                              │
│                                                                 │
│  Detected Tools:                                               │
│    ✓ Claude Code v2.0.75                                       │
│    ✓ OpenCode v0.8.0                                           │
│                                                                 │
│  Setup Status:                                                 │
│    ✓ .rp1/ directory                                           │
│    ✓ CLAUDE.md configured                                      │
│    ✓ .gitignore configured                                     │
│    ✓ Plugins installed (Claude Code)                           │
│    ✓ Plugins installed (OpenCode - manual)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Non-Interactive Mode

The init command supports non-interactive execution for CI/CD pipelines, scripted environments, and automation. This mode uses sensible defaults and produces clean, parseable output.

### Enabling Non-Interactive Mode

Non-interactive mode is enabled automatically in non-TTY environments (pipes, CI runners) or explicitly via the `--yes` flag:

```bash
# Explicit non-interactive mode
rp1 init --yes

# Automatic detection (when piped or in CI)
rp1 init | tee init.log
```

### Non-TTY Output Differences

In non-TTY mode (CI/CD, piped output), the wizard gracefully degrades to a simpler output format:

| TTY Mode | Non-TTY Mode |
|----------|--------------|
| Animated spinners | Static progress lines |
| ANSI color codes | Plain text output |
| Interactive prompts | Uses sensible defaults |
| Box-drawing UI | Step-by-step text format |

**Example non-TTY output:**

```
[1/8] Loading tools registry... done
[2/8] Checking git repository... done
[3/8] Setting up directories... done
[4/8] Detecting AI tools... Claude Code v2.0.75
[5/8] Configuring instruction file... done
[6/8] Configuring .gitignore... done (recommended preset)
[7/8] Installing plugins... done
[8/8] Health check... done

rp1 initialized successfully!
```

### Exit Codes

The init command uses standard exit codes for automation:

| Code | Meaning | Example Scenario |
|------|---------|------------------|
| `0` | Success | Setup completed (including with warnings) |
| `1` | Failure | Critical error that prevented setup |

**Checking exit codes in scripts:**

```bash
if rp1 init --yes; then
    echo "rp1 initialized successfully"
else
    echo "rp1 initialization failed"
    exit 1
fi
```

### CI/CD Integration Examples

#### GitHub Actions

```yaml
name: Setup rp1
on: [push]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install rp1
        run: curl -fsSL https://rp1.run/install.sh | sh

      - name: Initialize rp1
        run: rp1 init --yes

      - name: Verify setup
        run: |
          test -d .rp1/context
          test -d .rp1/work
```

#### GitLab CI

```yaml
setup-rp1:
  stage: setup
  script:
    - curl -fsSL https://rp1.run/install.sh | sh
    - rp1 init --yes
  artifacts:
    paths:
      - .rp1/
```

#### Docker

```dockerfile
FROM ubuntu:22.04

# Install rp1
RUN curl -fsSL https://rp1.run/install.sh | sh

# Initialize in build context
WORKDIR /app
COPY . .
RUN rp1 init --yes
```

#### Shell Script

```bash
#!/bin/bash
set -e

# Install and initialize rp1
curl -fsSL https://rp1.run/install.sh | sh
rp1 init --yes

# Check exit code and setup status
if [ $? -eq 0 ] && [ -d ".rp1" ]; then
    echo "rp1 setup complete"
else
    echo "rp1 setup failed" >&2
    exit 1
fi
```

### Non-Interactive Defaults

When running non-interactively, these defaults are applied:

| Prompt | Default Value |
|--------|---------------|
| Git root choice | Continue in current directory |
| Re-initialization | Skip (no changes) |
| Gitignore preset | Recommended |

!!! tip "Override Defaults"
    If you need different behavior in CI, consider running interactive mode with pre-configured environment or using the individual install commands (`rp1 install:claudecode`) for more control.

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

## Multi-Tool Environments

When multiple AI tools are installed (e.g., both Claude Code and OpenCode), `rp1 init` handles them intelligently:

### How Multi-Tool Setup Works

| Behavior | Description |
|----------|-------------|
| **Detects all installed tools** | Both Claude Code and OpenCode appear in the detection step if installed |
| **Installs plugins for ALL tools** | Plugins are installed for every detected tool, not just the primary one |
| **Uses primary tool's instruction file** | The first detected tool determines whether `CLAUDE.md` or `AGENTS.md` is used |
| **Reports all tool statuses** | The final summary shows configuration status for each detected tool |

### Primary Tool Selection

The "primary" tool determines which instruction file is created:

| Detection Order | Instruction File |
|-----------------|------------------|
| Claude Code detected first | `CLAUDE.md` |
| OpenCode detected first | `AGENTS.md` |
| Both detected (Claude Code first) | `CLAUDE.md` (but plugins installed for both) |

!!! note "Instruction File Behavior"
    Only one instruction file is created (either `CLAUDE.md` or `AGENTS.md`), but plugins are installed for **all** detected tools. This ensures both tools can use rp1 regardless of which instruction file exists.

### Verifying Multi-Tool Setup

After initialization, verify that plugins are installed for each tool:

=== "Claude Code"

    Check that rp1 plugins are installed:

    ```bash
    ls ~/.claude/plugins/ | grep rp1
    ```

    Expected output:

    ```
    rp1-base
    rp1-dev
    ```

    You can also verify via the Claude Code CLI:

    ```bash
    claude plugin list | grep rp1
    ```

=== "OpenCode"

    Check that rp1 prompts are available:

    ```bash
    ls ~/.opencode/prompts/ | grep rp1
    ```

    Or verify in OpenCode settings:

    1. Open OpenCode
    2. Go to Settings > Prompts
    3. Look for `rp1-base` and `rp1-dev` entries

### Multi-Tool Summary Example

When both tools are detected and configured:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✨ rp1 initialized successfully!                              │
│                                                                 │
│  Detected Tools:                                               │
│    ✓ Claude Code v2.0.75                                       │
│    ✓ OpenCode v0.8.0                                           │
│                                                                 │
│  Setup Status:                                                 │
│    ✓ .rp1/ directory                                           │
│    ✓ CLAUDE.md configured                                      │
│    ✓ .gitignore configured                                     │
│    ✓ Plugins installed (Claude Code)                           │
│    ✓ Plugins installed (OpenCode - manual)                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Next Steps:                                                   │
│                                                                 │
│  → 1. Restart Claude Code to load plugins  [required]          │
│  → 2. Restart OpenCode to load plugins     [required]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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

!!! tip "direnv"
    [direnv](https://direnv.net/){:target="_blank"} automatically loads environment variables when you enter a directory. It's useful for per-project configuration without polluting your global shell config.

## Idempotency

The init command is safe to run multiple times:

- **Directories**: Only creates if they don't exist
- **Instruction files**: Uses comment-fenced blocks (`<!-- rp1:start -->` ... `<!-- rp1:end -->`)
- **Gitignore**: Uses shell-style fencing (`# rp1:start` ... `# rp1:end`)
- **Plugins**: Skips installation if already installed

Content outside fenced sections is never modified.

## Troubleshooting

### Terminal & Display Issues

??? question "Wizard not rendering correctly"

    The init wizard requires a terminal that supports ANSI escape codes and has sufficient dimensions. If the wizard appears broken or doesn't display properly:

    **Minimum Requirements:**

    - Terminal size: 80 columns x 24 rows minimum
    - ANSI escape code support (most modern terminals)
    - Unicode support for status icons

    **Solutions:**

    1. Resize your terminal window to at least 80x24
    2. Use a modern terminal emulator (iTerm2, Windows Terminal, GNOME Terminal)
    3. If issues persist, force non-interactive mode:

    ```bash
    rp1 init --yes
    ```

    This bypasses the interactive wizard and uses sensible defaults.

??? question "Terminal shows garbled output"

    Garbled output (random characters, misaligned text) typically indicates ANSI escape code compatibility issues:

    **Common Causes:**

    - Terminal doesn't support ANSI codes
    - SSH session without proper terminal type
    - Piping output to a file or another command
    - Incompatible terminal emulator

    **Solutions:**

    1. Verify your terminal type: `echo $TERM` (should be `xterm-256color` or similar)
    2. For SSH, ensure proper terminal forwarding: `ssh -t user@host`
    3. Use non-interactive mode for piped/scripted usage:

    ```bash
    rp1 init --yes
    ```

    4. Try a different terminal emulator

??? question "Spinner or icons not displaying"

    If spinner animations or Unicode icons (checkmarks, arrows) appear as question marks or boxes:

    1. Your terminal font may lack Unicode support - try a font like "Fira Code" or "JetBrains Mono"
    2. Set your terminal encoding to UTF-8
    3. On Windows, ensure you're using Windows Terminal (not cmd.exe)

### Configuration Issues

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

??? question "Multi-tool setup not working correctly"

    If you have both Claude Code and OpenCode installed but only one is configured:

    **Symptoms:**

    - Only one tool appears in "Detected Tools" summary
    - Plugins only installed for one tool
    - One tool works with rp1, the other doesn't

    **Solutions:**

    1. **Verify both tools are in PATH:**

        ```bash
        which claude && which opencode
        ```

    2. **Check detection step output** - the wizard should show both tools during step 4 ("Detecting AI tools")

    3. **Manually install plugins for the missing tool:**

        ```bash
        # For Claude Code
        rp1 install:claudecode

        # For OpenCode
        rp1 install:opencode
        ```

    4. **Verify plugin installation for each tool:**

        ```bash
        # Claude Code
        ls ~/.claude/plugins/ | grep rp1

        # OpenCode
        ls ~/.opencode/prompts/ | grep rp1
        ```

    5. **Re-run init** - if one tool was installed after initial setup:

        ```bash
        rp1 init
        ```

        Select "Update configuration" when prompted.

    **Note:** The instruction file (`CLAUDE.md` or `AGENTS.md`) is created based on the first detected tool, but this doesn't affect the other tool's functionality - both tools can use rp1 commands regardless of which instruction file exists.

## Related Commands

- [`install:claudecode`](../../getting-started/installation.md) - Manual plugin installation for Claude Code
- [`install:opencode`](../../getting-started/installation.md) - Manual plugin installation for OpenCode
- [`knowledge-build`](../base/knowledge-build.md) - Build knowledge base after init

## See Also

- [Installation Guide](../../getting-started/installation.md) - Full installation instructions
- [The .rp1 Directory](../../getting-started/rp1-directory.md) - Understanding the directory structure
- [First Workflow](../../getting-started/first-workflow.md) - Getting started with rp1
