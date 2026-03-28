/**
 * Platform-generic asset extraction module.
 * Extracts plugin files from EMBEDDED_MANIFEST to filesystem for any platform,
 * or falls back to copying from dist/ in dev mode.
 */

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { installError } from "../../shared/errors.js";
import type {
	AssetEntry,
	BundledPlatform,
	BundledPlugin,
	PluginKey,
} from "../assets/reader.js";
import {
	ALL_PLUGIN_KEYS,
	getBundledAssets,
	hasBundledAssets,
} from "../assets/reader.js";
import type { BuildPlatform } from "../build/template-context.js";

/**
 * Options for extracting platform assets.
 */
export interface ExtractOptions {
	readonly platform: BuildPlatform;
	readonly targetDir: string;
	readonly plugins?: readonly string[];
}

/**
 * Result of extracting platform assets to filesystem.
 */
export interface ExtractionResult {
	readonly filesExtracted: number;
	readonly pluginsExtracted: readonly string[];
	readonly targetDir: string;
}

// Re-export for local use; canonical list lives in reader.ts
const PLUGIN_KEYS = ALL_PLUGIN_KEYS;

/**
 * Determine file mode based on extension. Shell scripts get execute permission.
 */
const fileMode = (path: string): number =>
	extname(path) === ".sh" ? 0o755 : 0o644;

/**
 * Write a single embedded asset entry to the filesystem.
 * Reads from the Bun blob path and writes text content.
 */
const writeAssetEntry = async (
	entry: AssetEntry,
	destPath: string,
): Promise<void> => {
	await mkdir(dirname(destPath), { recursive: true });
	const mode = fileMode(destPath);

	if (entry.content !== undefined) {
		await writeFile(destPath, entry.content, { mode });
	} else {
		const content = await Bun.file(entry.path).text();
		await writeFile(destPath, content, { mode });
	}
};

/**
 * Extract all asset entries for a single plugin from the embedded manifest.
 * Writes agents, skills, commands, and stateMachines to the target directory
 * preserving the category-based directory structure.
 */
const extractBundledPlugin = async (
	plugin: BundledPlugin,
	pluginKey: string,
	targetDir: string,
	platform?: BuildPlatform,
): Promise<number> => {
	let filesExtracted = 0;
	const pluginDir = join(targetDir, pluginKey);

	for (const agent of plugin.agents) {
		// Codex agents are TOML files with a plugin-prefixed name (e.g., rp1-base-agent-name.toml)
		const agentFileName =
			platform === "codex"
				? `${plugin.name}-${agent.name}.toml`
				: `${agent.name}.md`;
		const destPath = join(pluginDir, "agents", agentFileName);
		await writeAssetEntry(agent, destPath);
		filesExtracted++;
	}

	for (const skill of plugin.skills) {
		const destPath = join(pluginDir, "skills", skill.name);
		await writeAssetEntry(skill, destPath);
		filesExtracted++;
	}

	for (const command of plugin.commands) {
		const destPath = join(pluginDir, "commands", `${command.name}.md`);
		await writeAssetEntry(command, destPath);
		filesExtracted++;
	}

	for (const sm of plugin.stateMachines) {
		if (sm.content !== undefined) {
			const destPath = join(pluginDir, "state-machines", `${sm.name}.mmd`);
			await writeAssetEntry(sm, destPath);
			filesExtracted++;
		}
	}

	for (const file of plugin.verbatimFiles ?? []) {
		const destPath = join(pluginDir, file.name);
		await writeAssetEntry(file, destPath);
		filesExtracted++;
	}

	return filesExtracted;
};

/**
 * Recursively copy a directory tree, setting 644 for files and 755 for directories.
 * Returns the number of files copied.
 */
const copyDirRecursive = async (src: string, dst: string): Promise<number> => {
	await mkdir(dst, { recursive: true, mode: 0o755 });
	let count = 0;

	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const dstPath = join(dst, entry.name);

		if (entry.isDirectory()) {
			count += await copyDirRecursive(srcPath, dstPath);
		} else {
			await copyFile(srcPath, dstPath);
			count++;
		}
	}

	return count;
};

/**
 * Resolve which plugin keys to extract based on available plugins and filter.
 */
const resolvePluginKeys = (
	platform: BundledPlatform,
	filter?: readonly string[],
): PluginKey[] => {
	const available = PLUGIN_KEYS.filter(
		(key) => platform.plugins[key] !== undefined,
	);

	if (!filter || filter.length === 0) {
		return available;
	}

	return available.filter((key) => {
		const plugin = platform.plugins[key];
		return (
			plugin !== undefined &&
			(filter.includes(key) || filter.includes(plugin.name))
		);
	});
};

/**
 * Extract platform plugin assets from the compiled binary's EMBEDDED_MANIFEST
 * to a target directory on the filesystem.
 *
 * When IS_BUNDLED is false (dev mode), falls back to copying from dist/ directory.
 */
export const extractPlatformAssets = (
	opts: ExtractOptions,
): TE.TaskEither<CLIError, ExtractionResult> =>
	pipe(hasBundledAssets() ? extractFromEmbedded(opts) : extractFromDist(opts));

/**
 * Extract assets from the embedded manifest (bundled binary mode).
 */
const extractFromEmbedded = (
	opts: ExtractOptions,
): TE.TaskEither<CLIError, ExtractionResult> =>
	TE.tryCatch(
		async () => {
			const assetsResult = getBundledAssets();
			if (E.isLeft(assetsResult)) {
				throw new Error("Failed to load embedded manifest");
			}

			const assets = assetsResult.right;
			const platform = assets.platforms[opts.platform];
			if (!platform) {
				throw new Error(
					`No ${opts.platform} platform found in embedded manifest. ` +
						"Ensure the binary was built with assets for this platform.",
				);
			}

			const keysToExtract = resolvePluginKeys(platform, opts.plugins);
			if (keysToExtract.length === 0) {
				throw new Error(
					`No matching plugins found for platform ${opts.platform}. ` +
						`Available: ${PLUGIN_KEYS.filter((k) => platform.plugins[k]).join(", ")}`,
				);
			}

			let filesExtracted = 0;
			const pluginsExtracted: string[] = [];

			for (const key of keysToExtract) {
				const plugin = platform.plugins[key];
				if (!plugin) continue;

				const count = await extractBundledPlugin(
					plugin,
					key,
					opts.targetDir,
					opts.platform,
				);
				filesExtracted += count;
				pluginsExtracted.push(plugin.name);
			}

			return {
				filesExtracted,
				pluginsExtracted,
				targetDir: opts.targetDir,
			};
		},
		(e) =>
			installError(
				"extract-assets",
				`Failed to extract ${opts.platform} assets from embedded manifest: ${e}`,
			),
	);

/**
 * Extract assets by copying from the dist/ directory (dev mode fallback).
 * Finds the project root by looking for dist/ relative to the module location.
 */
const extractFromDist = (
	opts: ExtractOptions,
): TE.TaskEither<CLIError, ExtractionResult> =>
	TE.tryCatch(
		async () => {
			const distDir = await resolveDistDir(opts.platform);

			const entries = await readdir(distDir, { withFileTypes: true });
			const pluginDirs = entries
				.filter((e) => e.isDirectory())
				.map((e) => e.name);

			const filteredDirs = opts.plugins
				? pluginDirs.filter(
						(dir) =>
							opts.plugins!.includes(dir) ||
							opts.plugins!.includes(`rp1-${dir}`),
					)
				: pluginDirs;

			if (filteredDirs.length === 0) {
				throw new Error(
					`No plugin directories found in ${distDir}. ` +
						"Run the build command first.",
				);
			}

			let filesExtracted = 0;
			const pluginsExtracted: string[] = [];

			for (const dir of filteredDirs) {
				const srcDir = join(distDir, dir);
				const dstDir = join(opts.targetDir, dir);
				const count = await copyDirRecursive(srcDir, dstDir);
				filesExtracted += count;
				pluginsExtracted.push(`rp1-${dir}`);
			}

			return {
				filesExtracted,
				pluginsExtracted,
				targetDir: opts.targetDir,
			};
		},
		(e) =>
			installError(
				"extract-assets",
				`Failed to extract ${opts.platform} assets from dist/: ${e}`,
			),
	);

/**
 * Resolve the dist/ directory for a given platform.
 * Walks up from the current module location to find the project root.
 */
const resolveDistDir = async (platform: BuildPlatform): Promise<string> => {
	// Try common project root locations
	const candidates = [
		join(process.cwd(), "dist", platform),
		join(import.meta.dir, "..", "..", "..", "..", "dist", platform),
	];

	for (const candidate of candidates) {
		try {
			const s = await stat(candidate);
			if (s.isDirectory()) {
				return candidate;
			}
		} catch {
			// Try next candidate
		}
	}

	throw new Error(
		`Cannot find dist/${platform}/ directory. ` +
			`Build ${platform} artifacts first: rp1 build --platform ${platform}`,
	);
};
