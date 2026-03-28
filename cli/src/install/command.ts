/**
 * CLI entry point for install commands.
 * Implements install:opencode, verify, and list commands.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { usageError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { confirmAction } from "../../shared/prompts.js";
import { createSpinner } from "../../shared/spinner.js";
import {
	extractPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../assets/index.js";
import { colorFns } from "../lib/colors.js";
import { getDefaultArtifactsDir, installRp1 } from "./installer.js";
import { discoverPlugins } from "./manifest.js";
import { isHealthy } from "./models.js";
import {
	checkOpenCodeInstalled,
	checkOpenCodeVersion,
	checkWritePermissions,
	getOpenCodeConfigDir,
} from "./prerequisites.js";
import { listInstalledSkills, verifyInstallation } from "./verifier.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

export interface InstallArgs {
	artifactsDir: string | null;
	dryRun: boolean;
	yes: boolean;
	strict: boolean;
}

export interface InstallOptions {
	isTTY: boolean;
	skipPrompt: boolean;
}

export const parseInstallArgs = (
	args: string[],
): InstallArgs & { showHelp: boolean } => {
	let artifactsDir: string | null = null;
	let dryRun = false;
	let showHelp = false;
	let yes = false;
	let strict = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			showHelp = true;
			continue;
		}

		if (arg === "--artifacts-dir" || arg === "-a") {
			if (i + 1 >= args.length) {
				console.error("Error: --artifacts-dir requires a path argument");
				showHelp = true;
				continue;
			}
			artifactsDir = args[++i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--yes" || arg === "-y") {
			yes = true;
		} else if (arg === "--strict") {
			strict = true;
		} else if (!arg.startsWith("-")) {
			if (artifactsDir === null) {
				artifactsDir = arg;
			}
		}
	}

	return { artifactsDir, dryRun, showHelp, yes, strict };
};

/**
 * Install plugins from bundled assets embedded in the release binary.
 */
const executeInstallFromBundled = (
	config: InstallArgs,
	_logger: Logger,
	options?: InstallOptions,
): TE.TaskEither<CLIError, void> => {
	const isTTY = options?.isTTY ?? process.stdout.isTTY ?? false;
	const spinner = createSpinner(isTTY);

	return pipe(
		TE.fromEither(getBundledAssets()),
		TE.chain((assets) => {
			const platform = assets.platforms.opencode;
			if (!platform) {
				return TE.left(
					usageError(
						"No OpenCode platform found in embedded manifest",
						"Ensure the binary was built with OpenCode assets.",
					),
				);
			}
			spinner.start("Checking prerequisites...");
			return pipe(
				checkOpenCodeInstalled(),
				TE.chain((result) => {
					const versionResult = checkOpenCodeVersion(result.value ?? "");
					if (E.isLeft(versionResult)) {
						spinner.fail("Version check failed");
						return TE.left(versionResult.left);
					}
					return TE.right(undefined);
				}),
				TE.chain(() => {
					const targetDir = getOpenCodeConfigDir();
					return pipe(
						checkWritePermissions(targetDir),
						TE.map(() => ({ targetDir })),
					);
				}),
				TE.chainFirst(() => {
					spinner.succeed("Prerequisites OK");
					return TE.right(undefined);
				}),
				TE.chain(({ targetDir }) => {
					if (config.dryRun) {
						spinner.stop();
						console.log(yellow("\nDRY RUN MODE - No files will be modified\n"));
						console.log("Would install from bundled assets:");
						const pluginsToPreview = [
							platform.plugins.base,
							platform.plugins.dev,
							...(platform.plugins.utils ? [platform.plugins.utils] : []),
						];
						for (const p of pluginsToPreview) {
							console.log(
								`  • ${p.name}: ${p.agents.length} agents, ${p.skills.length} skills`,
							);
						}
						return TE.right(undefined);
					}

					spinner.start("Installing plugins...");
					return pipe(
						extractPlugins(assets, targetDir, (msg) => {
							spinner.text = msg;
						}),
						TE.chain((result) => {
							spinner.succeed(
								`Installed ${result.filesExtracted} files from ${result.plugins.length} plugins`,
							);

							spinner.succeed("Hooks installed via plugins directory");
							return TE.right({ targetDir });
						}),
						TE.chain(() => {
							spinner.start("Verifying installation...");
							const allPlugins = [
								platform.plugins.base,
								platform.plugins.dev,
								...(platform.plugins.utils ? [platform.plugins.utils] : []),
							];
							// Count unique skill directories (entries are file-level, e.g. "rp1-build/SKILL.md")
							const uniqueSkillDirs = new Set(
								allPlugins.flatMap((p) =>
									p.skills.map((s) => s.name.split("/")[0]),
								),
							);
							const bundledCounts = {
								agents: allPlugins.reduce((sum, p) => sum + p.agents.length, 0),
								skills: uniqueSkillDirs.size,
							};
							return pipe(
								verifyInstallation(undefined, bundledCounts),
								TE.map((report) => {
									if (isHealthy(report)) {
										spinner.succeed(
											`Verified: ${report.skillsFound} skills, ${report.agentsFound} agents`,
										);
									} else {
										spinner.stop();
										console.log(
											yellow("\n⚠ Installation complete with warnings"),
										);
										for (const issue of report.issues) {
											console.log(yellow(`  • ${issue}`));
										}
									}
								}),
							);
						}),
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

export const executeInstall = (
	args: string[],
	logger: Logger,
	options?: InstallOptions,
): TE.TaskEither<CLIError, void> => {
	const config = parseInstallArgs(args);
	const isTTY = options?.isTTY ?? process.stdout.isTTY ?? false;
	const skipPrompt = options?.skipPrompt ?? config.yes;
	const spinner = createSpinner(isTTY);

	if (config.showHelp) {
		return TE.right(undefined);
	}

	if (config.artifactsDir === null && hasBundledAssets()) {
		return executeInstallFromBundled(config, logger, options);
	}

	const artifactsDir = config.artifactsDir ?? getDefaultArtifactsDir();

	if (artifactsDir === null) {
		return TE.left(
			usageError(
				"No artifacts found",
				"This appears to be a development build without bundled assets.\n\n" +
					"Options:\n" +
					"  1. Install a release binary from: https://github.com/rp1-run/rp1/releases\n" +
					"  2. Build artifacts first: rp1 build:opencode\n" +
					"  3. Specify path: rp1 install:opencode --artifacts-dir <path>",
			),
		);
	}

	if (artifactsDir === null) {
		return TE.left(
			usageError(
				"No artifacts found",
				"This appears to be a development build without bundled assets.\n\n" +
					"Options:\n" +
					"  1. Install a release binary from: https://github.com/rp1-run/rp1/releases\n" +
					"  2. Build artifacts first: rp1 build:opencode\n" +
					"  3. Specify path: rp1 install:opencode --artifacts-dir <path>",
			),
		);
	}

	console.log(bold("\n🚀 rp1-opencode Installation\n"));
	console.log(dim(`Using artifacts: ${artifactsDir}\n`));

	return pipe(
		TE.tryCatch(
			async () => {
				await stat(artifactsDir);
				return artifactsDir;
			},
			() =>
				usageError(
					`Artifacts directory not found: ${artifactsDir}`,
					"Build artifacts first with: rp1 build:opencode",
				),
		),
		TE.chain(() => {
			spinner.start("Checking prerequisites...");
			return checkOpenCodeInstalled();
		}),
		TE.chain((result) => {
			const versionResult = checkOpenCodeVersion(result.value ?? "");
			if (E.isLeft(versionResult)) {
				spinner.fail("Version check failed");
				return TE.left(versionResult.left);
			}
			return TE.right(undefined);
		}),
		TE.chain(() => {
			const targetDir = getOpenCodeConfigDir();
			return pipe(
				checkWritePermissions(targetDir),
				TE.map(() => undefined),
			);
		}),
		TE.chainFirst(() => {
			spinner.succeed("Prerequisites OK");
			return TE.right(undefined);
		}),
		TE.chain(() => {
			if (config.dryRun) {
				spinner.stop();
				console.log(yellow("\nDRY RUN MODE - No files will be modified\n"));
				console.log(`Would install from: ${artifactsDir}`);
				console.log("  • Base plugin: agents, skills");
				console.log("  • Dev plugin: agents, skills");
				console.log("  • Hooks: rp1-base-hooks (OpenCode session hooks)");
				return TE.right(undefined);
			}

			spinner.start("Installing plugins...");
			return pipe(
				discoverPlugins(artifactsDir),
				TE.chain((plugins) => {
					const pluginDirs = plugins.map((p) =>
						join(artifactsDir, p.plugin.replace("rp1-", "")),
					);

					return pipe(
						installRp1(
							pluginDirs,
							(msg) => {
								spinner.text = msg;
							},
							async (path) => {
								if (!skipPrompt) {
									spinner.stop();
									const proceed = await confirmAction(
										`Overwrite existing file: ${path}?`,
										{ isTTY, defaultOnNonTTY: false },
									);
									if (!proceed) {
										console.log(yellow(`  Skipped: ${path}`));
										spinner.start("Installing plugins...");
										return;
									}
									spinner.start("Installing plugins...");
								}
								console.log(yellow(`  ⚠ Overwriting: ${path}`));
							},
							undefined, // logger
							config.strict,
						),
						TE.chain((result) => {
							spinner.succeed(
								`Installed ${result.filesInstalled} files from ${result.pluginsInstalled.length} plugins`,
							);

							for (const warning of result.warnings) {
								console.log(yellow(`⚠ ${warning}`));
							}

							spinner.succeed("Hooks installed via plugins directory");
							return TE.right({ artifactsDir });
						}),
						TE.chain(({ artifactsDir: verifyDir }) => {
							spinner.start("Verifying installation...");
							return pipe(
								verifyInstallation(verifyDir),
								TE.map((report) => {
									if (isHealthy(report)) {
										spinner.succeed(
											`Verified: ${report.skillsFound} skills, ${report.agentsFound} agents`,
										);
									} else {
										spinner.stop();
										console.log(
											yellow("\n⚠ Installation complete with warnings"),
										);
										for (const issue of report.issues) {
											console.log(yellow(`  • ${issue}`));
										}
									}
								}),
							);
						}),
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

export const executeVerify = (
	args: string[],
	_logger: Logger,
): TE.TaskEither<CLIError, void> => {
	let artifactsDir: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--artifacts-dir" && i + 1 < args.length) {
			artifactsDir = args[i + 1];
		}
	}

	console.log(bold("\nVerifying OpenCode Plugins\n"));

	return pipe(
		verifyInstallation(artifactsDir),
		TE.map((report) => {
			console.log("+-----------+--------------+--------+");
			console.log("| Component | Found/Expect | Status |");
			console.log("+-----------+--------------+--------+");

			const skillOk = report.skillsFound >= report.skillsExpected;
			const skillCount =
				`${report.skillsFound}/${report.skillsExpected}`.padEnd(12);
			console.log(
				`| Skills    | ${skillCount} | ${skillOk ? green("  OK  ") : red(" MISS ")} |`,
			);

			const agentOk = report.agentsFound >= report.agentsExpected;
			const agentCount =
				`${report.agentsFound}/${report.agentsExpected}`.padEnd(12);
			console.log(
				`| Agents    | ${agentCount} | ${agentOk ? green("  OK  ") : red(" MISS ")} |`,
			);

			const pluginOk = report.pluginsFound >= report.pluginsExpected;
			const pluginCount =
				`${report.pluginsFound}/${report.pluginsExpected}`.padEnd(12);
			console.log(
				`| Hooks     | ${pluginCount} | ${pluginOk ? green("  OK  ") : yellow(" WARN ")} |`,
			);

			console.log("+-----------+--------------+--------+");

			if (report.issues.length > 0) {
				console.log(yellow("\nIssues Found:"));
				for (const issue of report.issues) {
					console.log(yellow(`  - ${issue}`));
				}
			}

			if (isHealthy(report)) {
				console.log(green("All components installed"));
			} else {
				console.log(red(bold("\nInstallation incomplete")));
				console.log(dim("\nRemediation:"));
				console.log(dim("  Install missing components with:"));
				console.log(cyan("    rp1 install opencode"));
				process.exit(1);
			}
		}),
	);
};

export const executeList = (
	_args: string[],
	_logger: Logger,
): TE.TaskEither<CLIError, void> => {
	console.log(bold("\n📋 Installed rp1 Skills\n"));

	return pipe(
		listInstalledSkills(),
		TE.map((skills) => {
			if (skills.length === 0) {
				console.log(yellow("No rp1 skills found"));
				return;
			}

			console.log(
				"┌─────────────────────────────────────────┬────────────────────────────────────────────────────────────┐",
			);
			console.log(
				"│ Skill                                   │ Description                                                │",
			);
			console.log(
				"├─────────────────────────────────────────┼────────────────────────────────────────────────────────────┤",
			);

			for (const skill of skills) {
				const name = skill.name.padEnd(39);
				const desc = skill.description.slice(0, 58).padEnd(58);
				console.log(`│ ${name} │ ${desc} │`);
			}

			console.log(
				"└─────────────────────────────────────────┴────────────────────────────────────────────────────────────┘",
			);
			console.log(dim(`\nTotal: ${skills.length} skills`));
		}),
	);
};
