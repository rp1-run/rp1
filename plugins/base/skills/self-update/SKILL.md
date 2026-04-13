---
name: self-update
description: "Update rp1 and run the full post-update lifecycle."
metadata:
  category: knowledge
  is_workflow: false
  version: 1.1.0
  tags:
    - utility
    - update
    - maintenance
  created: 2025-12-14
  updated: 2026-02-26
  author: rp1
---

# Self-Update Command

Update rp1 using the unified lifecycle command. `rp1 update` now coordinates:
- CLI self-update
- plugin refresh for all detected tools using the latest installer logic
- project migrations when the current directory is an rp1 project
- Arcade daemon stop/restart when Arcade was already running

## Execution

Run the following command via Bash:

```bash
rp1 update
```

## Interpreting Results

### CLI Update (`rp1 update`)

The CLI update command will output one of three outcomes:

#### Success (Exit Code 0)

The CLI update completed successfully. Example output:
```
Detecting installation method...
Homebrew installation detected

Updating rp1...
Successfully updated rp1 from 0.2.3 to 0.3.0
```

**Report to user**: Confirm the version change.

#### Manual Installation Required (Exit Code 2)

Automatic update is not available. Example output:
```
Detecting installation method...
Manual installation detected

Automatic update is not available for manual installations.
Please download the latest version from:
https://github.com/rp1-run/rp1/releases/latest
```

**Report to user**: Explain that they need to update the CLI manually and provide the GitHub releases link. `rp1 update` may still refresh plugins and run migrations with the currently installed binary, but the CLI binary itself still requires manual replacement.

#### Error (Exit Code 1)

The CLI update failed. Example output:
```
Error: brew upgrade failed: Permission denied
```

**Report to user**: Show the error message and suggest checking permissions or trying manual update.

### Unified Lifecycle (`rp1 update`)

After the binary step, the same command continues by:

1. Refreshing plugins for all detected agentic tools
2. Running project migrations when applicable
3. Restoring the Arcade daemon if it was running before update

Example output:
```
Detecting installed tools...
Found: Claude Code, OpenCode

Updating plugins for Claude Code...
Successfully updated plugins for Claude Code

Updating plugins for OpenCode...
Successfully updated plugins for OpenCode
```

**Report to user**: Confirm which tools were refreshed and whether migrations ran.

## Restart Reminder

After reporting the results, always remind the user:

> Please restart Claude Code (or OpenCode) to use the new version.

This is important because the updated CLI and plugins will not take effect until the IDE is restarted.

## Notes

- `rp1 update` handles the full lifecycle using the appropriate package manager (Homebrew, Scoop, or manual)
- `rp1 update plugins` remains available for plugin-only repair or targeted tool refresh
- The command is safe to run even if you are already on the latest version
