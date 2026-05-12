/**
 * Copilot installer orchestrator.
 * Manages the native marketplace install and legacy uninstall lifecycle for rp1 plugins in Copilot CLI.
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	formatError,
	installError,
	usageError,
} from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner, type Spinner } from "../../../shared/spinner.js";
import { OPTIONAL_PLUGINS, REQUIRED_PLUGINS } from "../../assets/reader.js";
import type { InstallContext } from "../../shared/install-core.js";
import {
	createLocalMarketplace,
	MARKETPLACE_NAME,
	registerMarketplace,
} from "./marketplace.js";
import type {
	CopilotInstallConfig,
	CopilotInstallResult,
	CopilotPaths,
	CopilotUninstallResult,
} from "./models.js";
import {
	type CommandResult,
	checkCopilotInstalled,
	checkCopilotPluginSupport,
	checkCopilotVersion,
	checkWritePermissions,
	getCopilotPaths,
	runCopilotCommand,
} from "./prerequisites.js";

const execAsync = promisify(exec);

const COMMAND_TIMEOUT = 30000;

const pluginNameFromDir = (pluginDir: string): string => {
	const pluginName = basename(pluginDir);
	return pluginName.startsWith("rp1-") ? pluginName : `rp1-${pluginName}`;
};

const toCopilotPluginName = (pluginName: string): string =>
	pluginName.startsWith("rp1-") ? pluginName : `rp1-${pluginName}`;

const pluginNamesFromDirs = (dirs: readonly string[]): string[] =>
	dirs.map(pluginNameFromDir);

const executeCopilotCommand = (
	command: string,
	spinner: Spinner,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, string> => {
	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right("");
	}

	spinner.start(`Running: ${command}`);

	return pipe(
		TE.tryCatch(
			async () => {
				const { stdout, stderr } = await execAsync(command, {
					timeout: COMMAND_TIMEOUT,
				});
				return stdout || stderr;
			},
			(e) => {
				const error = e as Error & { stderr?: string };
				const message = error.stderr || error.message || String(e);
				return installError("copilot-command", `Command failed: ${message}`);
			},
		),
	);
};

const isAlreadyExistsError = (error: CLIError): boolean => {
	const message = formatError(error, false);
	const alreadyExistsPatterns = [
		/already exists/i,
		/already added/i,
		/already installed/i,
		/already registered/i,
	];
	return alreadyExistsPatterns.some((pattern) => pattern.test(message));
};

const getErrorMessage = (error: CLIError): string => formatError(error, false);

export const installPlugin = (
	pluginName: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const command = `copilot plugin install ${pluginRef}`;
	const spinner = createSpinner(isTTY);

	return pipe(
		executeCopilotCommand(command, spinner, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				spinner.succeed(`Plugin ${pluginName} installed`);
			}
			return true;
		}),
		TE.orElse((error) => {
			if (error._tag === "InstallError" && isAlreadyExistsError(error)) {
				spinner.stop();
				logger.info(`Plugin ${pluginName} already installed, updating...`);
				return updatePlugin(pluginName, logger, dryRun, isTTY);
			}
			spinner.fail(
				`Failed to install ${pluginName}: ${getErrorMessage(error)}`,
			);
			return TE.left(error);
		}),
	);
};

export const updatePlugin = (
	pluginName: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const command = `copilot plugin update ${pluginRef}`;
	const spinner = createSpinner(isTTY);

	return pipe(
		executeCopilotCommand(command, spinner, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				spinner.succeed(`Plugin ${pluginName} updated`);
			}
			return true;
		}),
		TE.mapLeft((error) => {
			spinner.fail(`Failed to update ${pluginName}: ${getErrorMessage(error)}`);
			return error;
		}),
	);
};

const hasCopilotAgents = async (agentsDir: string): Promise<boolean> => {
	const entries = await readdir(agentsDir, { withFileTypes: true });
	return entries.some(
		(entry) => !entry.isDirectory() && entry.name.endsWith(".agent.md"),
	);
};

const directoryExists = async (targetPath: string): Promise<boolean> => {
	try {
		const entry = await stat(targetPath);
		return entry.isDirectory();
	} catch {
		return false;
	}
};

const isAlreadyAbsentOutput = (output: string): boolean =>
	/not installed|not found|no plugin|not registered|no marketplace/i.test(
		output,
	);

const requiresMarketplaceForceRemoval = (output: string): boolean =>
	/plugins from this marketplace are installed|use --force/i.test(output);

const listLegacySkillDirs = async (skillsDir: string): Promise<string[]> => {
	try {
		const skillsStat = await stat(skillsDir);
		if (!skillsStat.isDirectory()) {
			throw installError(
				"uninstall",
				`Expected ${skillsDir} to be a directory, but it is not. Cannot safely enumerate rp1 legacy skills for removal.`,
			);
		}

		const entries = await readdir(skillsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory() && entry.name.startsWith("rp1-"))
			.map((entry) => entry.name);
	} catch (error) {
		if (typeof error === "object" && error !== null && "_tag" in error) {
			throw error;
		}
		return [];
	}
};

const listLegacyAgentEntries = async (agentsDir: string): Promise<string[]> => {
	try {
		const agentsStat = await stat(agentsDir);
		if (!agentsStat.isDirectory()) {
			return [];
		}

		const entries = await readdir(agentsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.name.startsWith("rp1"))
			.map((entry) => entry.name);
	} catch {
		return [];
	}
};

const removeDirectoryIfEmpty = async (targetPath: string): Promise<boolean> => {
	try {
		const entries = await readdir(targetPath);
		if (entries.length > 0) {
			return false;
		}
		await rm(targetPath);
		return true;
	} catch {
		return false;
	}
};

const shouldUninstallOptionalPlugin = async (
	paths: CopilotPaths,
	pluginName: string,
): Promise<boolean> => {
	const marketplacePath = join(paths.marketplacePluginsDir, pluginName);
	const nativePath = join(paths.nativeMarketplaceDir, pluginName);
	return (
		(await directoryExists(marketplacePath)) ||
		(await directoryExists(nativePath))
	);
};

interface CopilotUninstallDeps {
	readonly runCopilot?: (args: readonly string[]) => Promise<CommandResult>;
}

export const validateCopilotArtifacts = (
	artifactsDir: string,
): TE.TaskEither<CLIError, readonly string[]> =>
	TE.tryCatch(
		async () => {
			const pluginDirs: string[] = [];

			for (const plugin of REQUIRED_PLUGINS) {
				const pluginDir = join(artifactsDir, plugin);
				try {
					await stat(pluginDir);
				} catch {
					throw usageError(
						`Copilot artifacts not found at ${pluginDir}`,
						"Build artifacts first with: rp1 build --platform copilot",
					);
				}

				const pluginManifest = join(pluginDir, "plugin.json");
				try {
					await stat(pluginManifest);
				} catch {
					throw usageError(
						`Native plugin manifest not found at ${pluginManifest}`,
						"Rebuild Copilot artifacts so each plugin includes plugin.json",
					);
				}

				const skillsDir = join(pluginDir, "skills");
				try {
					await stat(skillsDir);
				} catch {
					throw usageError(
						`Skills directory not found at ${skillsDir}`,
						"Build artifacts first with: rp1 build --platform copilot",
					);
				}

				const agentsDir = join(pluginDir, "agents");
				try {
					await stat(agentsDir);
				} catch {
					throw usageError(
						`Agents directory not found at ${agentsDir}`,
						"Build artifacts first with: rp1 build --platform copilot",
					);
				}

				if (!(await hasCopilotAgents(agentsDir))) {
					throw usageError(
						`No .agent.md files found in ${agentsDir}`,
						"Rebuild Copilot artifacts so native agent files are generated",
					);
				}

				pluginDirs.push(pluginDir);
			}

			for (const plugin of OPTIONAL_PLUGINS) {
				const pluginDir = join(artifactsDir, plugin);
				try {
					await stat(join(pluginDir, "plugin.json"));
					await stat(join(pluginDir, "skills"));
					const agentsDir = join(pluginDir, "agents");
					await stat(agentsDir);
					if (await hasCopilotAgents(agentsDir)) {
						pluginDirs.push(pluginDir);
					}
				} catch {
					// Optional plugin not present or incomplete, skip it.
				}
			}

			return pluginDirs;
		},
		(e) => {
			if (
				typeof e === "object" &&
				e !== null &&
				"_tag" in e &&
				(e as CLIError)._tag === "UsageError"
			) {
				return e as CLIError;
			}
			return installError(
				"validate-artifacts",
				`Failed to validate Copilot artifacts: ${e}`,
			);
		},
	);

export const installCopilot = (
	config: CopilotInstallConfig,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CopilotInstallResult> => {
	const spinner = createSpinner(ctx.isTTY);
	const paths = getCopilotPaths();
	const warnings: string[] = [];

	return pipe(
		TE.Do,
		TE.chain(() => {
			spinner.start("Checking Copilot CLI prerequisites...");
			return checkCopilotInstalled();
		}),
		TE.chain((prereqResult) => {
			const versionResult = checkCopilotVersion(prereqResult.value ?? "");
			if (E.isLeft(versionResult)) {
				spinner.fail("Version check failed");
				return TE.left<CLIError, void>(versionResult.left);
			}
			return TE.right<CLIError, void>(undefined);
		}),
		TE.chain(() => checkCopilotPluginSupport()),
		TE.chain(() => checkWritePermissions(paths.marketplaceDir)),
		TE.chainFirst(() => {
			spinner.succeed("Copilot CLI prerequisites OK");
			return TE.right(undefined);
		}),
		TE.chain(() => {
			spinner.start("Validating build artifacts...");
			return validateCopilotArtifacts(config.artifactsDir);
		}),
		TE.chainFirst(() => {
			spinner.succeed("Build artifacts validated");
			return TE.right(undefined);
		}),
		TE.chain((pluginDirs) => {
			if (config.dryRun) {
				spinner.stop();
				return pipe(
					previewCopilotInstallation(pluginDirs, paths),
					TE.map(
						(): CopilotInstallResult => ({
							marketplaceAdded: false,
							pluginsInstalled: pluginNamesFromDirs(pluginDirs),
							warnings: ["Dry run - no changes made"],
						}),
					),
				);
			}

			const pluginsInstalled: string[] = [];

			return pipe(
				TE.Do,
				TE.chain(() => {
					spinner.start("Staging local marketplace...");
					return createLocalMarketplace(paths.marketplaceDir, pluginDirs);
				}),
				TE.chainFirst((marketplaceResult) => {
					spinner.succeed(
						`Local marketplace staged at ${marketplaceResult.marketplaceDir}`,
					);
					return TE.right(undefined);
				}),
				TE.chain((marketplaceResult) =>
					pipe(
						registerMarketplace(
							paths.marketplaceDir,
							ctx.logger,
							false,
							ctx.isTTY,
						),
						TE.map(() => marketplaceResult.pluginsRegistered),
					),
				),
				TE.chain((pluginNames) =>
					pluginNames.reduce(
						(acc, pluginName) =>
							pipe(
								acc,
								TE.chain(() =>
									pipe(
										installPlugin(
											pluginName,
											ctx.logger,
											config.dryRun,
											ctx.isTTY,
										),
										TE.map((success) => {
											if (success) {
												pluginsInstalled.push(pluginName);
											}
										}),
									),
								),
							),
						TE.right(undefined) as TE.TaskEither<CLIError, void>,
					),
				),
				TE.map(
					(): CopilotInstallResult => ({
						marketplaceAdded: true,
						pluginsInstalled,
						warnings,
					}),
				),
			);
		}),
		TE.mapLeft((error) => {
			spinner.stop();
			return error;
		}),
	);
};

export const uninstallCopilot = (
	paths: CopilotPaths,
	dryRun: boolean,
	deps: CopilotUninstallDeps = {},
): TE.TaskEither<CLIError, CopilotUninstallResult> =>
	TE.tryCatch(
		async () => {
			const runCopilot = deps.runCopilot ?? runCopilotCommand;
			const nativeMarketplaceExists = await directoryExists(
				paths.nativeMarketplaceDir,
			);
			const marketplaceExists = await directoryExists(paths.marketplaceDir);
			const legacySkillDirs = await listLegacySkillDirs(paths.skillsDir);
			const legacyAgentEntries = await listLegacyAgentEntries(paths.agentsDir);
			const optionalPlugins = (
				await Promise.all(
					OPTIONAL_PLUGINS.map(async (pluginName) => {
						const namespacedPluginName = toCopilotPluginName(pluginName);
						return (await shouldUninstallOptionalPlugin(
							paths,
							namespacedPluginName,
						))
							? namespacedPluginName
							: null;
					}),
				)
			).filter((pluginName): pluginName is string => pluginName !== null);
			const pluginsToUninstall =
				nativeMarketplaceExists || marketplaceExists
					? [...REQUIRED_PLUGINS.map(toCopilotPluginName), ...optionalPlugins]
					: [];
			const uniquePluginsToUninstall = [...new Set(pluginsToUninstall)];

			if (dryRun) {
				if (uniquePluginsToUninstall.length > 0) {
					console.log("Would uninstall native Copilot plugins:");
					for (const pluginName of uniquePluginsToUninstall) {
						console.log(
							`  - copilot plugin uninstall ${pluginName}@${MARKETPLACE_NAME}`,
						);
					}
				}
				if (marketplaceExists || nativeMarketplaceExists) {
					console.log("Would remove local Copilot marketplace:");
					console.log(
						`  - copilot plugin marketplace remove ${MARKETPLACE_NAME}`,
					);
				}
				if (marketplaceExists) {
					console.log("Would remove staged marketplace directory:");
					console.log(`  - ${paths.marketplaceDir}`);
				}
				if (legacySkillDirs.length > 0) {
					console.log("Would remove legacy skill directories:");
					for (const dirName of legacySkillDirs) {
						console.log(`  - ${join(paths.skillsDir, dirName)}`);
					}
				}
				if (legacyAgentEntries.length > 0) {
					console.log("Would remove legacy agent files:");
					for (const entryName of legacyAgentEntries) {
						console.log(`  - ${join(paths.agentsDir, entryName)}`);
					}
				}
				if (
					uniquePluginsToUninstall.length === 0 &&
					!marketplaceExists &&
					!nativeMarketplaceExists &&
					legacySkillDirs.length === 0 &&
					legacyAgentEntries.length === 0
				) {
					console.log("No rp1 Copilot content found to remove.");
				}
				return {
					pluginsUninstalled: [],
					marketplaceRemoved: false,
					marketplaceDeleted: false,
					skillsRemoved: 0,
					agentsRemoved: false,
					legacyConfigRemoved: false,
				};
			}

			const pluginsUninstalled: string[] = [];
			for (const pluginName of uniquePluginsToUninstall) {
				const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
				const result = await runCopilot(["plugin", "uninstall", pluginRef]);
				if (result.exitCode === 0) {
					pluginsUninstalled.push(pluginName);
					continue;
				}
				if (isAlreadyAbsentOutput(result.output)) {
					continue;
				}
				throw installError(
					"uninstall",
					`Failed to uninstall Copilot plugin ${pluginRef}: ${result.output || "unknown error"}`,
				);
			}

			let marketplaceRemoved = false;
			if (marketplaceExists || nativeMarketplaceExists) {
				const removeResult = await runCopilot([
					"plugin",
					"marketplace",
					"remove",
					MARKETPLACE_NAME,
				]);
				if (removeResult.exitCode === 0) {
					marketplaceRemoved = true;
				} else if (requiresMarketplaceForceRemoval(removeResult.output)) {
					const forceRemoveResult = await runCopilot([
						"plugin",
						"marketplace",
						"remove",
						"--force",
						MARKETPLACE_NAME,
					]);
					if (forceRemoveResult.exitCode === 0) {
						marketplaceRemoved = true;
					} else if (!isAlreadyAbsentOutput(forceRemoveResult.output)) {
						throw installError(
							"uninstall",
							`Failed to remove Copilot marketplace ${MARKETPLACE_NAME}: ${forceRemoveResult.output || "unknown error"}`,
						);
					}
				} else if (!isAlreadyAbsentOutput(removeResult.output)) {
					throw installError(
						"uninstall",
						`Failed to remove Copilot marketplace ${MARKETPLACE_NAME}: ${removeResult.output || "unknown error"}`,
					);
				}
			}

			let marketplaceDeleted = false;
			if (marketplaceExists) {
				await rm(paths.marketplaceDir, { recursive: true, force: true });
				marketplaceDeleted = true;
			}

			let skillsRemoved = 0;
			let agentsRemoved = false;
			for (const dirName of legacySkillDirs) {
				const targetPath = join(paths.skillsDir, dirName);
				await rm(targetPath, { recursive: true });
				skillsRemoved++;
			}

			if (legacyAgentEntries.length > 0) {
				for (const entryName of legacyAgentEntries) {
					const targetPath = join(paths.agentsDir, entryName);
					const fileStat = await stat(targetPath);
					if (fileStat.isDirectory()) {
						await rm(targetPath, { recursive: true });
					} else {
						await rm(targetPath);
					}
				}
				agentsRemoved = true;
			}

			await removeDirectoryIfEmpty(paths.skillsDir);
			await removeDirectoryIfEmpty(paths.agentsDir);
			const legacyConfigRemoved = await removeDirectoryIfEmpty(paths.configDir);

			return {
				pluginsUninstalled,
				marketplaceRemoved,
				marketplaceDeleted,
				skillsRemoved,
				agentsRemoved,
				legacyConfigRemoved,
			};
		},
		(e) => {
			if (typeof e === "object" && e !== null && "_tag" in e) {
				return e as CLIError;
			}
			return installError(
				"uninstall",
				`Failed to uninstall Copilot plugins: ${e}`,
			);
		},
	);

export const previewCopilotInstallation = (
	pluginDirs: readonly string[],
	paths: CopilotPaths,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			const pluginNames = pluginNamesFromDirs(pluginDirs);

			console.log("[dry-run] Installation preview:\n");
			console.log(`Local marketplace: ${paths.marketplaceDir}`);
			console.log(`Marketplace metadata: ${paths.marketplaceMetadataPath}`);
			console.log("\nPlugins to stage:");
			for (const [index, pluginDir] of pluginDirs.entries()) {
				console.log(
					`  - ${pluginDir} -> ${join(paths.marketplacePluginsDir, pluginNames[index])}`,
				);
			}

			console.log("\nCommands to run:");
			console.log(
				`  - copilot plugin marketplace add "${paths.marketplaceDir}"`,
			);
			for (const pluginName of pluginNames) {
				console.log(
					`  - copilot plugin install ${pluginName}@${MARKETPLACE_NAME}`,
				);
				console.log(
					`    copilot plugin update ${pluginName}@${MARKETPLACE_NAME}`,
				);
			}

			console.log("\nRun without --dry-run to execute installation.");
		},
		(e) => installError("preview", `Failed to preview installation: ${e}`),
	);

export const getDefaultCopilotArtifactsDir = (): string | null => {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(moduleDir, "..", "..", "..", "dist", "copilot"),
		join(moduleDir, "..", "..", "dist", "copilot"),
		join(moduleDir, "..", "dist", "copilot"),
		join(moduleDir, "..", "cli", "dist", "copilot"),
		join(process.cwd(), "cli", "dist", "copilot"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
};
