---
name: self-update
version: 1.1.0
description: Update rp1 CLI and all plugins to the latest version
tags:
  - utility
  - update
  - maintenance
created: 2025-12-14
author: rp1
---

# Self-Update Command

Update rp1 CLI to the latest version and update all installed plugins.

## Execution

Run the following commands sequentially via Bash:

```bash
# 1. Update the CLI itself
rp1 update

# 2. Update all plugins
rp1 update plugins all
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

**Report to user**: Explain that they need to update the CLI manually and provide the GitHub releases link. Continue with plugin update.

#### Error (Exit Code 1)

The CLI update failed. Example output:
```
Error: brew upgrade failed: Permission denied
```

**Report to user**: Show the error message and suggest checking permissions or trying manual update.

### Plugin Update (`rp1 update plugins all`)

After CLI update, the plugin update command will:

1. Detect all installed agentic tools (Claude Code, OpenCode)
2. Update plugins for each detected tool

Example output:
```
Detecting installed tools...
Found: Claude Code, OpenCode

Updating plugins for Claude Code...
Successfully updated plugins for Claude Code

Updating plugins for OpenCode...
Successfully updated plugins for OpenCode
```

**Report to user**: Confirm which tools had their plugins updated.

## Restart Reminder

After reporting the results, always remind the user:

> Please restart Claude Code (or OpenCode) to use the new version.

This is important because the updated CLI and plugins will not take effect until the IDE is restarted.

## Notes

- `rp1 update` handles CLI self-update using the appropriate package manager (Homebrew, Scoop, or manual)
- `rp1 update plugins all` updates plugins for all detected agentic tools
- The plugin command ensures both CLI and plugins are updated together
- Both commands are safe to run even if already on the latest version
