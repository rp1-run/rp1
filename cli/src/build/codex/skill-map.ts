/**
 * Discovers skill-to-plugin mapping from the plugins directory.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Scans plugins/{base,dev,utils}/skills/* and returns a map of skill name to plugin name.
 * Only directories containing a SKILL.md file are included.
 */
export const discoverSkillMap = (
	projectRoot: string,
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	const plugins = ["base", "dev", "utils"];

	for (const plugin of plugins) {
		const skillsDir = join(projectRoot, "plugins", plugin, "skills");
		let entries: string[];
		try {
			entries = readdirSync(skillsDir);
		} catch {
			continue;
		}

		for (const entry of entries) {
			const entryPath = join(skillsDir, entry);
			try {
				if (!statSync(entryPath).isDirectory()) continue;
				statSync(join(entryPath, "SKILL.md"));
				map.set(entry, plugin);
			} catch {}
		}
	}

	return map;
};
