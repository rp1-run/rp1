/**
 * Asset extraction module for extracting bundled assets to filesystem.
 * Assets are pre-transformed to OpenCode format during build.
 */

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { installError, runtimeError } from "../../shared/errors.js";
import type { AssetEntry, BundledAssets, BundledPlugin } from "./reader.js";

/**
 * Result of extracting plugins to filesystem.
 */
export interface ExtractionResult {
	filesExtracted: number;
	targetDir: string;
	plugins: string[];
}

/**
 * Directory where web-ui assets are cached.
 */
const WEBUI_CACHE_DIR = join(homedir(), ".rp1", "web-ui");

/**
 * File that tracks the cached web-ui version.
 */
const WEBUI_VERSION_FILE = join(WEBUI_CACHE_DIR, ".version");

/**
 * Extract a single asset entry to the filesystem.
 */
const extractAsset = async (
	entry: AssetEntry,
	destPath: string,
	asBinary: boolean = false,
): Promise<void> => {
	await mkdir(dirname(destPath), { recursive: true });

	if (asBinary) {
		const content = await Bun.file(entry.path).arrayBuffer();
		await writeFile(destPath, Buffer.from(content));
	} else {
		const content = await Bun.file(entry.path).text();
		await writeFile(destPath, content);
	}
};

/**
 * Extract a plugin's assets to the target directory.
 * Creates the correct OpenCode directory structure:
 * - agents/{pluginName}-{agent}.md (flat)
 * - skills/{skill}/SKILL.md
 *
 * Assets are already in OpenCode format (pre-transformed during build).
 */
const extractPlugin = async (
	plugin: BundledPlugin,
	targetDir: string,
	onProgress?: (msg: string) => void,
): Promise<number> => {
	let filesExtracted = 0;
	const pluginName = plugin.name; // e.g., "rp1-base"

	// Migrate legacy agent layout for this plugin before extracting.
	// Only inspects the matching legacy directory (e.g., agents/rp1-base/).
	// Only removes known plugin-generated files. Unknown files are preserved.
	// Removes the legacy directory only when empty after migration.
	const agentsDir = join(targetDir, "agents");
	const knownAgentNames = new Set(plugin.agents.map((a) => `${a.name}.md`));
	const legacyDir = join(agentsDir, pluginName);
	try {
		const legacyStat = await stat(legacyDir);
		if (legacyStat.isDirectory()) {
			const legacyEntries = await readdir(legacyDir);
			for (const entry of legacyEntries) {
				if (knownAgentNames.has(entry)) {
					await rm(join(legacyDir, entry));
				}
			}
			const remaining = await readdir(legacyDir);
			if (remaining.length === 0) {
				await rm(legacyDir, { recursive: true });
			}
		}
	} catch {
		// Legacy directory doesn't exist
	}

	// Extract agents as flat namespaced files
	for (const agent of plugin.agents) {
		const destPath = join(
			targetDir,
			"agents",
			`${pluginName}-${agent.name}.md`,
		);
		await extractAsset(agent, destPath);
		filesExtracted++;
	}

	// Extract skills (each entry is a file path relative to skills/, e.g. "rp1-my-skill/SKILL.md")
	for (const skill of plugin.skills) {
		const destPath = join(targetDir, "skills", skill.name);
		await extractAsset(skill, destPath);
		filesExtracted++;
	}

	onProgress?.(`  ${pluginName}: ${filesExtracted} files`);
	return filesExtracted;
};

/**
 * Extract OpenCode plugin from bundled assets.
 * Creates plugin directory at ~/.config/opencode/plugin/{plugin-name}/
 *
 * Returns 0 if no openCodePlugin field exists (graceful handling).
 */
const extractOpenCodePlugin = async (
	plugin: BundledPlugin,
	onProgress?: (msg: string) => void,
): Promise<number> => {
	if (!plugin.openCodePlugin) {
		return 0;
	}

	const pluginsDir = join(homedir(), ".config", "opencode", "plugins");
	await mkdir(pluginsDir, { recursive: true });

	// OpenCode auto-discovers flat .ts files in ~/.config/opencode/plugins/
	const mainFile = plugin.openCodePlugin.files.find((f) =>
		f.name.endsWith("index.ts"),
	);
	if (!mainFile) {
		return 0;
	}

	const targetFile = join(pluginsDir, `${plugin.openCodePlugin.name}.ts`);
	await extractAsset(mainFile, targetFile);

	onProgress?.(`  ${plugin.openCodePlugin.name}: 1 file`);
	return 1;
};

/**
 * Remove legacy singular-form rp1 directories (command/, agent/, skill/).
 * Only removes rp1-namespaced entries to preserve user files.
 * Called during install to clean up artifacts from pre-plural versions.
 */
const removeLegacyDirs = async (
	targetDir: string,
	onProgress?: (msg: string) => void,
): Promise<number> => {
	let filesRemoved = 0;

	// Legacy singular directories to clean up
	const legacyDirs = ["command", "agent", "skill"];

	for (const dirName of legacyDirs) {
		const legacyDir = join(targetDir, dirName);
		try {
			const legacyStat = await stat(legacyDir);
			if (legacyStat.isDirectory()) {
				const entries = await readdir(legacyDir, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.name.startsWith("rp1")) continue;
					const entryPath = join(legacyDir, entry.name);
					await rm(entryPath, { recursive: true });
					filesRemoved++;
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	if (filesRemoved > 0) {
		onProgress?.(`  Cleaned up ${filesRemoved} legacy directories`);
	}

	return filesRemoved;
};

/**
 * Extract all plugin files to OpenCode config directory.
 * This is the main entry point for `install:opencode` from bundled assets.
 */
export const extractPlugins = (
	assets: BundledAssets,
	targetDir: string,
	onProgress?: (msg: string) => void,
): TE.TaskEither<CLIError, ExtractionResult> =>
	TE.tryCatch(
		async () => {
			let filesExtracted = 0;
			const plugins: string[] = [];

			// Clean up legacy singular-form directories before extracting
			await removeLegacyDirs(targetDir, onProgress);

			onProgress?.("Extracting bundled plugins...");

			// Extract base plugin
			filesExtracted += await extractPlugin(
				assets.plugins.base,
				targetDir,
				onProgress,
			);
			plugins.push(assets.plugins.base.name);

			// Extract dev plugin
			filesExtracted += await extractPlugin(
				assets.plugins.dev,
				targetDir,
				onProgress,
			);
			plugins.push(assets.plugins.dev.name);

			// Extract OpenCode plugins (TypeScript hooks)
			// Note: utils is internal-only and excluded from user-facing installs
			const allPlugins = [assets.plugins.base, assets.plugins.dev];

			for (const plugin of allPlugins) {
				filesExtracted += await extractOpenCodePlugin(plugin, onProgress);
			}

			return { filesExtracted, targetDir, plugins };
		},
		(e) => installError("extract-plugins", `Failed to extract plugins: ${e}`),
	);

/**
 * Check if web-ui is already extracted with the correct version.
 */
const checkWebUICache = async (version: string): Promise<boolean> => {
	try {
		const cachedVersion = await Bun.file(WEBUI_VERSION_FILE).text();
		return cachedVersion.trim() === version;
	} catch {
		return false;
	}
};

/**
 * Extract web-ui files to cache directory.
 * Skips extraction if version matches cached version.
 */
export const extractWebUI = (
	assets: BundledAssets,
	onProgress?: (msg: string) => void,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			// Check if already extracted with same version
			if (await checkWebUICache(assets.version)) {
				onProgress?.("Web-UI already cached (version match)");
				return WEBUI_CACHE_DIR;
			}

			onProgress?.("Extracting web-ui assets...");

			// Clean existing cache if any
			try {
				await rm(WEBUI_CACHE_DIR, { recursive: true });
			} catch {
				// Directory doesn't exist, that's fine
			}

			// Extract all web-ui files
			let filesExtracted = 0;
			for (const file of assets.webui) {
				// Determine if this is a binary file (images, fonts, etc.)
				const isBinary =
					file.name.endsWith(".woff2") ||
					file.name.endsWith(".woff") ||
					file.name.endsWith(".ttf") ||
					file.name.endsWith(".eot") ||
					file.name.endsWith(".png") ||
					file.name.endsWith(".jpg") ||
					file.name.endsWith(".jpeg") ||
					file.name.endsWith(".gif") ||
					file.name.endsWith(".ico") ||
					file.name.endsWith(".webp");

				const destPath = join(WEBUI_CACHE_DIR, file.name);
				await extractAsset(file, destPath, isBinary);
				filesExtracted++;
			}

			// Write version marker
			await mkdir(WEBUI_CACHE_DIR, { recursive: true });
			await writeFile(WEBUI_VERSION_FILE, assets.version);

			onProgress?.(`  Extracted ${filesExtracted} web-ui files`);
			return WEBUI_CACHE_DIR;
		},
		(e) => runtimeError(`Failed to extract web-ui: ${e}`),
	);

/**
 * Get web-ui directory, extracting if necessary.
 * Returns the path to the web-ui files (either cached or freshly extracted).
 */
export const getWebUIDir = (
	assets: BundledAssets,
	onProgress?: (msg: string) => void,
): TE.TaskEither<CLIError, string> =>
	pipe(
		TE.tryCatch(
			async (): Promise<string | null> => {
				if (await checkWebUICache(assets.version)) {
					return WEBUI_CACHE_DIR;
				}
				// Need to extract
				return null;
			},
			(e): CLIError => runtimeError(`Failed to check web-ui cache: ${e}`),
		),
		TE.chain((cached) =>
			cached !== null ? TE.right(cached) : extractWebUI(assets, onProgress),
		),
	);

/**
 * Get the web-ui cache directory path (for reference).
 */
export const getWebUICacheDir = (): string => WEBUI_CACHE_DIR;
