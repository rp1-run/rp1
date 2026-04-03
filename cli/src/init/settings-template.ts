export function buildSettingsTomlTemplate(): string {
	return `# rp1 Settings
# Documentation: https://rp1.run/configuration/settings

# Project-level settings are optional.
# Most projects can leave this file with commented examples only.
#
# Directory paths are fixed from the project root:
# - Knowledge base files live in .rp1/context
# - Work artifacts live in .rp1/work
# Use this file for command defaults only.

# Command default examples:
# [arguments."dev:build"]
# afk = false
# git_commit = false
# git_push = false

# [arguments."dev:build-fast"]
# afk = false
`;
}
