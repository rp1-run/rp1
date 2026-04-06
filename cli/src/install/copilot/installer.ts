/**
 * Copilot installer orchestrator.
 * Manages the full install/uninstall lifecycle for rp1 plugins in Copilot CLI.
 */

import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
import { createSpinner } from "../../../shared/spinner.js";
import { OPTIONAL_PLUGINS, REQUIRED_PLUGINS } from "../../assets/reader.js";
import type { InstallContext } from "../../shared/install-core.js";
import type {
	CopilotInstallConfig,
	CopilotInstallResult,
	CopilotPaths,
	CopilotUninstallResult,
} from "./models.js";
import {
	checkCopilotInstalled,
	checkCopilotVersion,
	checkWritePermissions,
	getCopilotPaths,
} from "./prerequisites.js";

/** Extract plugin names (e.g. "rp1-base") from plugin directory paths. */
const pluginNamesFromDirs = (dirs: readonly string[]): string[] =>
	dirs.map((d) => `rp1-${basename(d)}`);

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
 * Verify that Copilot build artifacts exist at the given directory.
 * Checks for dist/copilot/{base,dev}/ with skills/ and agents/ directories.
 */
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

				pluginDirs.push(pluginDir);
			}

			for (const plugin of OPTIONAL_PLUGINS) {
				const pluginDir = join(artifactsDir, plugin);
				try {
					await stat(join(pluginDir, "skills"));
					await stat(join(pluginDir, "agents"));
					pluginDirs.push(pluginDir);
				} catch {
					// Optional plugin not present, skip
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

/**
 * Create a timestamped backup of the current Copilot installation.
 * Backs up any existing rp1-* skill and agent directories.
 */
export const backupCopilotInstallation = (
	paths: CopilotPaths,
): TE.TaskEither<CLIError, string | null> =>
	TE.tryCatch(
		async () => {
			let hasContent = false;

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
				const entries = await readdir(paths.agentsDir, {
					withFileTypes: true,
				});
				if (entries.some((e) => e.name.startsWith("rp1"))) {
					hasContent = true;
				}
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
				const entries = await readdir(paths.agentsDir, {
					withFileTypes: true,
				});
				for (const entry of entries) {
					if (!entry.name.startsWith("rp1")) continue;
					const srcPath = join(paths.agentsDir, entry.name);
					if (entry.isDirectory()) {
						const dstDir = join(backupPath, "agents", entry.name);
						await copyDir(srcPath, dstDir);
					} else {
						const dstDir = join(backupPath, "agents");
						await mkdir(dstDir, { recursive: true });
						await copyFile(srcPath, join(dstDir, entry.name));
					}
				}
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
		(e) => backupError(`Failed to create Copilot backup: ${e}`),
	);

/**
 * Copy skill directories from build artifacts to Copilot skills directory.
 * Overwrites existing rp1-* directories; preserves non-rp1 content.
 */
export const copyCopilotSkills = (
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
		(e) => installError("copy-skills", `Failed to copy Copilot skills: ${e}`),
	);

/**
 * Copy per-agent Markdown files from build output to Copilot agents directory.
 * Creates the target directory if it does not exist.
 */
export const copyCopilotAgents = (
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
					if (entry.isDirectory() || !entry.name.endsWith(".md")) continue;

					const srcFile = join(agentsSrc, entry.name);
					const dstFile = join(targetDir, entry.name);
					await copyFile(srcFile, dstFile);
					totalCopied++;
				}
			}

			return totalCopied;
		},
		(e) =>
			installError("copy-agents", `Failed to copy Copilot agent files: ${e}`),
	);

/**
 * Full Copilot installation pipeline.
 * Sequence: prerequisites -> validate -> backup -> copy skills -> copy agents -> verify.
 */
export const installCopilot = (
	config: CopilotInstallConfig,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CopilotInstallResult> => {
	const isTTY = ctx.isTTY;
	const spinner = createSpinner(isTTY);
	const paths = getCopilotPaths();

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
		TE.chain(() => checkWritePermissions(paths.skillsDir)),
		TE.chain(() => checkWritePermissions(paths.agentsDir)),
		TE.chain(() => checkWritePermissions(paths.backupDir)),
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
					previewCopilotInstallation(config.artifactsDir, paths),
					TE.map(
						(): CopilotInstallResult => ({
							skillsCopied: 0,
							agentsCopied: 0,
							backupPath: null,
							warnings: ["Dry run - no changes made"],
							pluginsInstalled: pluginNamesFromDirs(pluginDirs),
						}),
					),
				);
			}

			return pipe(
				TE.Do,
				TE.chain(() => {
					spinner.start("Creating backup...");
					return backupCopilotInstallation(paths);
				}),
				TE.chain((backupPath) => {
					if (backupPath) {
						spinner.succeed(`Backup created: ${backupPath}`);
					} else {
						spinner.info("No existing installation to back up");
					}

					spinner.start("Copying skill directories...");
					return pipe(
						copyCopilotSkills(pluginDirs, paths.skillsDir),
						TE.map((skillsCopied) => ({ backupPath, skillsCopied })),
					);
				}),
				TE.chain(({ backupPath, skillsCopied }) => {
					spinner.succeed(`Copied ${skillsCopied} skill files`);

					spinner.start("Copying agent files...");
					return pipe(
						copyCopilotAgents(pluginDirs, paths.agentsDir),
						TE.map((agentsCopied) => ({
							backupPath,
							skillsCopied,
							agentsCopied,
						})),
					);
				}),
				TE.chain(({ backupPath, skillsCopied, agentsCopied }) => {
					spinner.succeed(`Copied ${agentsCopied} agent files`);

					spinner.start("Verifying installation...");
					const verifyWarnings: string[] = [];

					return TE.tryCatch(
						async () => {
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
								const agentEntries = await readdir(paths.agentsDir, {
									withFileTypes: true,
								});
								const rp1Agents = agentEntries.filter((e) =>
									e.name.startsWith("rp1"),
								);
								if (rp1Agents.length === 0) {
									verifyWarnings.push(
										`No rp1 agent files found in ${paths.agentsDir}`,
									);
								}
							} catch {
								verifyWarnings.push(
									`Could not read agents directory: ${paths.agentsDir}`,
								);
							}

							if (verifyWarnings.length > 0) {
								spinner.warn("Installation completed with warnings");
							} else {
								spinner.succeed("Installation verified");
							}

							return {
								skillsCopied,
								agentsCopied,
								backupPath,
								warnings: verifyWarnings,
								pluginsInstalled: pluginNamesFromDirs(pluginDirs),
							} satisfies CopilotInstallResult;
						},
						(e) =>
							installError(
								"verify-install",
								`Failed to verify Copilot installation: ${e}`,
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
 * Guard that ensures a path is not a structural Copilot directory.
 * Returns true if the path is safe to remove (i.e., not structural).
 */
const isSafeToRemove = (targetPath: string, paths: CopilotPaths): boolean => {
	const protectedPaths = [paths.configDir, paths.skillsDir, paths.agentsDir];
	return !protectedPaths.includes(targetPath);
};

/**
 * Remove rp1 content from Copilot: skill directories and agent files.
 *
 * Safety guarantees:
 * - Only rp1-* prefixed skill directories are removed from skills/
 * - Only rp1* prefixed agent files are removed from agents/
 * - Structural directories (~/.config/github-copilot/) are never removed
 */
export const uninstallCopilot = (
	paths: CopilotPaths,
	dryRun: boolean,
): TE.TaskEither<CLIError, CopilotUninstallResult> =>
	TE.tryCatch(
		async () => {
			let skillsRemoved = 0;
			let agentsRemoved = false;

			const rp1SkillDirs: string[] = [];
			try {
				const skillsStat = await stat(paths.skillsDir);
				if (!skillsStat.isDirectory()) {
					throw installError(
						"uninstall",
						`Expected ${paths.skillsDir} to be a directory, but it is not. ` +
							"Cannot safely enumerate rp1 skills for removal. " +
							"Verify your Copilot CLI installation structure.",
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

			const rp1AgentFiles: string[] = [];
			try {
				const agentsStat = await stat(paths.agentsDir);
				if (agentsStat.isDirectory()) {
					const entries = await readdir(paths.agentsDir, {
						withFileTypes: true,
					});
					for (const entry of entries) {
						if (entry.name.startsWith("rp1")) {
							rp1AgentFiles.push(entry.name);
						}
					}
				}
			} catch {
				// agents dir may not exist
			}

			if (dryRun) {
				if (rp1SkillDirs.length > 0) {
					console.log("Would remove skill directories:");
					for (const dir of rp1SkillDirs) {
						console.log(`  - ${join(paths.skillsDir, dir)}`);
					}
				}
				if (rp1AgentFiles.length > 0) {
					console.log("Would remove agent files:");
					for (const file of rp1AgentFiles) {
						console.log(`  - ${join(paths.agentsDir, file)}`);
					}
				}
				if (rp1SkillDirs.length === 0 && rp1AgentFiles.length === 0) {
					console.log("No rp1 content found to remove.");
				}
				return {
					skillsRemoved: 0,
					agentsRemoved: false,
				};
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

			if (rp1AgentFiles.length > 0) {
				for (const fileName of rp1AgentFiles) {
					const targetPath = join(paths.agentsDir, fileName);
					const fileStat = await stat(targetPath);
					if (fileStat.isDirectory()) {
						await rm(targetPath, { recursive: true });
					} else {
						await rm(targetPath);
					}
				}
				agentsRemoved = true;
			}

			return { skillsRemoved, agentsRemoved };
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

/**
 * Preview what the installer would do without writing any files.
 */
export const previewCopilotInstallation = (
	artifactsDir: string,
	paths: CopilotPaths,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			console.log("[dry-run] Installation preview:\n");
			console.log("Skills to install:");

			for (const plugin of [...REQUIRED_PLUGINS, ...OPTIONAL_PLUGINS]) {
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

			console.log("\nAgent files to install:");
			for (const plugin of [...REQUIRED_PLUGINS, ...OPTIONAL_PLUGINS]) {
				const agentsSrc = join(artifactsDir, plugin, "agents");
				try {
					const entries = await readdir(agentsSrc, { withFileTypes: true });
					for (const entry of entries) {
						if (!entry.isDirectory() && entry.name.endsWith(".md")) {
							console.log(
								`  - ${entry.name} -> ${join(paths.agentsDir, entry.name)}`,
							);
						}
					}
				} catch {
					// agents dir may not exist for this plugin
				}
			}

			console.log("\nRun without --dry-run to execute installation.");
		},
		(e) => installError("preview", `Failed to preview installation: ${e}`),
	);

/**
 * Get the default Copilot artifacts directory.
 * Checks for dist/copilot/ relative to the module location.
 * Returns null if not found.
 */
export const getDefaultCopilotArtifactsDir = (): string | null => {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(moduleDir, "..", "..", "..", "dist", "copilot"), // From src/install/copilot/ -> dist/copilot
		join(moduleDir, "..", "..", "dist", "copilot"),
		join(moduleDir, "..", "dist", "copilot"),
		join(moduleDir, "..", "cli", "dist", "copilot"), // From bin/ -> cli/dist/copilot (compiled binary)
		join(process.cwd(), "cli", "dist", "copilot"), // CWD-relative for dev usage
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
};
