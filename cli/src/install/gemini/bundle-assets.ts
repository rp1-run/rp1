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
import type { GeminiAssetKind, GeminiAssetManifestEntry } from "./lifecycle.js";

export interface GeminiBundleAssetManifestOptions {
	readonly assetManifest?: readonly GeminiAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

interface AssetSource {
	readonly pluginKey: PluginKey;
	readonly pluginName: string;
	readonly kind: GeminiAssetKind;
	readonly entry: AssetEntry;
	readonly destination: string;
}

const GEMINI_EXTENSION_ROOT = ".gemini/extensions";
const GEMINI_EXTENSION_DISPLAY_ROOT = "~/.gemini/extensions";
const GEMINI_PLATFORM_ID = "gemini";

export const GEMINI_BUNDLE_DIR_ENV = "RP1_GEMINI_BUNDLE_DIR";

export const geminiExtensionRelativeRoot = (): string => GEMINI_EXTENSION_ROOT;

export const geminiExtensionDisplayRoot = (): string =>
	GEMINI_EXTENSION_DISPLAY_ROOT;

export const geminiExtensionNameFromDisplayDir = (displayDir: string): string =>
	displayDir.split("/").at(-1) ?? displayDir;

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

const skillDestination = (entry: AssetEntry): string =>
	join("skills", entry.name);

const stateMachineDestination = (entry: AssetEntry): string =>
	join("state-machines", `${entry.name}.mmd`);

const verbatimDestination = (pluginKey: PluginKey, entry: AssetEntry): string =>
	relativeAssetPath(pluginKey, entry, entry.name);

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
		destination: skillDestination(entry),
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
		kind:
			entry.name === "gemini-extension.json"
				? ("extension_manifest" as const)
				: entry.name === "GEMINI.md"
					? ("context" as const)
					: entry.name === "support-matrix.json"
						? ("support_matrix" as const)
						: ("metadata" as const),
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
	toPosixPath(join(GEMINI_EXTENSION_ROOT, pluginName, destination));

const buildAssetManifestFromPlatform = async (
	platform: BundledPlatform,
	distDir: string | null,
): Promise<readonly GeminiAssetManifestEntry[]> => {
	const assets: GeminiAssetManifestEntry[] = [];

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

const resolveGeminiDistDir = async (
	explicitDistDir?: string,
): Promise<string> => {
	const envDir = process.env[GEMINI_BUNDLE_DIR_ENV];
	const candidates = [
		explicitDistDir,
		envDir,
		join(process.cwd(), "dist", GEMINI_PLATFORM_ID),
		join(process.cwd(), "..", "dist", GEMINI_PLATFORM_ID),
		join(import.meta.dir, "..", "..", "..", "..", "dist", GEMINI_PLATFORM_ID),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		try {
			const s = await stat(candidate);
			if (s.isDirectory()) return candidate;
		} catch {}
	}

	throw new Error(
		`Cannot find dist/gemini bundle assets. Run \`rp1 build --platform gemini\` first.`,
	);
};

const loadGeminiPlatformFromDist = async (
	distDir?: string,
): Promise<{
	readonly platform: BundledPlatform;
	readonly distDir: string;
}> => {
	const resolvedDistDir = await resolveGeminiDistDir(distDir);
	const raw = await readFile(
		join(resolvedDistDir, "bundle-manifest.json"),
		"utf-8",
	);
	const manifest = JSON.parse(raw) as BundledPlatform;
	const platformId = manifest.platform?.id;
	if (platformId !== GEMINI_PLATFORM_ID) {
		throw new Error(
			`Expected Gemini bundle manifest at ${resolvedDistDir}, found ${platformId ?? "unknown"} platform.`,
		);
	}
	return {
		platform: manifest,
		distDir: resolvedDistDir,
	};
};

const geminiPlatformFromBundledAssets = (
	assets: BundledAssets,
): BundledPlatform => {
	const platform = assets.platforms[GEMINI_PLATFORM_ID];
	if (!platform) {
		throw new Error("Embedded assets do not contain a Gemini platform bundle.");
	}
	if (platform.platform?.id !== GEMINI_PLATFORM_ID) {
		throw new Error(
			`Embedded Gemini bundle metadata is for ${platform.platform?.id ?? "unknown"} platform.`,
		);
	}
	return platform;
};

export const loadGeminiBundleAssetManifest = async (
	options: GeminiBundleAssetManifestOptions = {},
): Promise<readonly GeminiAssetManifestEntry[]> => {
	if (options.assetManifest) return options.assetManifest;

	if (options.distDir || process.env[GEMINI_BUNDLE_DIR_ENV]) {
		const fromDist = await loadGeminiPlatformFromDist(options.distDir);
		return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
	}

	if (options.bundledAssets) {
		return buildAssetManifestFromPlatform(
			geminiPlatformFromBundledAssets(options.bundledAssets),
			null,
		);
	}

	if (hasBundledAssets()) {
		const bundledAssets = getBundledAssets();
		if (E.isRight(bundledAssets)) {
			return buildAssetManifestFromPlatform(
				geminiPlatformFromBundledAssets(bundledAssets.right),
				null,
			);
		}
	}

	const fromDist = await loadGeminiPlatformFromDist(options.distDir);
	return buildAssetManifestFromPlatform(fromDist.platform, fromDist.distDir);
};

export const getGeminiManifestAsset = async (
	relativePath: string,
	options: GeminiBundleAssetManifestOptions = {},
): Promise<GeminiAssetManifestEntry | undefined> => {
	const assets = await loadGeminiBundleAssetManifest(options);
	return assets.find((entry) => entry.relativePath === relativePath);
};
