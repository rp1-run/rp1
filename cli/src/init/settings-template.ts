export function buildSettingsTomlTemplate(): string {
	return `# rp1 Settings
# Documentation: https://rp1.run/configuration/settings

# Project-level settings are optional.
# Most projects can leave this file with commented examples only.
#
# Directory overrides:
# - project_root: project root used to derive RP1 paths
# - kb_dir: location of KB/context files
# - work_dir: location of work artifacts
#
# Relative paths in project-local settings resolve from the project root.
# Relative paths in global settings resolve from your home directory.
#
# Example:
# [directories]
# project_root = "/absolute/project/path"
# kb_dir = ".rp1/context"
# work_dir = "~/rp1-work/my-project"

# Command default examples:
# [arguments."dev:build"]
# afk = false
# git_commit = false
# git_push = false

# [arguments."dev:build-fast"]
# afk = false
`;
}
