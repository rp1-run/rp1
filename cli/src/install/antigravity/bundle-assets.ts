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
import type {
	AntigravityAssetKind,
	AntigravityAssetManifestEntry,
} from "./lifecycle.js";

export interface AntigravityBundleAssetManifestOptions {
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

interface AssetSource {
	readonly pluginKey: PluginKey;
	readonly pluginName: string;
	readonly kind: AntigravityAssetKind;
	readonly entry: AssetEntry;
	readonly destination: string;
}

const ANTIGRAVITY_PACKAGE_ROOT = ".gemini/antigravity-cli";
const ANTIGRAVITY_PACKAGE_DISPLAY_ROOT = "~/.gemini/antigravity-cli";
const ANTIGRAVITY_PLATFORM_ID = "antigravity";

export const ANTIGRAVITY_BUNDLE_DIR_ENV = "RP1_ANTIGRAVITY_BUNDLE_DIR";

export const antigravityPackageRelativeRoot = (): string =>
	ANTIGRAVITY_PACKAGE_ROOT;

export const antigravityPackageDisplayRoot = (): string =>
	ANTIGRAVITY_PACKAGE_DISPLAY_ROOT;

export const antigravityPackageNameFromDisplayDir = (
	displayDir: string,
): string => displayDir.split("/").at(-1) ?? displayDir;

const toPosixPath = (path: string): string => path.split(sep).join("/");

const relativeAssetPath = (
	pluginKey: PluginKey,
	entry: AssetEntry,
	fallbackName: string,
): string => {
	if (entry.fileName) return entry.fileName;

	const prefix = `${pluginKey}/`;
	if (entry.path.startsWith(prefix)) {
		return entry.path.slice(prefix.length);
	}

	return fallbackName;
};

const commandDestination = (
	pluginKey: PluginKey,
	entry: AssetEntry,
): string => {
	const relativePath = relativeAssetPath(pluginKey, entry, entry.name);
	return relativePath.startsWith("commands/")
		? relativePath
		: join("commands", relativePath);
};

const agentDestination = (pluginKey: PluginKey, entry: AssetEntry): string => {
	const relativePath = relativeAssetPath(
		pluginKey,
		entry,
		basename(entry.path) || entry.name,
	);
	return relativePath.startsWith("agents/")
		? relativePath
		: join("agents", relativePath);
};

const skillDestination = (pluginKey: PluginKey, entry: AssetEntry): string => {
	const relativePath = relativeAssetPath(pluginKey, entry, entry.name);
	return relativePath.startsWith("skills/")
		? relativePath
		: join("skills", relativePath);
};

const stateMachineDestination = (entry: AssetEntry): string =>
	join("state-machines", `${entry.name}.json`);

const verbatimDestination = (pluginKey: PluginKey, entry: AssetEntry): string =>
	relativeAssetPath(pluginKey, entry, entry.name);

const verbatimKind = (entry: AssetEntry): AntigravityAssetKind => {
	const path = entry.fileName ?? entry.path;
	if (entry.name === "plugin.json") return "plugin_manifest";
	if (entry.name === "AGENTS.md") return "context";
	if (path.endsWith("hooks/hooks.json")) return "hooks";
	if (entry.name === "mcp_config.json") return "mcp_config";
	if (path.includes("rules/")) return "rules";
	if (entry.name === "support-matrix.json") return "support_matrix";
	if (entry.name === "support-metadata.json") return "support_metadata";
	if (path.includes("delegation-definitions/")) {
		return "delegation_definition";
	}
	return "metadata";
};

const collectPluginAssetSources = (
	pluginKey: PluginKey,
	plugin: BundledPlugin,
): readonly AssetSource[] => [
	...plugin.commands.map((entry) => ({
		pluginKey,
		pluginName: plugin.name,
		kind: "command" as const,
		entry,
		destination: commandDestination(pluginKey, entry),
	})),
	...plugin.agents.map((entry) => ({
		pluginKey,
		pluginName: plugin.name,
		kind: "agent" as const,
		entry,
		destination: agentDestination(pluginKey, entry),
	})),
	...plugin.skills.map((entry) => ({
		pluginKey,
		pluginName: plugin.name,
		kind: "skill" as const,
		entry,
		destination: skillDestination(pluginKey, entry),
	})),
	...plugin.stateMachines.map((entry) => ({
		pluginKey,
		pluginName: plugin.name,
		kind: "state_machine" as const,
		entry,
		destination: stateMachineDestination(entry),
	})),
	...plugin.verbatimFiles.map((entry) => ({
		pluginKey,
		pluginName: plugin.name,
		kind: verbatimKind(entry),
		entry,
		destination: verbatimDestination(pluginKey, entry),
	})),
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

const assetRelativePath = (pluginName: string, destination: string): string =>
	toPosixPath(join(ANTIGRAVITY_PACKAGE_ROOT, pluginName, destination));

const buildAssetManifestFromPlatform = async (
	platform: BundledPlatform,
	distDir: string | null,
): Promise<readonly AntigravityAssetManifestEntry[]> => {
	const assets: AntigravityAssetManifestEntry[] = [];

	for (const pluginKey of ALL_PLUGIN_KEYS) {
		const plugin = platform.plugins[pluginKey];
		if (!plugin) continue;

		for (const source of collectPluginAssetSources(pluginKey, plugin)) {
			const relativePath = assetRelativePath(
				source.pluginName,
				source.destination,
			);
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

const resolveAntigravityDistDir = async (
	explicitDistDir?: string,
): Promise<string> => {
	const envDir = process.env[ANTIGRAVITY_BUNDLE_DIR_ENV];
	const candidates = [
		explicitDistDir,
		envDir,
		join(process.cwd(), "dist", ANTIGRAVITY_PLATFORM_ID),
		join(process.cwd(), "..", "dist", ANTIGRAVITY_PLATFORM_ID),
		join(
			import.meta.dir,
			"..",
			"..",
			"..",
			"..",
			"dist",
			ANTIGRAVITY_PLATFORM_ID,
		),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		try {
			const s = await stat(candidate);
			if (s.isDirectory()) return candidate;
		} catch {}
	}

	throw new Error(
		"Cannot find Antigravity assets under dist/antigravity. Run `rp1 build --platform antigravity` first.",
	);
};

const loadAntigravityPlatformFromDist = async (
	distDir?: string,
): Promise<{
	readonly platform: BundledPlatform;
	readonly distDir: string;
}> => {
	const resolvedDistDir = await resolveAntigravityDistDir(distDir);
	const raw = await readFile(
		join(resolvedDistDir, "bundle-manifest.json"),
		"utf-8",
	);
	const manifest = JSON.parse(raw) as BundledPlatform;
	const platformId = manifest.platform?.id;
	if (platformId !== ANTIGRAVITY_PLATFORM_ID) {
		throw new Error(
			`Expected Antigravity bundle manifest at ${resolvedDistDir}, found ${platformId ?? "unknown"} platform.`,
		);
	}
	return {
		platform: manifest,
		distDir: resolvedDistDir,
	};
};

const antigravityPlatformFromBundledAssets = (
	assets: BundledAssets,
): BundledPlatform => {
	const platform = assets.platforms[ANTIGRAVITY_PLATFORM_ID];
	if (!platform) {
		throw new Error(
			"Embedded assets do not contain an Antigravity platform bundle.",
		);
	}
	if (platform.platform?.id !== ANTIGRAVITY_PLATFORM_ID) {
		throw new Error(
			`Embedded Antigravity bundle metadata is for ${platform.platform?.id ?? "unknown"} platform.`,
		);
	}
	return platform;
};

export const loadAntigravityBundleAssetManifest = async (
	options: AntigravityBundleAssetManifestOptions = {},
): Promise<readonly AntigravityAssetManifestEntry[]> => {
	if (options.assetManifest) return options.assetManifest;

	if (options.distDir || process.env[ANTIGRAVITY_BUNDLE_DIR_ENV]) {
		const fromDist = await loadAntigravityPlatformFromDist(options.distDir);
		return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
	}

	if (options.bundledAssets) {
		return buildAssetManifestFromPlatform(
			antigravityPlatformFromBundledAssets(options.bundledAssets),
			null,
		);
	}

	if (hasBundledAssets()) {
		const bundledAssets = getBundledAssets();
		if (E.isRight(bundledAssets)) {
			return buildAssetManifestFromPlatform(
				antigravityPlatformFromBundledAssets(bundledAssets.right),
				null,
			);
		}
	}

	const fromDist = await loadAntigravityPlatformFromDist(options.distDir);
	return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
};

export const getAntigravityManifestAsset = async (
	relativePath: string,
	options: AntigravityBundleAssetManifestOptions = {},
): Promise<AntigravityAssetManifestEntry | undefined> => {
	const assets = await loadAntigravityBundleAssetManifest(options);
	return assets.find((entry) => entry.relativePath === relativePath);
};
