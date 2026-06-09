import { readFile, stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type {
	AssetEntry,
	BundledAssets,
	BundledPlatform,
	BundledPlugin,
	PluginKey,
} from "../../assets/reader.js";
import {
	ALL_PLUGIN_KEYS,
	getBundledAssets,
	hasBundledAssets,
} from "../../assets/reader.js";
import type { GooseAssetKind, GooseAssetManifestEntry } from "./lifecycle.js";

export interface GooseBundleAssetManifestOptions {
	readonly assetManifest?: readonly GooseAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

interface AssetSource {
	readonly pluginName: string;
	readonly kind: GooseAssetKind;
	readonly entry: AssetEntry;
	readonly destination: string;
}

const GOOSE_PLATFORM_ID = "goose";
const GOOSE_SKILLS_ROOT = ".agents/skills";
const GOOSE_AGENTS_ROOT = ".agents/agents";
const GOOSE_RECIPES_ROOT = ".agents/recipes";
const GOOSE_PLUGINS_ROOT = ".agents/plugins";

export const GOOSE_BUNDLE_DIR_ENV = "RP1_GOOSE_BUNDLE_DIR";

export const gooseSkillsRelativeRoot = (): string => GOOSE_SKILLS_ROOT;
export const gooseAgentsRelativeRoot = (): string => GOOSE_AGENTS_ROOT;
export const gooseRecipesRelativeRoot = (): string => GOOSE_RECIPES_ROOT;
export const goosePluginsRelativeRoot = (): string => GOOSE_PLUGINS_ROOT;

export const gooseSkillsDisplayRoot = (): string => "~/.agents/skills";
export const gooseAgentsDisplayRoot = (): string => "~/.agents/agents";
export const gooseRecipesDisplayRoot = (): string => "~/.agents/recipes";
export const goosePluginsDisplayRoot = (): string => "~/.agents/plugins";

export const goosePluginNameFromDisplayDir = (displayDir: string): string =>
	displayDir.split("/").at(-1) ?? displayDir;

const toPosixPath = (path: string): string => path.split(sep).join("/");

const entryFileName = (entry: AssetEntry): string =>
	entry.fileName ?? (basename(entry.path) || entry.name);

const skillDestination = (entry: AssetEntry): string => {
	const fileName = entry.fileName;
	if (fileName) return fileName.replace(/^skills\//, "");
	return entry.name.replace(/^skills\//, "");
};

const agentDestination = (entry: AssetEntry): string => entryFileName(entry);

const recipeDestination = (entry: AssetEntry): string =>
	entry.fileName ?? entry.name;

const metadataDestination = (pluginName: string, entry: AssetEntry): string =>
	join(pluginName, entry.fileName ?? entry.name);

const verbatimKind = (entry: AssetEntry): GooseAssetKind => {
	const path = entry.fileName ?? entry.path;
	if (path.includes("/recipes/") || entry.name.endsWith(".yaml")) {
		return "recipe";
	}
	if (entry.name === "support-metadata.json") return "support_metadata";
	if (entry.name === "manifest.json") return "plugin_manifest";
	return "metadata";
};

const collectPluginAssetSources = (
	_pluginKey: PluginKey,
	plugin: BundledPlugin,
): readonly AssetSource[] => [
	...plugin.skills.map((entry) => ({
		pluginName: plugin.name,
		kind: "skill" as const,
		entry,
		destination: skillDestination(entry),
	})),
	...plugin.agents.map((entry) => ({
		pluginName: plugin.name,
		kind: "agent" as const,
		entry,
		destination: agentDestination(entry),
	})),
	...plugin.verbatimFiles.map((entry) => {
		const kind = verbatimKind(entry);
		return {
			pluginName: plugin.name,
			kind,
			entry,
			destination:
				kind === "recipe"
					? recipeDestination(entry)
					: metadataDestination(plugin.name, entry),
		};
	}),
];

const readEntryContent = async (
	distDir: string | null,
	entry: AssetEntry,
): Promise<string> => {
	if (entry.content !== undefined) return entry.content;
	if (distDir) return readFile(join(distDir, entry.path), "utf-8");
	return Bun.file(entry.path).text();
};

const assetDisplayPath = (relativePath: string): string =>
	`~/${relativePath.replace(/\\/g, "/")}`;

const relativePathFor = (source: AssetSource): string => {
	switch (source.kind) {
		case "skill":
			return toPosixPath(join(GOOSE_SKILLS_ROOT, source.destination));
		case "agent":
			return toPosixPath(join(GOOSE_AGENTS_ROOT, source.destination));
		case "recipe":
			return toPosixPath(join(GOOSE_RECIPES_ROOT, source.destination));
		case "plugin_manifest":
		case "support_metadata":
		case "metadata":
			return toPosixPath(join(GOOSE_PLUGINS_ROOT, source.destination));
	}
};

const buildAssetManifestFromPlatform = async (
	platform: BundledPlatform,
	distDir: string | null,
): Promise<readonly GooseAssetManifestEntry[]> => {
	const assets: GooseAssetManifestEntry[] = [];

	for (const pluginKey of ALL_PLUGIN_KEYS) {
		const plugin = platform.plugins[pluginKey];
		if (!plugin) continue;

		for (const source of collectPluginAssetSources(pluginKey, plugin)) {
			const relativePath = relativePathFor(source);
			assets.push({
				relativePath,
				displayPath: assetDisplayPath(relativePath),
				kind: source.kind,
				owner: "rp1",
				contentCheck: "exact_content",
				expectedContent: await readEntryContent(distDir, source.entry),
				safeRemovalEligible: true,
				lifecycleStages: ["install", "verify", "update", "uninstall"],
			});
		}
	}

	return assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
};

const resolveGooseDistDir = async (
	explicitDistDir?: string,
): Promise<string> => {
	const envDir = process.env[GOOSE_BUNDLE_DIR_ENV];
	const candidates = [
		explicitDistDir,
		envDir,
		join(process.cwd(), "dist", GOOSE_PLATFORM_ID),
		join(process.cwd(), "..", "dist", GOOSE_PLATFORM_ID),
		join(import.meta.dir, "..", "..", "..", "..", "dist", GOOSE_PLATFORM_ID),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		try {
			const s = await stat(candidate);
			if (s.isDirectory()) return candidate;
		} catch {}
	}

	throw new Error(
		"Cannot find Goose assets under dist/goose. Run `rp1 build --platform goose` first.",
	);
};

const loadGoosePlatformFromDist = async (
	distDir?: string,
): Promise<{
	readonly platform: BundledPlatform;
	readonly distDir: string;
}> => {
	const resolvedDistDir = await resolveGooseDistDir(distDir);
	const raw = await readFile(
		join(resolvedDistDir, "bundle-manifest.json"),
		"utf-8",
	);
	const manifest = JSON.parse(raw) as BundledPlatform;
	const platformId = manifest.platform?.id;
	if (platformId !== GOOSE_PLATFORM_ID) {
		throw new Error(
			`Expected Goose bundle manifest at ${resolvedDistDir}, found ${platformId ?? "unknown"} platform.`,
		);
	}
	return {
		platform: manifest,
		distDir: resolvedDistDir,
	};
};

const goosePlatformFromBundledAssets = (
	assets: BundledAssets,
): BundledPlatform => {
	const platform = assets.platforms[GOOSE_PLATFORM_ID];
	if (!platform) {
		throw new Error("Embedded assets do not contain a Goose platform bundle.");
	}
	if (platform.platform?.id !== GOOSE_PLATFORM_ID) {
		throw new Error(
			`Embedded Goose bundle metadata is for ${platform.platform?.id ?? "unknown"} platform.`,
		);
	}
	return platform;
};

export const loadGooseBundleAssetManifest = async (
	options: GooseBundleAssetManifestOptions = {},
): Promise<readonly GooseAssetManifestEntry[]> => {
	if (options.assetManifest) return options.assetManifest;

	if (options.distDir || process.env[GOOSE_BUNDLE_DIR_ENV]) {
		const fromDist = await loadGoosePlatformFromDist(options.distDir);
		return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
	}

	if (options.bundledAssets) {
		return buildAssetManifestFromPlatform(
			goosePlatformFromBundledAssets(options.bundledAssets),
			null,
		);
	}

	if (hasBundledAssets()) {
		const bundledAssets = getBundledAssets();
		if (E.isRight(bundledAssets)) {
			return buildAssetManifestFromPlatform(
				goosePlatformFromBundledAssets(bundledAssets.right),
				null,
			);
		}
	}

	const fromDist = await loadGoosePlatformFromDist(options.distDir);
	return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
};

export const getGooseManifestAsset = async (
	relativePath: string,
	options: GooseBundleAssetManifestOptions = {},
): Promise<GooseAssetManifestEntry | undefined> => {
	const assets = await loadGooseBundleAssetManifest(options);
	return assets.find((entry) => entry.relativePath === relativePath);
};
