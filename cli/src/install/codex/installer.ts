/**
 * Codex installer orchestrator.
 * Manages the full install/uninstall lifecycle for rp1 plugins in Codex CLI.
 */

import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	backupError,
	installError,
	usageError,
} from "../../../shared/errors.js";
import { confirmAction, selectOption } from "../../../shared/prompts.js";
import { createSpinner } from "../../../shared/spinner.js";
import {
	hasShellFencedContent,
	replaceShellFencedContent,
} from "../../init/shell-fence.js";
import type { InstallContext } from "../../shared/install-core.js";
import {
	buildConfigPatch,
	detectNotifyConfigConflict,
	generateConfigDiff,
	mergeCodexConfig,
	readCodexConfig,
	writeCodexConfig,
} from "./config.js";
import type {
	CodexInstallConfig,
	CodexInstallResult,
	CodexPaths,
	CodexUninstallResult,
} from "./models.js";
import {
	checkCodexInstalled,
	checkCodexVersion,
	checkWritePermissions,
	getCodexPaths,
} from "./prerequisites.js";

const CODEX_PLUGINS = ["base", "dev"] as const;

/**
 * Recursively copy a directory, returning the number of files copied.
 */
const copyDir = async (src: string, dst: string): Promise<number> => {
	await mkdir(dst, { recursive: true });
	let count = 0;

	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const dstPath = join(dst, entry.name);

		if (entry.isDirectory()) {
			count += await copyDir(srcPath, dstPath);
		} else {
			await copyFile(srcPath, dstPath);
			count++;
		}
	}

	return count;
};

/**
 * Verify that Codex build artifacts exist at the given directory.
 * Checks for dist/codex/{base,dev}/ with skills/ and agents/ directories.
 */
export const validateCodexArtifacts = (
	artifactsDir: string,
): TE.TaskEither<CLIError, readonly string[]> =>
	TE.tryCatch(
		async () => {
			const pluginDirs: string[] = [];

			for (const plugin of CODEX_PLUGINS) {
				const pluginDir = join(artifactsDir, plugin);
				try {
					await stat(pluginDir);
				} catch {
					throw usageError(
						`Codex artifacts not found at ${pluginDir}`,
						"Build artifacts first with: rp1 build",
					);
				}

				const skillsDir = join(pluginDir, "skills");
				try {
					await stat(skillsDir);
				} catch {
					throw usageError(
						`Skills directory not found at ${skillsDir}`,
						"Build artifacts first with: rp1 build",
					);
				}

				const agentsDir = join(pluginDir, "agents");
				try {
					await stat(agentsDir);
				} catch {
					throw usageError(
						`Agents directory not found at ${agentsDir}`,
						"Build artifacts first with: rp1 build",
					);
				}

				pluginDirs.push(pluginDir);
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
				`Failed to validate Codex artifacts: ${e}`,
			);
		},
	);

/**
 * Create a timestamped backup of the current Codex installation.
 * Backs up config.toml and any existing rp1-* skill directories.
 */
export const backupCodexInstallation = (
	paths: CodexPaths,
): TE.TaskEither<CLIError, string | null> =>
	TE.tryCatch(
		async () => {
			let hasContent = false;

			try {
				await stat(paths.configFile);
				hasContent = true;
			} catch {
				// no config file
			}

			try {
				const entries = await readdir(paths.skillsDir, {
					withFileTypes: true,
				});
				if (entries.some((e) => e.isDirectory() && e.name.startsWith("rp1-"))) {
					hasContent = true;
				}
			} catch {
				// no skills dir
			}

			try {
				await stat(paths.agentsDir);
				hasContent = true;
			} catch {
				// no agents dir
			}

			if (!hasContent) {
				return null;
			}

			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19);
			const backupPath = join(paths.backupDir, `backup_${timestamp}`);
			await mkdir(backupPath, { recursive: true });

			try {
				const configContent = await readFile(paths.configFile, "utf-8");
				await mkdir(join(backupPath, "config"), { recursive: true });
				await writeFile(
					join(backupPath, "config", "config.toml"),
					configContent,
				);
			} catch {
				// config.toml may not exist
			}

			try {
				const entries = await readdir(paths.skillsDir, {
					withFileTypes: true,
				});
				for (const entry of entries) {
					if (!entry.isDirectory() || !entry.name.startsWith("rp1-")) continue;
					const srcDir = join(paths.skillsDir, entry.name);
					const dstDir = join(backupPath, "skills", entry.name);
					await copyDir(srcDir, dstDir);
				}
			} catch {
				// skills dir may not exist
			}

			try {
				await stat(paths.agentsDir);
				const dstAgentsDir = join(backupPath, "agents");
				await copyDir(paths.agentsDir, dstAgentsDir);
			} catch {
				// agents dir may not exist
			}

			const manifest = { timestamp, backupPath };
			await writeFile(
				join(backupPath, "manifest.json"),
				JSON.stringify(manifest, null, 2),
			);

			return backupPath;
		},
		(e) => backupError(`Failed to create Codex backup: ${e}`),
	);

/**
 * Copy skill directories from build artifacts to ~/.agents/skills/.
 * Overwrites existing rp1-* directories; preserves non-rp1 content.
 */
export const copyCodexSkills = (
	pluginDirs: readonly string[],
	targetDir: string,
): TE.TaskEither<CLIError, number> =>
	TE.tryCatch(
		async () => {
			await mkdir(targetDir, { recursive: true });
			let totalCopied = 0;

			for (const pluginDir of pluginDirs) {
				const skillsSrc = join(pluginDir, "skills");

				try {
					await stat(skillsSrc);
				} catch {
					continue;
				}

				const entries = await readdir(skillsSrc, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.isDirectory()) continue;
					if (!entry.name.startsWith("rp1-")) continue;

					const srcSkillDir = join(skillsSrc, entry.name);
					const dstSkillDir = join(targetDir, entry.name);

					try {
						await stat(dstSkillDir);
						await rm(dstSkillDir, { recursive: true });
					} catch {
						// doesn't exist yet
					}

					totalCopied += await copyDir(srcSkillDir, dstSkillDir);
				}
			}

			return totalCopied;
		},
		(e) => installError("copy-skills", `Failed to copy Codex skills: ${e}`),
	);

/**
 * Copy per-agent TOML files from build output to ~/.codex/agents/rp1/.
 * Creates the target directory if it does not exist.
 */
export const copyCodexAgents = (
	pluginDirs: readonly string[],
	targetDir: string,
): TE.TaskEither<CLIError, number> =>
	TE.tryCatch(
		async () => {
			await mkdir(targetDir, { recursive: true });
			let totalCopied = 0;

			for (const pluginDir of pluginDirs) {
				const agentsSrc = join(pluginDir, "agents");

				try {
					await stat(agentsSrc);
				} catch {
					continue;
				}

				const entries = await readdir(agentsSrc, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory() || !entry.name.endsWith(".toml")) continue;

					const srcFile = join(agentsSrc, entry.name);
					const dstFile = join(targetDir, entry.name);
					await copyFile(srcFile, dstFile);
					totalCopied++;
				}
			}

			return totalCopied;
		},
		(e) =>
			installError("copy-agents", `Failed to copy per-agent TOML files: ${e}`),
	);

/**
 * Collect rp1-agents.toml paths from all plugin directories.
 */
const collectAgentTomlPaths = async (
	pluginDirs: readonly string[],
): Promise<string[]> => {
	const paths: string[] = [];
	for (const pluginDir of pluginDirs) {
		const tomlPath = join(pluginDir, "rp1-agents.toml");
		try {
			await stat(tomlPath);
			paths.push(tomlPath);
		} catch {
			// no agents toml for this plugin
		}
	}
	return paths;
};

/**
 * Full Codex installation pipeline.
 * Sequence: prerequisites -> validate -> backup -> copy skills -> build config patch -> consent -> merge config -> verify.
 */
export const installCodex = (
	config: CodexInstallConfig,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CodexInstallResult> => {
	const isTTY = ctx.isTTY;
	const spinner = createSpinner(isTTY);
	const paths = getCodexPaths();

	return pipe(
		TE.Do,
		TE.chain(() => {
			spinner.start("Checking Codex prerequisites...");
			return checkCodexInstalled();
		}),
		TE.chain((prereqResult) => {
			const versionResult = checkCodexVersion(prereqResult.value ?? "");
			if (E.isLeft(versionResult)) {
				spinner.fail("Version check failed");
				return TE.left<CLIError, void>(versionResult.left);
			}
			return TE.right<CLIError, void>(undefined);
		}),
		TE.chain(() => checkWritePermissions(paths.skillsDir)),
		TE.chainFirst(() => {
			spinner.succeed("Codex prerequisites OK");
			return TE.right(undefined);
		}),
		TE.chain(() => {
			spinner.start("Validating build artifacts...");
			return validateCodexArtifacts(config.artifactsDir);
		}),
		TE.chainFirst(() => {
			spinner.succeed("Build artifacts validated");
			return TE.right(undefined);
		}),
		TE.chain((pluginDirs) => {
			if (config.dryRun) {
				spinner.stop();
				return pipe(
					previewCodexInstallation(config.artifactsDir, paths),
					TE.map(
						(): CodexInstallResult => ({
							skillsCopied: 0,
							configMerged: false,
							backupPath: null,
							warnings: ["Dry run - no changes made"],
						}),
					),
				);
			}

			return pipe(
				TE.Do,
				TE.chain(() => {
					spinner.start("Creating backup...");
					return backupCodexInstallation(paths);
				}),
				TE.chain((backupPath) => {
					if (backupPath) {
						spinner.succeed(`Backup created: ${backupPath}`);
					} else {
						spinner.info("No existing installation to back up");
					}

					spinner.start("Copying skill directories...");
					return pipe(
						copyCodexSkills(pluginDirs, paths.skillsDir),
						TE.map((skillsCopied) => ({ backupPath, skillsCopied })),
					);
				}),
				TE.chain(({ backupPath, skillsCopied }) => {
					spinner.succeed(`Copied ${skillsCopied} skill files`);

					spinner.start("Copying per-agent TOML files...");
					return pipe(
						copyCodexAgents(pluginDirs, paths.agentsDir),
						TE.map((agentsCopied) => ({
							backupPath,
							skillsCopied,
							agentsCopied,
						})),
					);
				}),
				TE.chain(({ backupPath, skillsCopied, agentsCopied }) => {
					spinner.succeed(`Copied ${agentsCopied} per-agent TOML files`);

					spinner.start("Building config patch...");
					return pipe(
						TE.tryCatch(
							() => collectAgentTomlPaths(pluginDirs),
							(e) =>
								installError(
									"collect-toml",
									`Failed to collect agent TOML paths: ${e}`,
								),
						),
						TE.chain((tomlPaths) => buildConfigPatch(tomlPaths)),
						TE.chain((patch) =>
							pipe(
								readCodexConfig(paths.configFile),
								TE.chain((existingContent) => {
									const notifyConflict =
										detectNotifyConfigConflict(existingContent);
									if (notifyConflict) {
										return TE.left<CLIError, CodexInstallResult>(
											installError("merge-config", notifyConflict),
										);
									}

									const newContent = mergeCodexConfig(existingContent, patch);
									const diff = generateConfigDiff(existingContent, newContent);

									spinner.stop();

									return TE.tryCatch(
										async () => {
											if (!config.yes) {
												const diffLines = diff.split("\n").length;
												console.log(
													`\nConfig.toml will be updated (${diffLines} lines changed)`,
												);

												const choice = await selectOption(
													"How would you like to proceed?",
													[
														{ value: "apply" as const, name: "Apply changes" },
														{ value: "diff" as const, name: "View diff first" },
														{
															value: "skip" as const,
															name: "Skip config changes",
														},
													],
													{ isTTY },
												);

												if (choice === "diff") {
													console.log(`\n${diff}\n`);
													const proceed = await confirmAction(
														"Apply these changes?",
														{ isTTY, defaultOnNonTTY: false },
													);
													if (!proceed) {
														return {
															skillsCopied,
															configMerged: false,
															backupPath,
															warnings: ["Config merge skipped by user"],
														} satisfies CodexInstallResult;
													}
												} else if (choice === "skip" || choice === null) {
													return {
														skillsCopied,
														configMerged: false,
														backupPath,
														warnings: ["Config merge skipped by user"],
													} satisfies CodexInstallResult;
												}
											}

											spinner.start("Merging config.toml...");
											const writeResult = await writeCodexConfig(
												paths.configFile,
												newContent,
											)();

											if (E.isLeft(writeResult)) {
												throw writeResult.left;
											}

											spinner.succeed("Config.toml updated");

											spinner.start("Verifying installation...");
											const verifyWarnings: string[] = [];

											try {
												const skillEntries = await readdir(paths.skillsDir, {
													withFileTypes: true,
												});
												const rp1Skills = skillEntries.filter(
													(e) => e.isDirectory() && e.name.startsWith("rp1-"),
												);
												if (rp1Skills.length === 0) {
													verifyWarnings.push(
														`No rp1-* skill directories found in ${paths.skillsDir}`,
													);
												}
											} catch {
												verifyWarnings.push(
													`Could not read skills directory: ${paths.skillsDir}`,
												);
											}

											try {
												const configContent = await readFile(
													paths.configFile,
													"utf-8",
												);
												if (!hasShellFencedContent(configContent)) {
													verifyWarnings.push(
														"config.toml does not contain rp1 fenced section",
													);
												}
											} catch {
												verifyWarnings.push(
													`Could not read config file: ${paths.configFile}`,
												);
											}

											if (verifyWarnings.length > 0) {
												spinner.warn("Installation completed with warnings");
											} else {
												spinner.succeed("Installation verified");
											}

											return {
												skillsCopied,
												configMerged: true,
												backupPath,
												warnings: verifyWarnings,
											} satisfies CodexInstallResult;
										},
										(e) => {
											if (typeof e === "object" && e !== null && "_tag" in e) {
												return e as CLIError;
											}
											return installError(
												"merge-config",
												`Failed to merge config: ${e}`,
											);
										},
									);
								}),
							),
						),
					);
				}),
			);
		}),
		TE.mapLeft((error) => {
			spinner.stop();
			return error;
		}),
	);
};

/**
 * Guard that ensures a path is not a structural Codex directory.
 * Returns true if the path is safe to remove (i.e., not structural).
 */
const isSafeToRemove = (targetPath: string, paths: CodexPaths): boolean => {
	const protectedPaths = [
		paths.configDir,
		paths.skillsDir,
		dirname(paths.agentsDir),
		paths.configFile,
	];
	return !protectedPaths.includes(targetPath);
};

/**
 * Remove rp1 content from Codex: skill directories, per-agent TOML files, and fenced config sections.
 *
 * Safety guarantees:
 * - Only rp1-* prefixed skill directories are removed from ~/.codex/skills/
 * - Only ~/.codex/agents/rp1/ subdirectory is removed (not the parent ~/.codex/agents/)
 * - Only rp1 fenced sections are removed from config.toml (file is never deleted)
 * - Structural directories (~/.codex/, ~/.codex/skills/, ~/.codex/agents/) are never removed
 * - Missing or unexpected directory structure produces a descriptive error
 */
export const uninstallCodex = (
	paths: CodexPaths,
	dryRun: boolean,
): TE.TaskEither<CLIError, CodexUninstallResult> =>
	TE.tryCatch(
		async () => {
			let skillsRemoved = 0;
			let configCleaned = false;

			const rp1SkillDirs: string[] = [];
			try {
				const skillsStat = await stat(paths.skillsDir);
				if (!skillsStat.isDirectory()) {
					throw installError(
						"uninstall",
						`Expected ${paths.skillsDir} to be a directory, but it is not. ` +
							"Cannot safely enumerate rp1 skills for removal. " +
							"Verify your Codex installation structure.",
					);
				}
				const entries = await readdir(paths.skillsDir, {
					withFileTypes: true,
				});
				for (const entry of entries) {
					if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
						rp1SkillDirs.push(entry.name);
					}
				}
			} catch (err) {
				if (typeof err === "object" && err !== null && "_tag" in err) {
					throw err;
				}
			}

			let hasAgentsDir = false;
			try {
				const agentsStat = await stat(paths.agentsDir);
				hasAgentsDir = agentsStat.isDirectory();
			} catch {
				hasAgentsDir = false;
			}

			let hasFencedConfig = false;
			try {
				const configContent = await readFile(paths.configFile, "utf-8");
				hasFencedConfig = hasShellFencedContent(configContent);
			} catch {
				hasFencedConfig = false;
			}

			if (dryRun) {
				if (rp1SkillDirs.length > 0) {
					console.log("Would remove skill directories:");
					for (const dir of rp1SkillDirs) {
						console.log(`  - ${join(paths.skillsDir, dir)}`);
					}
				}
				if (hasAgentsDir) {
					console.log(`Would remove agents directory: ${paths.agentsDir}`);
				}
				if (hasFencedConfig) {
					console.log("Would remove rp1 sections from config.toml");
				}
				if (rp1SkillDirs.length === 0 && !hasAgentsDir && !hasFencedConfig) {
					console.log("No rp1 content found to remove.");
				}
				return { skillsRemoved: 0, configCleaned: false };
			}

			for (const dirName of rp1SkillDirs) {
				const targetPath = join(paths.skillsDir, dirName);
				if (!isSafeToRemove(targetPath, paths)) {
					throw installError(
						"uninstall",
						`Refusing to remove structural directory: ${targetPath}. ` +
							"Only rp1-managed content may be removed.",
					);
				}
				await rm(targetPath, { recursive: true });
				skillsRemoved++;
			}

			if (hasAgentsDir) {
				if (!isSafeToRemove(paths.agentsDir, paths)) {
					throw installError(
						"uninstall",
						`Refusing to remove structural directory: ${paths.agentsDir}. ` +
							"Only the rp1 agent subdirectory may be removed.",
					);
				}
				await rm(paths.agentsDir, { recursive: true });
			}

			if (hasFencedConfig) {
				const configContent = await readFile(paths.configFile, "utf-8");
				const cleaned = replaceShellFencedContent(configContent, "").trim();
				if (cleaned.length > 0) {
					await writeFile(paths.configFile, `${cleaned}\n`, "utf-8");
				} else {
					await writeFile(paths.configFile, "", "utf-8");
				}
				configCleaned = true;
			}

			return { skillsRemoved, configCleaned };
		},
		(e) => {
			if (typeof e === "object" && e !== null && "_tag" in e) {
				return e as CLIError;
			}
			return installError(
				"uninstall",
				`Failed to uninstall Codex plugins: ${e}`,
			);
		},
	);

/**
 * Preview what the installer would do without writing any files.
 */
export const previewCodexInstallation = (
	artifactsDir: string,
	paths: CodexPaths,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			console.log("[dry-run] Installation preview:\n");
			console.log("Skills to install:");

			for (const plugin of CODEX_PLUGINS) {
				const skillsSrc = join(artifactsDir, plugin, "skills");
				try {
					const entries = await readdir(skillsSrc, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
							console.log(
								`  - ${entry.name} -> ${join(paths.skillsDir, entry.name)}`,
							);
						}
					}
				} catch {
					// skills dir may not exist for this plugin
				}
			}

			console.log("\nPer-agent TOML files to install:");
			for (const plugin of CODEX_PLUGINS) {
				const agentsSrc = join(artifactsDir, plugin, "agents");
				try {
					const entries = await readdir(agentsSrc, { withFileTypes: true });
					for (const entry of entries) {
						if (!entry.isDirectory() && entry.name.endsWith(".toml")) {
							console.log(
								`  - ${entry.name} -> ${join(paths.agentsDir, entry.name)}`,
							);
						}
					}
				} catch {
					// agents dir may not exist for this plugin
				}
			}

			console.log("\nConfig changes:");
			const tomlPaths: string[] = [];
			for (const plugin of CODEX_PLUGINS) {
				const tomlPath = join(artifactsDir, plugin, "rp1-agents.toml");
				try {
					await stat(tomlPath);
					tomlPaths.push(tomlPath);
				} catch {
					// no toml for this plugin
				}
			}

			const patchResult = await buildConfigPatch(tomlPaths)();
			if (E.isRight(patchResult)) {
				const existingResult = await readCodexConfig(paths.configFile)();
				const existing = E.isRight(existingResult) ? existingResult.right : "";
				const newContent = mergeCodexConfig(existing, patchResult.right);
				const diff = generateConfigDiff(existing, newContent);
				console.log(diff);
			}

			console.log("\nRun without --dry-run to execute installation.");
		},
		(e) => installError("preview", `Failed to preview installation: ${e}`),
	);

/**
 * Get the default Codex artifacts directory.
 * Checks for dist/codex/ relative to the module location.
 * Returns null if not found.
 */
export const getDefaultCodexArtifactsDir = (): string | null => {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(moduleDir, "..", "..", "..", "dist", "codex"), // From src/install/codex/ -> dist/codex
		join(moduleDir, "..", "..", "dist", "codex"),
		join(moduleDir, "..", "dist", "codex"),
		join(moduleDir, "..", "cli", "dist", "codex"), // From bin/ -> cli/dist/codex (compiled binary)
		join(process.cwd(), "cli", "dist", "codex"), // CWD-relative for dev usage
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
};
