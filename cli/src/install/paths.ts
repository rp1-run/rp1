import { homedir } from "node:os";
import { join } from "node:path";

export interface InstallPathOptions {
	readonly homeDir?: string;
}

export interface InstallPathContext {
	readonly homeDir: string;
	readonly openCodeConfigDir: string;
	readonly openCodeConfigPath: string;
	readonly openCodePluginsDir: string;
	readonly legacyOpenCodePluginDir: string;
	readonly backupDir: string;
	readonly stagingDir: string;
}

export const resolveInstallPathContext = (
	options: InstallPathOptions = {},
): InstallPathContext => {
	const homeDir = options.homeDir ?? homedir();
	const openCodeConfigDir = join(homeDir, ".config", "opencode");

	return {
		homeDir,
		openCodeConfigDir,
		openCodeConfigPath: join(openCodeConfigDir, "opencode.json"),
		openCodePluginsDir: join(openCodeConfigDir, "plugins"),
		legacyOpenCodePluginDir: join(openCodeConfigDir, "plugin"),
		backupDir: join(homeDir, ".opencode-rp1-backups"),
		stagingDir: join(homeDir, ".config", ".rp1-staging"),
	};
};
