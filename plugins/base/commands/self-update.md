---
name: self-update
version: 1.0.0
description: Update rp1 to the latest version using the appropriate package manager
tags:
  - utility
  - update
  - maintenance
created: 2025-12-14
author: rp1
---

# Self-Update Command

Update rp1 to the latest version using the appropriate package manager.

## Execution

Run the self-update command via Bash:

```bash
rp1 self-update
```

## Interpreting Results

The command will output one of three outcomes. Report the result to the user accordingly:

### Success (Exit Code 0)

The update completed successfully. Example output:
```
Detecting installation method...
Homebrew installation detected

Updating rp1...
Successfully updated rp1 from 0.2.3 to 0.3.0
```

**Report to user**: Confirm the version change and remind them to restart their IDE.

### Manual Installation Required (Exit Code 2)

Automatic update is not available. Example output:
```
Detecting installation method...
Manual installation detected

Automatic update is not available for manual installations.
Please download the latest version from:
https://github.com/rp1-run/rp1/releases/latest
```

**Report to user**: Explain that they need to update manually and provide the GitHub releases link.

### Error (Exit Code 1)

The update failed. Example output:
```
Error: brew upgrade failed: Permission denied
```

**Report to user**: Show the error message and suggest checking permissions or trying manual update.

## Restart Reminder

After reporting the result, always remind the user:

> Please restart Claude Code (or OpenCode) to use the new version.

This is important because the updated CLI will not take effect until the IDE is restarted.

## Notes

- This command automatically detects the installation method (Homebrew, Scoop, or manual)
- Homebrew users: runs `brew upgrade rp1`
- Scoop users: runs `scoop update rp1`
- Manual installations: provides GitHub release download instructions
- The command is safe to run even if already on the latest version
