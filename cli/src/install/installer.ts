/**
 * Installer module for copying rp1 artifacts to OpenCode directories.
 */

import { existsSync } from "node:fs";
import {
	chmod,
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import {
	backupError,
	formatError,
	installError,
	strictModeError,
} from "../../shared/errors.js";
import type {
	BackupManifest,
	InstallResult,
	RestoreResult,
	StagingResult,
	StagingVerificationResult,
} from "./models.js";
import { type InstallPathContext, resolveInstallPathContext } from "./paths.js";

/**
 * Recursively find all files matching a pattern in a directory.
 */
const findFiles = async (dir: string, pattern: RegExp): Promise<string[]> => {
	const results: string[] = [];

	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			const subResults = await findFiles(fullPath, pattern);
			results.push(...subResults);
		} else if (pattern.test(entry.name)) {
			results.push(fullPath);
		}
	}

	return results;
};

/**
 * Recursively copy a directory.
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
			await chmod(dstPath, 0o755);
		} else {
			await copyFile(srcPath, dstPath);
			await chmod(dstPath, extname(dstPath) === ".sh" ? 0o755 : 0o644);
			count++;
		}
	}

	return count;
};

/**
 * Copy rp1 artifacts from source to target directory.
 * Handles flat namespaced agent files (agents/rp1-base-{agent}.md).
 *
 * When strict mode is enabled (REQ-013), missing source directories cause
 * installation failure instead of logging a warning and continuing.
 */
export const copyArtifacts = (
	sourceDir: string,
	targetDir: string,
	onOverwrite?: (path: string) => void,
	logger?: { debug: (msg: string) => void },
	strict?: boolean,
): TE.TaskEither<CLIError, number> =>
	TE.tryCatch(
		async () => {
			let filesCopied = 0;

			const agentSrc = join(sourceDir, "agents");
			try {
				const stats = await stat(agentSrc);
				if (stats.isDirectory()) {
					const agentDst = join(targetDir, "agents");
					await mkdir(agentDst, { recursive: true });

					const agentFiles = await findFiles(agentSrc, /\.md$/);

					// Migrate legacy agent layout for the plugin being installed.
					// Only inspects the matching legacy directory (e.g., agents/rp1-base/).
					// Only removes known plugin-generated files. Unknown files are preserved.
					// Removes the legacy directory only when empty after migration.
					const knownFlatNames = new Set(
						agentFiles.map((f) => f.split("/").pop() ?? ""),
					);
					const pluginPrefixes = new Set<string>();
					for (const name of knownFlatNames) {
						const match = name.match(/^(rp1-[^-]+-)/);
						if (match) pluginPrefixes.add(match[1].slice(0, -1));
					}
					for (const pluginPrefix of pluginPrefixes) {
						const legacyDir = join(agentDst, pluginPrefix);
						try {
							const legacyStat = await stat(legacyDir);
							if (legacyStat.isDirectory()) {
								const legacyEntries = await readdir(legacyDir);
								for (const entry of legacyEntries) {
									const flatEquivalent = `${pluginPrefix}-${entry}`;
									if (knownFlatNames.has(flatEquivalent)) {
										await rm(join(legacyDir, entry));
										logger?.debug(
											`Migrated legacy agent: ${pluginPrefix}/${entry} -> ${flatEquivalent}`,
										);
									} else {
										logger?.debug(
											`Preserving unknown file in legacy dir: ${pluginPrefix}/${entry}`,
										);
									}
								}
								const remaining = await readdir(legacyDir);
								if (remaining.length === 0) {
									await rm(legacyDir, { recursive: true });
									logger?.debug(
										`Removed empty legacy directory: ${pluginPrefix}`,
									);
								} else {
									logger?.debug(
										`Legacy dir ${pluginPrefix}/ not empty after migration (${remaining.length} files), preserving`,
									);
								}
							}
						} catch {
							// Legacy directory doesn't exist
						}
					}

					for (const srcFile of agentFiles) {
						const relPath = relative(agentSrc, srcFile);
						const dstFile = join(agentDst, relPath);

						await mkdir(join(dstFile, ".."), { recursive: true });

						try {
							await stat(dstFile);
							onOverwrite?.(`agents/${relPath}`);
						} catch (e) {
							logger?.debug(
								`Agent file does not exist (will create): ${dstFile}: ${e}`,
							);
						}

						await copyFile(srcFile, dstFile);
						await chmod(dstFile, 0o644);
						filesCopied++;
					}
				}
			} catch (e) {
				if (strict) {
					throw strictModeError(
						agentSrc,
						`Missing source directory: ${agentSrc}`,
					);
				}
				logger?.debug(`Agent directory not found at ${agentSrc}: ${e}`);
			}

			const skillsSrc = join(sourceDir, "skills");
			try {
				const stats = await stat(skillsSrc);
				if (stats.isDirectory()) {
					const skillsDst = join(targetDir, "skills");
					await mkdir(skillsDst, { recursive: true });

					const entries = await readdir(skillsSrc, { withFileTypes: true });
					for (const entry of entries) {
						if (!entry.isDirectory()) continue;

						// Safety: only install rp1-namespaced skills to avoid clobbering user skills
						if (!entry.name.startsWith("rp1-")) {
							logger?.debug(
								`Skipping non-namespaced skill directory: ${entry.name}`,
							);
							continue;
						}

						const srcSkillDir = join(skillsSrc, entry.name);
						const dstSkillDir = join(skillsDst, entry.name);

						try {
							await stat(dstSkillDir);
							onOverwrite?.(`skills/${entry.name}`);
							await rm(dstSkillDir, { recursive: true });
						} catch (e) {
							logger?.debug(
								`Skill directory does not exist (will create): ${dstSkillDir}: ${e}`,
							);
						}

						filesCopied += await copyDir(srcSkillDir, dstSkillDir);
					}
				}
			} catch (e) {
				if (strict) {
					throw strictModeError(
						skillsSrc,
						`Missing source directory: ${skillsSrc}`,
					);
				}
				logger?.debug(`Skills directory not found at ${skillsSrc}: ${e}`);
			}

			return filesCopied;
		},
		(e) => installError("copy-artifacts", `Failed to copy artifacts: ${e}`),
	);

/**
 * Create backup of existing rp1 installation.
 */
export const backupExistingInstallation = (
	logger?: { debug: (msg: string) => void },
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, BackupManifest> =>
	TE.tryCatch(
		async () => {
			const backupDir = paths.backupDir;
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19);
			const backupPath = join(backupDir, `backup_${timestamp}`);
			await mkdir(backupPath, { recursive: true });

			const configDir = paths.openCodeConfigDir;
			let filesBackedUp = 0;

			try {
				await stat(configDir);
			} catch (e) {
				logger?.debug(
					`No existing installation to backup at ${configDir}: ${e}`,
				);
				return {
					timestamp,
					backupPath,
					filesBackedUp: 0,
				};
			}

			const agentDir = join(configDir, "agents");
			try {
				const stats = await stat(agentDir);
				if (stats.isDirectory()) {
					const backupAgentDir = join(backupPath, "agents");
					const agentFiles = await findFiles(agentDir, /\.md$/);
					for (const srcFile of agentFiles) {
						const relPath = relative(agentDir, srcFile);
						const dstFile = join(backupAgentDir, relPath);
						await mkdir(join(dstFile, ".."), { recursive: true });
						await copyFile(srcFile, dstFile);
						filesBackedUp++;
					}
				}
			} catch (e) {
				logger?.debug(`No agents to backup at ${agentDir}: ${e}`);
			}

			const skillsDir = join(configDir, "skills");
			try {
				const stats = await stat(skillsDir);
				if (stats.isDirectory()) {
					const backupSkillsDir = join(backupPath, "skills");
					// Back up all rp1-namespaced skills
					const skillEntries = await readdir(skillsDir, {
						withFileTypes: true,
					});
					for (const entry of skillEntries) {
						if (!entry.isDirectory() || !entry.name.startsWith("rp1-")) {
							continue;
						}
						const skillDir = join(skillsDir, entry.name);
						try {
							filesBackedUp += await copyDir(
								skillDir,
								join(backupSkillsDir, entry.name),
							);
						} catch (e) {
							logger?.debug(
								`Skill ${entry.name} backup failed at ${skillDir}: ${e}`,
							);
						}
					}
				}
			} catch (e) {
				logger?.debug(`No skills directory at ${skillsDir}: ${e}`);
			}

			const configFile = join(configDir, "opencode.json");
			try {
				await copyFile(configFile, join(backupPath, "opencode.json"));
				filesBackedUp++;
			} catch (e) {
				logger?.debug(`No config file to backup at ${configFile}: ${e}`);
			}

			const pluginDir = join(configDir, "plugins");
			const rp1Plugins = ["rp1-base-hooks"];
			try {
				const pluginStats = await stat(pluginDir);
				if (pluginStats.isDirectory()) {
					const backupPluginDir = join(backupPath, "plugin");
					for (const pluginName of rp1Plugins) {
						const srcPluginDir = join(pluginDir, pluginName);
						try {
							await stat(srcPluginDir);
							filesBackedUp += await copyDir(
								srcPluginDir,
								join(backupPluginDir, pluginName),
							);
						} catch (e) {
							logger?.debug(
								`Plugin ${pluginName} does not exist at ${srcPluginDir}: ${e}`,
							);
						}
					}
				}
			} catch (e) {
				logger?.debug(`No plugins directory at ${pluginDir}: ${e}`);
			}

			const manifest: BackupManifest = {
				timestamp,
				backupPath,
				filesBackedUp,
			};

			await writeFile(
				join(backupPath, "manifest.json"),
				JSON.stringify(manifest, null, 2),
			);

			return manifest;
		},
		(e) => backupError(`Failed to create backup: ${e}`),
	);

/**
 * Restore installation from a backup manifest.
 * Removes current rp1 files and copies backup files to target.
 * Deletes manifest.json after successful restoration to prevent duplicate attempts.
 */
export const restoreFromBackup = (
	manifest: BackupManifest,
	logger?: { debug: (msg: string) => void },
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, RestoreResult> =>
	TE.tryCatch(
		async () => {
			const { backupPath } = manifest;
			const configDir = paths.openCodeConfigDir;
			let filesRestored = 0;

			try {
				await stat(backupPath);
			} catch (e) {
				logger?.debug(`Backup path does not exist: ${backupPath}: ${e}`);
				throw new Error(`Backup path does not exist: ${backupPath}`);
			}

			const backupAgentDir = join(backupPath, "agents");
			try {
				const stats = await stat(backupAgentDir);
				if (stats.isDirectory()) {
					const targetAgentDir = join(configDir, "agents");

					try {
						const entries = await readdir(targetAgentDir, {
							withFileTypes: true,
						});
						for (const entry of entries) {
							if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
								// Remove legacy agent subdirectories
								await rm(join(targetAgentDir, entry.name), { recursive: true });
								logger?.debug(
									`Removed existing agent directory: ${entry.name}`,
								);
							} else if (
								entry.isFile() &&
								entry.name.startsWith("rp1-") &&
								entry.name.endsWith(".md")
							) {
								// Remove flat agent files
								await rm(join(targetAgentDir, entry.name));
								logger?.debug(`Removed existing agent file: ${entry.name}`);
							}
						}
					} catch (e) {
						logger?.debug(
							`Target agent directory may not exist at ${targetAgentDir}: ${e}`,
						);
					}

					const agentFiles = await findFiles(backupAgentDir, /\.md$/);
					for (const srcFile of agentFiles) {
						const relPath = relative(backupAgentDir, srcFile);
						const dstFile = join(targetAgentDir, relPath);
						await mkdir(dirname(dstFile), { recursive: true });
						await copyFile(srcFile, dstFile);
						await chmod(dstFile, 0o644);
						filesRestored++;
						logger?.debug(`Restored agent: ${relPath}`);
					}
				}
			} catch (e) {
				logger?.debug(`No agents to restore from backup: ${e}`);
			}

			const backupSkillsDir = join(backupPath, "skills");
			try {
				const stats = await stat(backupSkillsDir);
				if (stats.isDirectory()) {
					const targetSkillsDir = join(configDir, "skills");
					const entries = await readdir(backupSkillsDir, {
						withFileTypes: true,
					});

					for (const entry of entries) {
						if (entry.isDirectory()) {
							const srcSkillDir = join(backupSkillsDir, entry.name);
							const dstSkillDir = join(targetSkillsDir, entry.name);

							try {
								await rm(dstSkillDir, { recursive: true });
								logger?.debug(`Removed existing skill: ${entry.name}`);
							} catch (e) {
								logger?.debug(
									`Skill directory does not exist (will create): ${dstSkillDir}: ${e}`,
								);
							}

							filesRestored += await copyDir(srcSkillDir, dstSkillDir);
							logger?.debug(`Restored skill: ${entry.name}`);
						}
					}
				}
			} catch (e) {
				logger?.debug(`No skills to restore from backup: ${e}`);
			}

			const backupPluginDir = join(backupPath, "plugin");
			try {
				const stats = await stat(backupPluginDir);
				if (stats.isDirectory()) {
					const targetPluginDir = join(configDir, "plugins");
					const entries = await readdir(backupPluginDir, {
						withFileTypes: true,
					});

					for (const entry of entries) {
						if (entry.isDirectory()) {
							const srcPluginDir = join(backupPluginDir, entry.name);
							const dstPluginDir = join(targetPluginDir, entry.name);

							try {
								await rm(dstPluginDir, { recursive: true });
								logger?.debug(`Removed existing plugin: ${entry.name}`);
							} catch (e) {
								logger?.debug(
									`Plugin directory does not exist (will create): ${dstPluginDir}: ${e}`,
								);
							}

							filesRestored += await copyDir(srcPluginDir, dstPluginDir);
							logger?.debug(`Restored plugin: ${entry.name}`);
						}
					}
				}
			} catch (e) {
				logger?.debug(`No plugins to restore from backup: ${e}`);
			}

			const backupConfig = join(backupPath, "opencode.json");
			try {
				await stat(backupConfig);
				const targetConfig = join(configDir, "opencode.json");
				await copyFile(backupConfig, targetConfig);
				await chmod(targetConfig, 0o644);
				filesRestored++;
				logger?.debug("Restored opencode.json");
			} catch (e) {
				logger?.debug(`No opencode.json to restore from backup: ${e}`);
			}

			let manifestDeleted = false;
			const manifestPath = join(backupPath, "manifest.json");
			try {
				await rm(manifestPath);
				manifestDeleted = true;
				logger?.debug(
					"Deleted backup manifest to prevent duplicate restoration",
				);
			} catch (e) {
				logger?.debug(`Could not delete manifest.json: ${e}`);
			}

			return {
				filesRestored,
				manifestDeleted,
			};
		},
		(e) => backupError(`Failed to restore from backup: ${e}`),
	);

/**
 * Copy OpenCode plugin from source to target plugin directory.
 * Source: {sourceDir}/platforms/opencode/
 * Target: ~/.config/opencode/plugin/{plugin-name}/
 * Returns the number of files copied, or 0 if no plugin exists at source.
 */
/**
 * Remove all rp1-* plugins from OpenCode plugins directory.
 * Cleans up both old-style subdirectories and new-style flat files.
 */
export const cleanRp1Plugins = async (
	logger?: { debug: (msg: string) => void },
	paths: InstallPathContext = resolveInstallPathContext(),
): Promise<void> => {
	const pluginsDir = paths.openCodePluginsDir;
	const legacyDir = paths.legacyOpenCodePluginDir;

	// Clean legacy plugin/ directory (singular)
	try {
		await rm(legacyDir, { recursive: true, force: true });
		logger?.debug(`Removed legacy plugin directory: ${legacyDir}`);
	} catch {
		// May not exist
	}

	// Clean rp1-* entries from plugins/ directory
	try {
		const entries = await readdir(pluginsDir);
		for (const entry of entries) {
			if (entry.startsWith("rp1-")) {
				const fullPath = join(pluginsDir, entry);
				await rm(fullPath, { recursive: true, force: true });
				logger?.debug(`Removed old plugin: ${fullPath}`);
			}
		}
	} catch {
		// Directory may not exist yet
	}
};

export const copyOpenCodePlugin = (
	sourceDir: string,
	pluginName: string,
	onProgress?: (message: string) => void,
	logger?: { debug: (msg: string) => void },
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, number> =>
	TE.tryCatch(
		async () => {
			const opencodeSrc = join(sourceDir, "platforms", "opencode", "index.ts");
			const pluginsDir = paths.openCodePluginsDir;
			const targetFile = join(pluginsDir, `${pluginName}.ts`);

			try {
				await stat(opencodeSrc);
			} catch (e) {
				logger?.debug(
					`OpenCode plugin source not found at ${opencodeSrc}: ${e}`,
				);
				return 0;
			}

			await mkdir(pluginsDir, { recursive: true });

			const content = await readFile(opencodeSrc, "utf-8");
			await writeFile(targetFile, content);
			onProgress?.(`Installed ${pluginName} plugin`);

			return 1;
		},
		(e) => installError("copy-plugin", `Failed to copy plugin: ${e}`),
	);

/**
 * Get the staging directory path.
 * Uses ~/.config/.rp1-staging to ensure same filesystem as target for atomic rename.
 */
export const getStagingPath = (
	paths: InstallPathContext = resolveInstallPathContext(),
): string => paths.stagingDir;

/**
 * Copy plugin artifacts to staging directory.
 * All files are copied to staging before atomic rename to target.
 */
export const copyToStaging = (
	pluginDirs: readonly string[],
	onProgress?: (message: string) => void,
	logger?: { debug: (msg: string) => void },
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, StagingResult> =>
	TE.tryCatch(
		async () => {
			const stagingPath = getStagingPath(paths);

			await mkdir(stagingPath, { recursive: true, mode: 0o700 });
			logger?.debug(`Created staging directory: ${stagingPath}`);

			let totalFilesCopied = 0;
			const pluginsCopied: string[] = [];

			for (const pluginDir of pluginDirs) {
				const pluginName = pluginDir.split("/").pop() ?? "unknown";
				onProgress?.(`Staging ${pluginName}...`);

				const agentSrc = join(pluginDir, "agents");
				try {
					const stats = await stat(agentSrc);
					if (stats.isDirectory()) {
						const agentDst = join(stagingPath, "agents");
						await mkdir(agentDst, { recursive: true });

						const agentFiles = await findFiles(agentSrc, /\.md$/);
						for (const srcFile of agentFiles) {
							const relPath = relative(agentSrc, srcFile);
							const dstFile = join(agentDst, relPath);
							await mkdir(dirname(dstFile), { recursive: true });
							await copyFile(srcFile, dstFile);
							await chmod(dstFile, 0o644);
							totalFilesCopied++;
						}
					}
				} catch (e) {
					logger?.debug(`Agent directory not found at ${agentSrc}: ${e}`);
				}

				const skillsSrc = join(pluginDir, "skills");
				try {
					const stats = await stat(skillsSrc);
					if (stats.isDirectory()) {
						const skillsDst = join(stagingPath, "skills");
						await mkdir(skillsDst, { recursive: true });

						const entries = await readdir(skillsSrc, { withFileTypes: true });
						for (const entry of entries) {
							if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
								const srcSkillDir = join(skillsSrc, entry.name);
								const dstSkillDir = join(skillsDst, entry.name);
								totalFilesCopied += await copyDir(srcSkillDir, dstSkillDir);
							}
						}
					}
				} catch (e) {
					logger?.debug(`Skills directory not found at ${skillsSrc}: ${e}`);
				}

				let openCodePluginName: string | null = null;
				try {
					const manifestPath = join(pluginDir, "manifest.json");
					const manifestContent = await readFile(manifestPath, "utf-8");
					const manifest = JSON.parse(manifestContent) as {
						hasOpenCodePlugin?: boolean;
						plugin?: string;
					};
					if (manifest.hasOpenCodePlugin && manifest.plugin) {
						openCodePluginName = `${manifest.plugin}-hooks`;
					}
				} catch (e) {
					logger?.debug(
						`No manifest or invalid manifest at ${pluginDir}/manifest.json: ${e}`,
					);
					openCodePluginName = `rp1-${pluginName}-hooks`;
				}

				if (openCodePluginName) {
					const opencodeSrc = join(
						pluginDir,
						"platforms",
						"opencode",
						"index.ts",
					);
					try {
						await stat(opencodeSrc);
						const pluginsDst = join(stagingPath, "plugins");
						await mkdir(pluginsDst, { recursive: true });
						const content = await readFile(opencodeSrc, "utf-8");
						await writeFile(
							join(pluginsDst, `${openCodePluginName}.ts`),
							content,
						);
						totalFilesCopied += 1;
						logger?.debug(
							`Copied OpenCode plugin ${openCodePluginName}.ts to staging`,
						);
					} catch (e) {
						logger?.debug(
							`OpenCode plugin source not found at ${opencodeSrc}: ${e}`,
						);
					}
				}

				pluginsCopied.push(pluginName);
				logger?.debug(
					`Staged ${pluginName}: ${totalFilesCopied} files total so far`,
				);
			}

			onProgress?.(`Staged ${totalFilesCopied} files to ${stagingPath}`);

			return {
				stagingPath,
				filesCopied: totalFilesCopied,
				pluginsCopied,
			};
		},
		(e) => installError("copy-to-staging", `Failed to copy to staging: ${e}`),
	);

/**
 * Count total files recursively in a directory.
 */
const countFiles = async (dir: string): Promise<number> => {
	let count = 0;
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				count += await countFiles(fullPath);
			} else {
				count++;
			}
		}
	} catch {
		// Directory doesn't exist, count = 0
	}
	return count;
};

/**
 * Verify staging directory contents match expected plugin manifests.
 * Checks file count and presence of required plugin directories.
 */
export const verifyStagingContents = (
	stagingPath: string,
	expectedPlugins: readonly string[],
	expectedFileCount?: number,
	logger?: { debug: (msg: string) => void },
): TE.TaskEither<CLIError, StagingVerificationResult> =>
	TE.tryCatch(
		async () => {
			const actualFiles = await countFiles(stagingPath);
			logger?.debug(`Staging verification: ${actualFiles} files found`);

			const missingPlugins: string[] = [];
			for (const pluginName of expectedPlugins) {
				// Check for flat agent files (rp1-{plugin}-*.md) or skills/ with content
				const agentsDir = join(stagingPath, "agents");
				const skillDir = join(stagingPath, "skills");

				let hasContent = false;
				try {
					const agentEntries = await readdir(agentsDir);
					const hasAgentFiles = agentEntries.some(
						(entry) =>
							entry.startsWith(`rp1-${pluginName}-`) && entry.endsWith(".md"),
					);
					if (hasAgentFiles) {
						hasContent = true;
					}
				} catch {
					// Agents dir doesn't exist
				}

				try {
					await stat(skillDir);
					const skillEntries = await readdir(skillDir);
					if (skillEntries.length > 0) {
						hasContent = true;
					}
				} catch {
					// Skill dir doesn't exist
				}

				if (!hasContent) {
					missingPlugins.push(pluginName);
					logger?.debug(`Missing content for plugin ${pluginName} in staging`);
				}
			}

			const expectedFiles = expectedFileCount ?? actualFiles;
			const valid = missingPlugins.length === 0 && actualFiles >= expectedFiles;

			logger?.debug(
				`Staging verification: valid=${valid}, expected=${expectedFiles}, actual=${actualFiles}, missing=${missingPlugins.join(", ")}`,
			);

			return {
				valid,
				expectedFiles,
				actualFiles,
				missingPlugins,
			};
		},
		(e) =>
			installError("verify-staging", `Failed to verify staging contents: ${e}`),
	);

/**
 * Commit staging directory to target using atomic rename.
 * On POSIX systems (macOS, Linux), uses fs.rename for atomic operation.
 * On Windows, falls back to copy + delete if cross-filesystem rename fails.
 */
export const commitStaging = (
	stagingPath: string,
	targetPath: string,
	onProgress?: (message: string) => void,
	logger?: { debug: (msg: string) => void },
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			await mkdir(dirname(targetPath), { recursive: true });

			// We need to merge staging contents into target rather than replace entirely
			// because the target may contain user files we shouldn't remove.
			// Strategy: move each subdirectory from staging to target with backup/replace

			const stagingEntries = await readdir(stagingPath, {
				withFileTypes: true,
			});

			for (const entry of stagingEntries) {
				const srcPath = join(stagingPath, entry.name);
				const dstPath = join(targetPath, entry.name);

				if (entry.isDirectory()) {
					// For directories, we need to merge contents or replace
					// For rp1 artifacts, we replace the whole subdirectory to ensure atomicity
					try {
						// Backup existing directory if it exists
						const backupPath = `${dstPath}.rp1-backup`;
						try {
							await stat(dstPath);
							await rename(dstPath, backupPath);
							logger?.debug(`Backed up ${entry.name} to ${backupPath}`);
						} catch {
							// Target doesn't exist, no backup needed
						}

						try {
							// Atomic rename from staging to target
							await rename(srcPath, dstPath);
							logger?.debug(`Atomically moved ${entry.name} to target`);

							// Remove backup on success
							try {
								await rm(backupPath, { recursive: true });
							} catch {
								// Backup may not exist
							}
						} catch (renameErr) {
							// Rename failed (possibly cross-filesystem on Windows)
							logger?.debug(
								`Atomic rename failed for ${entry.name}, falling back to copy: ${renameErr}`,
							);

							// Fallback: copy then delete
							await copyDir(srcPath, dstPath);
							await rm(srcPath, { recursive: true });

							// Remove backup on success
							try {
								await rm(backupPath, { recursive: true });
							} catch {
								// Backup may not exist
							}
						}
					} catch (e) {
						// Restore from backup if commit failed
						const backupPath = `${dstPath}.rp1-backup`;
						try {
							await rm(dstPath, { recursive: true });
							await rename(backupPath, dstPath);
							logger?.debug(`Restored ${entry.name} from backup after failure`);
						} catch {
							// Best effort restore
						}
						throw e;
					}
				} else {
					// For files (like opencode.json), copy directly
					await copyFile(srcPath, dstPath);
					await chmod(dstPath, 0o644);
					logger?.debug(`Copied file ${entry.name} to target`);
				}
			}

			onProgress?.("Installation committed successfully");
			logger?.debug(`Committed staging to ${targetPath}`);
		},
		(e) =>
			installError(
				"commit-staging",
				`Failed to commit staging to target: ${e}`,
			),
	);

/**
 * Clean up staging directory on failure.
 * Ensures BR-002: Staging directory must be completely removed on failure.
 */
export const cleanupStaging = (
	stagingPath: string,
	logger?: { debug: (msg: string) => void },
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			try {
				await stat(stagingPath);
				await rm(stagingPath, { recursive: true, force: true });
				logger?.debug(`Cleaned up staging directory: ${stagingPath}`);
			} catch (e) {
				logger?.debug(
					`Staging directory already removed or doesn't exist: ${e}`,
				);
			}
		},
		(e) => installError("cleanup-staging", `Failed to cleanup staging: ${e}`),
	);

/**
 * Perform the actual installation of rp1 artifacts.
 * This is an internal helper function used by installRp1.
 * Separated to enable recovery wrapper pattern.
 *
 * When strict mode is enabled, missing source directories cause installation failure.
 */
const performInstallation = (
	pluginDirs: readonly string[],
	backup: BackupManifest,
	onProgress?: (message: string) => void,
	onOverwrite?: (path: string) => void,
	logger?: { debug: (msg: string) => void },
	strict?: boolean,
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, InstallResult> =>
	TE.tryCatch(
		async () => {
			const targetDir = paths.openCodeConfigDir;
			const pluginsInstalled: string[] = [];
			const warnings: string[] = [];
			let totalFiles = 0;

			for (const pluginDir of pluginDirs) {
				const pluginName = pluginDir.split("/").pop() ?? "unknown";

				const result = await copyArtifacts(
					pluginDir,
					targetDir,
					onOverwrite,
					logger,
					strict,
				)();
				if (result._tag === "Left") {
					throw new Error(formatError(result.left, false));
				}

				const filesCopied = result.right;
				onProgress?.(`Installed ${pluginName} plugin: ${filesCopied} files`);
				pluginsInstalled.push(pluginName);
				totalFiles += filesCopied;

				// Read plugin manifest to get OpenCode plugin name
				let openCodePluginName: string | null = null;
				try {
					const manifestPath = join(pluginDir, "manifest.json");
					const manifestContent = await readFile(manifestPath, "utf-8");
					const manifest = JSON.parse(manifestContent) as {
						hasOpenCodePlugin?: boolean;
						plugin?: string;
					};
					if (manifest.hasOpenCodePlugin && manifest.plugin) {
						// Plugin name is "rp1-base" -> hooks name is "rp1-base-hooks"
						openCodePluginName = `${manifest.plugin}-hooks`;
					}
				} catch (e) {
					logger?.debug(
						`No manifest or invalid manifest at ${pluginDir}/manifest.json: ${e}`,
					);
					openCodePluginName = `rp1-${pluginName}-hooks`;
				}

				if (openCodePluginName) {
					const pluginResult = await copyOpenCodePlugin(
						pluginDir,
						openCodePluginName,
						onProgress,
						logger,
						paths,
					)();
					if (pluginResult._tag === "Left") {
						warnings.push(
							`OpenCode plugin installation failed: ${formatError(pluginResult.left, false)}`,
						);
					} else if (pluginResult.right > 0) {
						totalFiles += pluginResult.right;
					}
				}
			}

			return {
				pluginsInstalled,
				filesInstalled: totalFiles,
				backupPath: backup.filesBackedUp > 0 ? backup.backupPath : null,
				warnings,
			};
		},
		(e) => installError("install", `Installation failed: ${e}`),
	);

/**
 * Install rp1 artifacts to OpenCode (orchestrator function).
 * Implements automatic rollback on failure (REQ-002).
 *
 * The installation is wrapped with recovery logic:
 * 1. Create backup before any modifications (BR-001)
 * 2. Attempt installation
 * 3. On failure, restore from backup and notify user
 * 4. Re-throw the original error after restoration
 *
 * When strict mode is enabled (REQ-013), missing source directories cause
 * installation failure with exit code 5 (STRICT_MODE_FAILURE) instead of
 * logging a warning and continuing.
 */
export const installRp1 = (
	pluginDirs: readonly string[],
	onProgress?: (message: string) => void,
	onOverwrite?: (path: string) => void,
	logger?: { debug: (msg: string) => void },
	strict?: boolean,
	paths: InstallPathContext = resolveInstallPathContext(),
): TE.TaskEither<CLIError, InstallResult> =>
	pipe(
		backupExistingInstallation(logger, paths),
		TE.chain((backup) => {
			onProgress?.(`Backup created: ${backup.backupPath}`);

			return pipe(
				TE.tryCatch(
					() => cleanRp1Plugins(logger, paths),
					(e) =>
						installError("clean-plugins", `Failed to clean old plugins: ${e}`),
				),
				TE.chain(() =>
					performInstallation(
						pluginDirs,
						backup,
						onProgress,
						onOverwrite,
						logger,
						strict,
						paths,
					),
				),
				// On installation failure, attempt to restore from backup
				TE.orElse(
					(error): TE.TaskEither<CLIError, InstallResult> =>
						pipe(
							restoreFromBackup(backup, logger, paths),
							TE.chain((restoreResult) => {
								if (restoreResult.filesRestored > 0) {
									onProgress?.(
										`Installation failed. Restored previous installation (${restoreResult.filesRestored} files). You can safely retry the installation.`,
									);
								} else {
									onProgress?.(
										"Installation failed. No previous installation to restore.",
									);
								}
								logger?.debug(
									`Rollback completed: ${restoreResult.filesRestored} files restored, manifest deleted: ${restoreResult.manifestDeleted}`,
								);
								// Re-throw the original error after successful restoration
								return TE.left<CLIError, InstallResult>(error);
							}),
							// If restoration also fails, log and re-throw original error
							TE.orElse((restoreError) => {
								logger?.debug(
									`Restoration failed: ${formatError(restoreError, false)}`,
								);
								onProgress?.(
									`Installation failed. Warning: Could not restore previous installation. Manual intervention may be required.`,
								);
								// Still throw the original installation error
								return TE.left<CLIError, InstallResult>(error);
							}),
						),
				),
			);
		}),
	);

/**
 * Get the default artifacts directory.
 * Checks for bundled artifacts relative to the binary location.
 * Returns null if no artifacts are found (user must specify --artifacts-dir or build first).
 */
export const getDefaultArtifactsDir = (): string | null => {
	// Check for bundled artifacts (when installed as npm package or binary)
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const bundledPaths = [
		join(moduleDir, "..", "..", "dist", "opencode"), // From src/install/ -> dist/opencode
		join(moduleDir, "..", "dist", "opencode"), // Alternative structure
		join(moduleDir, "dist", "opencode"), // Direct child
	];

	for (const bundledPath of bundledPaths) {
		if (existsSync(bundledPath)) {
			return bundledPath;
		}
	}

	// No bundled artifacts found - return null to indicate user must build or specify path
	return null;
};
