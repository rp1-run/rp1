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
