import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import { ensureProjectId } from "../../shared/project-id.js";
import { resolveLocalSettingsPath } from "../../shared/settings.js";
import { readStorageMode } from "../../shared/storage-mode.js";
import { loadToolsRegistry } from "../config/supported-tools.js";
import {
	type GlobalStanzaResult,
	manageGlobalStanzas,
} from "../init/global-stanza-writer.js";
import { detectTools } from "../init/tool-detector.js";
import { loadEnabledHarnesses } from "../settings/loader.js";
import { getEffectiveHarnesses } from "../shared/install-core.js";
import {
	type ArcadeSettingsMigrationResult,
	migrateArcadeSettings,
} from "./arcade-settings.js";
import {
	type UpdateGitignoreResult as CentralGitignoreResult,
	type GitUnstageResult,
	gitUnstageTracked,
	type RelocateResult,
	type RemoveStanzasResult,
	relocateToCenter,
	removeProjectStanzas,
	updateGitignoreCentral,
	writeStorageSection,
} from "./central-store.js";
import { backfillProjectId, type DbBackfillResult } from "./db-backfill.js";
import {
	type GitignoreUpdateResult,
	updateGitignore,
} from "./gitignore-update.js";
import {
	findLegacyWorkDir,
	type LegacyWorkResult,
	moveLegacyWork,
} from "./legacy-work.js";
import { type StanzaUpgradeResult, upgradeStanzas } from "./stanza-upgrade.js";

export interface CentralStoreResult {
	readonly relocated: RelocateResult;
	readonly settingsWritten: boolean;
	readonly stanzasRemoved: RemoveStanzasResult;
	readonly globalStanza: GlobalStanzaResult;
	readonly gitignoreUpdated: CentralGitignoreResult;
	readonly gitUnstaged: GitUnstageResult;
}

export interface MigrateOptions {
	readonly dryRun?: boolean;
	readonly toCentral?: boolean;
	readonly homeDir?: string;
	readonly globalSettingsPath?: string;
}

export interface MigrateResult {
	readonly dryRun?: boolean;
	readonly projectRoot: string;
	readonly projectId: string;
	readonly projectIdCreated: boolean;
	readonly workDirCreated: boolean;
	readonly legacyWork: LegacyWorkResult | undefined;
	readonly gitignore: GitignoreUpdateResult;
	readonly dbBackfill: DbBackfillResult;
	readonly stanzaUpgrade: StanzaUpgradeResult;
	readonly arcadeSettings: ArcadeSettingsMigrationResult;
	readonly centralStore?: CentralStoreResult;
}

const resolveHarnesses = async (
	globalSettingsPath?: string,
): Promise<readonly string[]> => {
	const persisted = loadEnabledHarnesses(globalSettingsPath);
	if (persisted !== undefined) {
		return persisted;
	}
	const registry = await loadToolsRegistry();
	const detection = await detectTools(registry)();
	if (E.isLeft(detection) || detection.right.detected.length === 0) {
		return [];
	}
	return getEffectiveHarnesses(detection.right).map((d) => d.tool.id);
};

const executeCentralSteps = async (
	projectRoot: string,
	projectId: string,
	dryRun: boolean,
	homeDir?: string,
	globalSettingsPath?: string,
): Promise<CentralStoreResult | undefined> => {
	const currentMode = readStorageMode(projectRoot);
	if (currentMode === "central") {
		return {
			relocated: { contextFiles: 0, workFiles: 0, skipped: 0 },
			settingsWritten: false,
			stanzasRemoved: { filesModified: [], filesSkipped: [] },
			globalStanza: {
				written: [],
				updated: [],
				removed: [],
				skipped: [],
				errors: [],
				paths: new Map(),
			},
			gitignoreUpdated: { updated: false },
			gitUnstaged: { unstaged: [] },
		};
	}

	const settingsPath = resolveLocalSettingsPath(projectRoot);

	const relocated = relocateToCenter(projectRoot, projectId, {
		dryRun,
		homeDir,
	});

	const settingsWritten = writeStorageSection(settingsPath, "central", {
		dryRun,
	});

	const stanzasRemoved = removeProjectStanzas(projectRoot, { dryRun });

	const harnesses = await resolveHarnesses(globalSettingsPath);
	const globalStanza = await manageGlobalStanzas(harnesses, {
		dryRun,
		homeDir,
	});

	const gitignoreUpdated = updateGitignoreCentral(projectRoot, { dryRun });

	const gitUnstaged = gitUnstageTracked(
		projectRoot,
		[".rp1/context", ".rp1/work"],
		{ dryRun },
	);

	return {
		relocated,
		settingsWritten,
		stanzasRemoved,
		globalStanza,
		gitignoreUpdated,
		gitUnstaged,
	};
};

export const executeMigrate = async (
	cwd: string = process.cwd(),
	options: MigrateOptions = {},
): Promise<MigrateResult> => {
	const directories = resolveDirectorySet(cwd);
	if (E.isLeft(directories)) {
		throw new Error(
			"No .rp1/ directory found. Run 'rp1 init' to initialize a project first.",
		);
	}
	const projectRoot = directories.right.projectRoot;

	const projectIdExistedBefore = existsSync(
		path.join(projectRoot, ".rp1", "project_id"),
	);
	if (options.dryRun === true) {
		const projectId = projectIdExistedBefore
			? readFileSync(
					path.join(projectRoot, ".rp1", "project_id"),
					"utf-8",
				).trim()
			: "(generated on apply)";
		const workDir = path.join(projectRoot, ".rp1", "work");
		const legacyPath = findLegacyWorkDir(projectRoot);
		const dbBackfill = await backfillProjectId(projectRoot, projectId, {
			dryRun: true,
		});
		const arcadeSettings = await migrateArcadeSettings({
			projectRoot,
			dryRun: true,
		});

		let centralStore: CentralStoreResult | undefined;
		if (options.toCentral === true) {
			centralStore = await executeCentralSteps(
				projectRoot,
				projectId,
				true,
				options.homeDir,
				options.globalSettingsPath,
			);
		}

		return {
			dryRun: true,
			projectRoot,
			projectId,
			projectIdCreated: !projectIdExistedBefore,
			workDirCreated: !existsSync(workDir),
			legacyWork: legacyPath
				? { legacyPath, filesMoved: 0, filesSkipped: 0 }
				: undefined,
			gitignore: { updated: false, rulesAdded: [] },
			dbBackfill,
			stanzaUpgrade: {
				filesUpgraded: [],
				filesAlreadyCurrent: [],
				filesScanned: 0,
				filesNotFound: [],
				errors: [],
			},
			arcadeSettings,
			centralStore,
		};
	}

	const projectId = await ensureProjectId(projectRoot);
	const projectIdCreated = !projectIdExistedBefore;

	const workDir = path.join(projectRoot, ".rp1", "work");
	const workDirExistedBefore = existsSync(workDir);
	if (!workDirExistedBefore) {
		mkdirSync(workDir, { recursive: true });
	}
	const workDirCreated = !workDirExistedBefore;

	let legacyWork: LegacyWorkResult | undefined;
	const legacyPath = findLegacyWorkDir(projectRoot);
	if (legacyPath) {
		legacyWork = moveLegacyWork(projectRoot, legacyPath);
	}

	const gitignore = updateGitignore(projectRoot);

	const dbBackfill = await backfillProjectId(projectRoot, projectId);

	const stanzaUpgrade = upgradeStanzas(projectRoot);

	const arcadeSettings = await migrateArcadeSettings({ projectRoot });

	let centralStore: CentralStoreResult | undefined;
	if (options.toCentral === true) {
		centralStore = await executeCentralSteps(
			projectRoot,
			projectId,
			false,
			options.homeDir,
			options.globalSettingsPath,
		);
	}

	return {
		projectRoot,
		projectId,
		projectIdCreated,
		workDirCreated,
		legacyWork,
		gitignore,
		dbBackfill,
		stanzaUpgrade,
		arcadeSettings,
		centralStore,
	};
};

export const formatMigrateSummary = (result: MigrateResult): string => {
	const lines: string[] = [];
	const activitySearchRowsCreated =
		result.dbBackfill.activitySearchRowsCreated ?? 0;
	const activitySearchRowsRefreshed =
		result.dbBackfill.activitySearchRowsRefreshed ?? 0;
	const totalActivitySearchRows =
		activitySearchRowsCreated + activitySearchRowsRefreshed;

	if (result.dryRun === true) {
		lines.push(`Migration dry-run for ${result.projectRoot}`);
		lines.push("");

		if (result.projectIdCreated) {
			lines.push("  Would create .rp1/project_id");
		} else {
			lines.push(`  Project ID: ${result.projectId} (already existed)`);
		}

		if (result.workDirCreated) {
			lines.push("  Would create .rp1/work/");
		} else {
			lines.push("  .rp1/work/ already exists");
		}

		if (result.legacyWork) {
			lines.push(
				`  Would inspect legacy work artifacts at ${result.legacyWork.legacyPath}`,
			);
		} else {
			lines.push("  No legacy work directory found");
		}

		if (totalActivitySearchRows > 0) {
			lines.push(
				`  Would rebuild Activity search rows: ${activitySearchRowsCreated} to create, ${activitySearchRowsRefreshed} to refresh`,
			);
		} else {
			lines.push("  Activity search rows already up to date");
		}

		if (
			result.arcadeSettings.globalMigrated ||
			result.arcadeSettings.projectMigrated
		) {
			const migrated: string[] = [];
			if (result.arcadeSettings.globalMigrated) migrated.push("global");
			if (result.arcadeSettings.projectMigrated) migrated.push("project");
			lines.push(
				`  Would migrate Arcade settings (${migrated.join(", ")}) from JSON to TOML`,
			);
		} else {
			lines.push("  No Arcade settings JSON to migrate");
		}

		if (result.centralStore) {
			lines.push("");
			lines.push("  Central storage conversion:");
			formatCentralStoreDryRun(lines, result.centralStore);
		}

		lines.push("  Would leave database history and files unchanged");
		lines.push("");
		lines.push("Run without --dry-run to apply these changes.");
		return lines.join("\n");
	}

	lines.push(`Migration complete for ${result.projectRoot}`);
	lines.push("");

	if (result.projectIdCreated) {
		lines.push(`  Created .rp1/project_id: ${result.projectId}`);
	} else {
		lines.push(`  Project ID: ${result.projectId} (already existed)`);
	}

	if (result.workDirCreated) {
		lines.push("  Created .rp1/work/");
	} else {
		lines.push("  .rp1/work/ already exists");
	}

	if (result.legacyWork) {
		if (result.legacyWork.filesMoved > 0) {
			lines.push(
				`  Moved ${result.legacyWork.filesMoved} file(s) from ${result.legacyWork.legacyPath}`,
			);
		}
		if (result.legacyWork.filesSkipped > 0) {
			lines.push(
				`  Skipped ${result.legacyWork.filesSkipped} file(s) (already exist or symlinks)`,
			);
		}
	} else {
		lines.push("  No legacy work directory found");
	}

	if (result.gitignore.updated) {
		lines.push(
			`  Updated .gitignore (added ${result.gitignore.rulesAdded.length} rule(s))`,
		);
	} else {
		lines.push("  .gitignore already up to date");
	}

	const totalDbUpdated =
		result.dbBackfill.runsUpdated +
		result.dbBackfill.artifactsUpdated +
		result.dbBackfill.tasksUpdated +
		result.dbBackfill.notificationsUpdated;
	if (totalDbUpdated > 0) {
		lines.push(
			`  Repaired Arcade metadata in ${result.dbBackfill.runsUpdated} run(s), ${result.dbBackfill.artifactsUpdated} artifact(s), ${result.dbBackfill.tasksUpdated} task(s), ${result.dbBackfill.notificationsUpdated} notification(s)`,
		);
		if (result.dbBackfill.artifactFilesMoved > 0) {
			lines.push(
				`  Moved ${result.dbBackfill.artifactFilesMoved} misplaced artifact file(s) into .rp1/`,
			);
		}
	} else {
		lines.push("  No database records to backfill");
	}

	if (totalActivitySearchRows > 0) {
		lines.push(
			`  Rebuilt Activity search rows: ${activitySearchRowsCreated} created, ${activitySearchRowsRefreshed} refreshed`,
		);
	} else {
		lines.push("  Activity search rows already up to date");
	}

	if (result.stanzaUpgrade.filesUpgraded.length > 0) {
		for (const upgrade of result.stanzaUpgrade.filesUpgraded) {
			lines.push(
				`  Updated ${upgrade.file} stanza (v${upgrade.fromVersion} -> v${upgrade.toVersion})`,
			);
		}
	} else if (result.stanzaUpgrade.filesAlreadyCurrent.length > 0) {
		lines.push("  Stanza content already up to date");
	} else {
		lines.push("  No stanza content to upgrade");
	}

	if (result.stanzaUpgrade.errors.length > 0) {
		for (const err of result.stanzaUpgrade.errors) {
			lines.push(`  Stanza upgrade error in ${err.file}: ${err.error}`);
		}
	}

	if (
		result.arcadeSettings.globalMigrated ||
		result.arcadeSettings.projectMigrated
	) {
		const migrated: string[] = [];
		if (result.arcadeSettings.globalMigrated) migrated.push("global");
		if (result.arcadeSettings.projectMigrated) migrated.push("project");
		lines.push(
			`  Migrated Arcade settings (${migrated.join(", ")}) from JSON to TOML`,
		);
	} else {
		lines.push("  No Arcade settings JSON to migrate");
	}

	if (result.centralStore) {
		lines.push("");
		lines.push("  Central storage conversion:");
		formatCentralStoreResult(lines, result.centralStore);
	}

	return lines.join("\n");
};

const formatCentralStoreDryRun = (
	lines: string[],
	cs: CentralStoreResult,
): void => {
	const totalFiles = cs.relocated.contextFiles + cs.relocated.workFiles;
	if (totalFiles > 0) {
		lines.push(
			`    Would relocate ${cs.relocated.contextFiles} context file(s) and ${cs.relocated.workFiles} work file(s) to central store`,
		);
	} else {
		lines.push("    No files to relocate (already empty or moved)");
	}

	if (cs.settingsWritten) {
		lines.push('    Would write [storage] mode = "central" to settings.toml');
	} else {
		lines.push("    Storage mode already set to central");
	}

	if (cs.stanzasRemoved.filesModified.length > 0) {
		lines.push(
			`    Would remove stanzas from: ${cs.stanzasRemoved.filesModified.join(", ")}`,
		);
	} else {
		lines.push("    No project stanzas to remove");
	}

	const stanzaActions =
		cs.globalStanza.written.length + cs.globalStanza.updated.length;
	if (stanzaActions > 0) {
		lines.push(
			`    Would manage global stanzas: ${cs.globalStanza.written.length} to write, ${cs.globalStanza.updated.length} to update`,
		);
	} else {
		lines.push("    No global stanza changes needed");
	}

	if (cs.gitignoreUpdated.updated) {
		lines.push("    Would update .gitignore to central preset");
	}

	if (cs.gitUnstaged.unstaged.length > 0) {
		lines.push(
			`    Would unstage ${cs.gitUnstaged.unstaged.length} tracked file(s) from git index`,
		);
	}
};

const formatCentralStoreResult = (
	lines: string[],
	cs: CentralStoreResult,
): void => {
	const totalFiles = cs.relocated.contextFiles + cs.relocated.workFiles;
	if (totalFiles > 0) {
		lines.push(
			`    Relocated ${cs.relocated.contextFiles} context file(s) and ${cs.relocated.workFiles} work file(s) to central store`,
		);
		if (cs.relocated.skipped > 0) {
			lines.push(
				`    Skipped ${cs.relocated.skipped} file(s) (already exist at destination)`,
			);
		}
	} else {
		lines.push("    No files to relocate");
	}

	if (cs.settingsWritten) {
		lines.push('    Wrote [storage] mode = "central" to settings.toml');
	} else {
		lines.push("    Storage mode already set to central");
	}

	if (cs.stanzasRemoved.filesModified.length > 0) {
		lines.push(
			`    Removed stanzas from: ${cs.stanzasRemoved.filesModified.join(", ")}`,
		);
	} else {
		lines.push("    No project stanzas to remove");
	}

	const written = cs.globalStanza.written.length;
	const updated = cs.globalStanza.updated.length;
	if (written > 0 || updated > 0) {
		const parts: string[] = [];
		if (written > 0) parts.push(`${written} written`);
		if (updated > 0) parts.push(`${updated} updated`);
		lines.push(`    Global stanzas: ${parts.join(", ")}`);
	} else {
		lines.push("    No global stanza changes needed");
	}

	if (cs.globalStanza.errors.length > 0) {
		for (const err of cs.globalStanza.errors) {
			lines.push(`    Global stanza error (${err.platform}): ${err.error}`);
		}
	}

	if (cs.gitignoreUpdated.updated) {
		lines.push("    Updated .gitignore to central preset");
	}

	if (cs.gitUnstaged.unstaged.length > 0) {
		lines.push(
			`    Unstaged ${cs.gitUnstaged.unstaged.length} file(s) from git index`,
		);
	}
};
