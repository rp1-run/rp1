export function buildSettingsTomlTemplate(): string {
	return `# rp1 Settings
# Documentation: https://rp1.run/configuration/settings

# Storage mode: "central" stores KB and work artifacts under ~/.rp1/projects/<id>/
# instead of inside the repo tree, eliminating git churn from rp1-generated files.
# "local" keeps artifacts under .rp1/ in the project directory (legacy default).
[storage]
mode = "central"

# Command default examples:
# [arguments."dev:build"]
# afk = false
# git_commit = false
# git_push = false

# [arguments."dev:build-fast"]
# afk = false
`;
}

/**
 * Template for the user-global settings file (~/.config/rp1/settings.toml).
 *
 * Deliberately does NOT set an active [storage] section: the global file is a
 * fallback for every project on the machine, so an active mode here would
 * silently flip existing local-mode projects to central. Central mode is a
 * per-project opt-in written into the project's .rp1/settings.toml.
 */
export function buildGlobalSettingsTomlTemplate(): string {
	return `# rp1 Global Settings
# Documentation: https://rp1.run/configuration/settings

# Storage mode is a per-project setting written to <project>/.rp1/settings.toml
# during init. Setting it here would apply to every project on this machine
# that does not set its own mode, so leave it commented unless that is intended.
# [storage]
# mode = "central"

# Command default examples:
# [arguments."dev:build"]
# afk = false
# git_commit = false
# git_push = false

# [arguments."dev:build-fast"]
# afk = false
`;
}
