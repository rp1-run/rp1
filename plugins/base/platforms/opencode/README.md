# rp1-base OpenCode Plugin

This directory contains the OpenCode plugin integration for rp1-base, providing version update notifications for OpenCode users.

## Features

- **Session Start Notifications**: Automatically checks for rp1 updates when a new OpenCode session starts
- **Non-blocking**: Version checks run asynchronously and do not delay session startup
- **Graceful Degradation**: Network failures are handled silently without disrupting the user experience

## Installation

### Prerequisites

- OpenCode installed and configured
- rp1 CLI installed and available in PATH (`rp1 --version` should work)

### Setup

1. Copy the `.opencode` directory to your OpenCode plugins location:

   ```bash
   cp -r plugins/base/.opencode ~/.opencode/plugins/rp1-base-hooks
   ```

2. Verify the plugin is recognized by OpenCode (refer to OpenCode documentation for plugin discovery)

3. Start a new OpenCode session to test the integration

## Files

| File | Description |
|------|-------------|
| `plugin/index.ts` | Main plugin entry point with session.created handler |
| `opencode.json` | Plugin manifest with metadata and event subscriptions |

## How It Works

1. When OpenCode emits a `session.created` event, the plugin executes `rp1 check-update --json`
2. If a newer version is available, a notification is injected into the session context
3. Users can then run `/self-update` to update rp1 to the latest version

## Troubleshooting

### Notification not appearing

- Verify rp1 CLI is installed: `rp1 --version`
- Check if rp1 has a newer version available: `rp1 check-update`
- Ensure the plugin is properly loaded by OpenCode

### Network errors

The plugin handles network errors gracefully. If the version check fails due to network issues, the session continues normally without any error messages.

## Version

This plugin is part of rp1-base and follows the same versioning scheme.
