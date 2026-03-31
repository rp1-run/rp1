import { homedir } from "node:os";
import { join } from "node:path";

export const resolveGlobalSettingsPath = (): string =>
	join(homedir(), ".config", "rp1", "settings.toml");

export const resolveLocalSettingsPath = (cwd: string = process.cwd()): string =>
	join(cwd, ".rp1", "settings.toml");
