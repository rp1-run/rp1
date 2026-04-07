import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { OPTIONAL_PLUGINS, REQUIRED_PLUGINS } from "../../assets/reader.js";
import { readVersionMarker } from "../version-marker.js";
import { MARKETPLACE_NAME } from "./marketplace.js";
import {
	type CommandResult,
	getCopilotPaths,
	runGhCommand,
} from "./prerequisites.js";

export type CopilotVerificationState =
	| "healthy_native"
	| "partial_native"
	| "legacy_only"
	| "mixed_native_and_legacy"
	| "not_installed";

export interface CopilotPluginVerification {
	readonly name: string;
	readonly required: boolean;
	readonly listedInCopilot: boolean;
	readonly installed: boolean;
	readonly version: string | null;
	readonly expectedVersion: string | null;
	readonly nativeInstalledLocation: string | null;
	readonly marketplaceLocation: string | null;
	readonly issues: readonly string[];
}

export interface CopilotVerificationResult {
	readonly state: CopilotVerificationState;
	readonly verified: boolean;
	readonly ghInstalled: boolean;
	readonly ghVersion: string | null;
	readonly pluginListAvailable: boolean;
	readonly plugins: readonly CopilotPluginVerification[];
	readonly legacyFootprints: readonly string[];
	readonly issues: readonly string[];
	readonly remediation: readonly string[];
}

interface ParsedInstalledPlugin {
	readonly name: string;
	readonly marketplace: string;
	readonly version: string | null;
}

interface CopilotVerifierDeps {
	readonly getGhBinaryPath?: () => string | null;
	readonly paths?: ReturnType<typeof getCopilotPaths>;
	readonly requiredPlugins?: readonly string[];
	readonly optionalPlugins?: readonly string[];
	readonly readPlatformVersion?: () => Promise<string | null>;
	readonly runGh?: (args: readonly string[]) => Promise<CommandResult>;
}

const toCopilotPluginName = (pluginName: string): string =>
	pluginName.startsWith("rp1-") ? pluginName : `rp1-${pluginName}`;

const pathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await stat(targetPath);
		return true;
	} catch {
		return false;
	}
};

const directoryExists = async (targetPath: string): Promise<boolean> => {
	try {
		const entry = await stat(targetPath);
		return entry.isDirectory();
	} catch {
		return false;
	}
};

const listLegacyFootprints = async (
	skillsDir: string,
	agentsDir: string,
): Promise<string[]> => {
	const footprints: string[] = [];

	try {
		const entries = await readdir(skillsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
				footprints.push(join(skillsDir, entry.name));
			}
		}
	} catch {}

	try {
		const entries = await readdir(agentsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith("rp1")) {
				footprints.push(join(agentsDir, entry.name));
			}
		}
	} catch {}

	return footprints.sort();
};

const parseGhVersion = (output: string): string | null =>
	output.match(/(\d+\.\d+\.\d+(?:[-+][^\s)]+)?)/)?.[1] ?? null;

const parseInstalledPlugins = (
	output: string,
): ReadonlyMap<string, ParsedInstalledPlugin> => {
	const plugins = new Map<string, ParsedInstalledPlugin>();

	for (const line of output.split(/\r?\n/)) {
		const match = line.match(
			/^\s*[•*◆-]?\s*([\w.-]+)@([\w.-]+)(?:\s+\(v?([^)]+)\))?\s*$/,
		);
		if (!match) {
			continue;
		}

		const plugin: ParsedInstalledPlugin = {
			name: match[1],
			marketplace: match[2],
			version: match[3]?.trim() ?? null,
		};
		plugins.set(plugin.name, plugin);
	}

	return plugins;
};

const defaultReadPlatformVersion = async (): Promise<string | null> => {
	const result = await readVersionMarker("copilot")();
	if (E.isLeft(result)) {
		return null;
	}
	return result.right?.version ?? null;
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const summarizeIssues = (
	plugins: readonly CopilotPluginVerification[],
	legacyFootprints: readonly string[],
	ghInstalled: boolean,
	pluginListAvailable: boolean,
	state: CopilotVerificationState,
): string[] => {
	const issues: string[] = [];

	if (!ghInstalled) {
		issues.push("GitHub CLI (gh) not found in PATH.");
	}

	if (ghInstalled && !pluginListAvailable) {
		issues.push(
			"Could not inspect installed Copilot plugins with `gh copilot -- plugin list`.",
		);
	}

	if (state === "partial_native") {
		issues.push("Required rp1 Copilot plugins are only partially installed.");
	}

	if (state === "legacy_only") {
		issues.push("Only unsupported legacy Copilot file-drop content was found.");
	}

	if (state === "not_installed") {
		issues.push("No native rp1 Copilot installation was found.");
	}

	if (legacyFootprints.length > 0) {
		issues.push(
			`Unsupported legacy Copilot content is still present (${legacyFootprints.length} path${legacyFootprints.length === 1 ? "" : "s"}).`,
		);
	}

	for (const plugin of plugins) {
		if (
			!plugin.required &&
			!plugin.listedInCopilot &&
			!plugin.marketplaceLocation
		) {
			continue;
		}
		if (plugin.issues.length > 0 && plugin.required) {
			issues.push(`${plugin.name} has verification issues.`);
		}
	}

	return unique(issues);
};

const buildRemediation = (
	state: CopilotVerificationState,
	plugins: readonly CopilotPluginVerification[],
	pluginListAvailable: boolean,
	ghInstalled: boolean,
): string[] => {
	const remediation: string[] = [];
	const hasArtifactIssue = plugins.some((plugin) =>
		plugin.issues.some(
			(issue) =>
				issue.includes("plugin.json") ||
				issue.includes("skills/") ||
				issue.includes("agents/*.agent.md"),
		),
	);
	const hasVersionIssue = plugins.some((plugin) =>
		plugin.issues.some((issue) => issue.includes("Version mismatch")),
	);

	if (!ghInstalled) {
		remediation.push(
			"Install or repair GitHub CLI, then confirm `gh copilot -- plugin list` succeeds.",
		);
	}

	if (!pluginListAvailable && ghInstalled) {
		remediation.push(
			"Run `gh copilot -- plugin list` directly and resolve any CLI errors before retrying verification.",
		);
	}

	if (state === "not_installed") {
		remediation.push("Install Copilot support with `rp1 install copilot`.");
	}

	if (state === "partial_native") {
		remediation.push(
			"Re-run `rp1 install copilot` to restage the local marketplace and install or update the required plugins.",
		);
	}

	if (state === "legacy_only") {
		remediation.push(
			"Remove the legacy rp1 files under `~/.config/github-copilot` and reinstall with `rp1 install copilot`.",
		);
	}

	if (state === "mixed_native_and_legacy") {
		remediation.push(
			"Remove the legacy rp1 files under `~/.config/github-copilot` to keep Copilot on the native plugin path only.",
		);
	}

	if (hasArtifactIssue) {
		remediation.push(
			"Rebuild Copilot artifacts with `just build-copilot` before reinstalling if the local marketplace files are incomplete.",
		);
	}

	if (hasVersionIssue) {
		remediation.push(
			"Update the installed Copilot plugins so their versions match the current rp1 build.",
		);
	}

	return unique(remediation);
};

export const verifyCopilotInstallation = async (
	deps: CopilotVerifierDeps = {},
): Promise<CopilotVerificationResult> => {
	const paths = deps.paths ?? getCopilotPaths();
	const getGhBinaryPath = deps.getGhBinaryPath ?? (() => Bun.which("gh"));
	const runGh = deps.runGh ?? runGhCommand;
	const readPlatformVersion =
		deps.readPlatformVersion ?? defaultReadPlatformVersion;
	const requiredPlugins = (deps.requiredPlugins ?? REQUIRED_PLUGINS).map(
		toCopilotPluginName,
	);
	const optionalPlugins = (deps.optionalPlugins ?? OPTIONAL_PLUGINS).map(
		toCopilotPluginName,
	);
	const expectedVersion = await readPlatformVersion();
	const legacyFootprints = await listLegacyFootprints(
		paths.legacySkillsDir,
		paths.legacyAgentsDir,
	);

	let ghInstalled = false;
	let ghVersion: string | null = null;
	let pluginListAvailable = false;
	let installedPlugins = new Map<string, ParsedInstalledPlugin>();

	if (getGhBinaryPath()) {
		try {
			const versionResult = await runGh(["--version"]);
			if (versionResult.exitCode === 0) {
				ghInstalled = true;
				ghVersion = parseGhVersion(versionResult.output);
			}
		} catch {}
	}

	if (ghInstalled) {
		try {
			const pluginListResult = await runGh(["copilot", "--", "plugin", "list"]);
			if (pluginListResult.exitCode === 0) {
				pluginListAvailable = true;
				installedPlugins = new Map(
					parseInstalledPlugins(pluginListResult.output),
				);
			}
		} catch {}
	}

	const pluginStatuses = await Promise.all(
		[...requiredPlugins, ...optionalPlugins].map(async (pluginName) => {
			const required = requiredPlugins.includes(pluginName);
			const nativeInstalledLocation = join(
				paths.nativeMarketplaceDir,
				pluginName,
			);
			const marketplaceLocation = join(paths.marketplacePluginsDir, pluginName);
			const listedPlugin = installedPlugins.get(pluginName) ?? null;
			const listedInCopilot =
				listedPlugin !== null && listedPlugin.marketplace === MARKETPLACE_NAME;
			const nativeDirExists = await directoryExists(nativeInstalledLocation);
			const marketplaceDirExists = await directoryExists(marketplaceLocation);
			const marketplaceManifestExists = await pathExists(
				join(marketplaceLocation, "plugin.json"),
			);
			const marketplaceSkillsDirExists = await directoryExists(
				join(marketplaceLocation, "skills"),
			);
			const marketplaceAgentsDir = join(marketplaceLocation, "agents");
			const marketplaceAgentsDirExists =
				await directoryExists(marketplaceAgentsDir);
			const marketplaceAgentFiles = marketplaceAgentsDirExists
				? await readdir(marketplaceAgentsDir)
				: [];
			const hasMarketplaceAgentFiles = marketplaceAgentFiles.some((entry) =>
				entry.endsWith(".agent.md"),
			);
			const artifactsValid =
				marketplaceDirExists &&
				marketplaceManifestExists &&
				marketplaceSkillsDirExists &&
				hasMarketplaceAgentFiles;
			const versionMatches =
				expectedVersion === null ||
				listedPlugin === null ||
				listedPlugin.version === null ||
				listedPlugin.version === expectedVersion;
			const hasAnyNativeSignal =
				listedPlugin !== null || nativeDirExists || marketplaceDirExists;

			if (!required && !hasAnyNativeSignal) {
				return null;
			}

			const issues: string[] = [];

			if (pluginListAvailable) {
				if (listedPlugin === null) {
					issues.push("Not reported by `gh copilot -- plugin list`.");
				} else if (!listedInCopilot) {
					issues.push(
						`Listed from marketplace \`${listedPlugin.marketplace}\` instead of \`${MARKETPLACE_NAME}\`.`,
					);
				}
			}

			if (!nativeDirExists) {
				issues.push(
					`Native installed plugin directory missing: ${nativeInstalledLocation}`,
				);
			}

			if (!marketplaceDirExists) {
				issues.push(
					`Local marketplace plugin directory missing: ${marketplaceLocation}`,
				);
			} else {
				if (!marketplaceManifestExists) {
					issues.push(`Missing plugin.json in ${marketplaceLocation}`);
				}
				if (!marketplaceSkillsDirExists) {
					issues.push(`Missing skills/ in ${marketplaceLocation}`);
				}
				if (!hasMarketplaceAgentFiles) {
					issues.push(`Missing agents/*.agent.md in ${marketplaceLocation}`);
				}
			}

			if (
				!versionMatches &&
				listedPlugin !== null &&
				expectedVersion !== null
			) {
				issues.push(
					`Version mismatch: expected ${expectedVersion} but Copilot reports ${listedPlugin.version}.`,
				);
			}

			return {
				name: pluginName,
				required,
				listedInCopilot,
				installed:
					pluginListAvailable &&
					listedInCopilot &&
					nativeDirExists &&
					artifactsValid &&
					versionMatches,
				version: listedPlugin?.version ?? null,
				expectedVersion,
				nativeInstalledLocation: nativeDirExists
					? nativeInstalledLocation
					: null,
				marketplaceLocation: marketplaceDirExists ? marketplaceLocation : null,
				issues,
			} satisfies CopilotPluginVerification;
		}),
	);

	const plugins = pluginStatuses.filter(
		(plugin): plugin is Exclude<(typeof pluginStatuses)[number], null> =>
			plugin !== null,
	);
	const requiredStatuses = plugins.filter((plugin) => plugin.required);
	const hasNativeSignal = requiredStatuses.some(
		(plugin) =>
			plugin.listedInCopilot ||
			plugin.nativeInstalledLocation !== null ||
			plugin.marketplaceLocation !== null,
	);
	const allRequiredHealthy =
		requiredStatuses.length > 0 &&
		requiredStatuses.every((plugin) => plugin.installed);

	let state: CopilotVerificationState = "not_installed";
	if (allRequiredHealthy && legacyFootprints.length > 0) {
		state = "mixed_native_and_legacy";
	} else if (allRequiredHealthy) {
		state = "healthy_native";
	} else if (legacyFootprints.length > 0 && !hasNativeSignal) {
		state = "legacy_only";
	} else if (hasNativeSignal) {
		state = "partial_native";
	}

	const issues = summarizeIssues(
		plugins,
		legacyFootprints,
		ghInstalled,
		pluginListAvailable,
		state,
	);
	const remediation = buildRemediation(
		state,
		plugins,
		pluginListAvailable,
		ghInstalled,
	);

	return {
		state,
		verified: state === "healthy_native" || state === "mixed_native_and_legacy",
		ghInstalled,
		ghVersion,
		pluginListAvailable,
		plugins,
		legacyFootprints,
		issues,
		remediation,
	};
};

export const summarizeCopilotVerification = (
	result: CopilotVerificationResult,
): {
	readonly verified: boolean;
	readonly plugins: ReadonlyArray<{
		readonly name: string;
		readonly installed: boolean;
		readonly version: string | null;
		readonly location: string | null;
	}>;
	readonly issues: readonly string[];
} => ({
	verified: result.verified,
	plugins: result.plugins.map((plugin) => ({
		name: plugin.name,
		installed: plugin.installed,
		version: plugin.version ?? plugin.expectedVersion,
		location: plugin.nativeInstalledLocation ?? plugin.marketplaceLocation,
	})),
	issues: unique([
		...result.issues,
		...result.plugins.flatMap((plugin) =>
			plugin.required
				? plugin.issues.map((issue) => `${plugin.name}: ${issue}`)
				: [],
		),
	]),
});
