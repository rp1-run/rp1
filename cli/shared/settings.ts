import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { type CLIError, validationError } from "./errors.js";

export interface DirectorySettings {
	readonly projectRoot?: string;
	readonly kbDir?: string;
	readonly workDir?: string;
}

export interface LoadedDirectorySettings extends DirectorySettings {
	readonly sources: {
		readonly projectRoot?: "project_settings" | "user_settings";
		readonly kbDir?: "project_settings" | "user_settings";
		readonly workDir?: "project_settings" | "user_settings";
	};
}

type ParsedDirectorySettingsFile = Readonly<{
	directories: DirectorySettings;
}>;

type LoadDirectorySettingsOptions = Readonly<{
	readonly globalSettingsPath?: string;
	readonly localSettingsPath?: string;
	readonly userHomeDir?: string;
}>;

type ParsedSettingsDirectories = ParsedDirectorySettingsFile["directories"];

const isPlainRecord = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeDirectoryValue = (
	filePath: string,
	fieldName: "project_root" | "kb_dir" | "work_dir",
	value: unknown,
	baseDir: string,
): E.Either<CLIError, string | undefined> => {
	if (value === undefined) {
		return E.right(undefined);
	}

	if (typeof value !== "string") {
		return E.left(
			validationError(
				filePath,
				"L1",
				`[directories].${fieldName} must be a string path.`,
			),
		);
	}

	if (value.trim().length === 0) {
		return E.left(
			validationError(
				filePath,
				"L1",
				`[directories].${fieldName} must not be empty.`,
			),
		);
	}

	return E.right(path.resolve(baseDir, value));
};

const parseDirectorySettingsFile = (
	filePath: string,
	options: {
		readonly projectRootBaseDir: string;
		readonly directoryBaseDir?: string;
	},
): E.Either<CLIError, ParsedDirectorySettingsFile> => {
	if (!existsSync(filePath)) {
		return E.right({ directories: {} });
	}

	try {
		const text = readFileSync(filePath, "utf-8");
		const parsed = Bun.TOML.parse(text) as Record<string, unknown>;
		const directoriesSection = parsed.directories;

		if (
			directoriesSection !== undefined &&
			!isPlainRecord(directoriesSection)
		) {
			return E.left(
				validationError(filePath, "L1", "[directories] must be a TOML table."),
			);
		}

		const rawDirectories = isPlainRecord(directoriesSection)
			? directoriesSection
			: {};
		const projectRootResult = normalizeDirectoryValue(
			filePath,
			"project_root",
			rawDirectories.project_root,
			options.projectRootBaseDir,
		);
		if (E.isLeft(projectRootResult)) {
			return projectRootResult;
		}

		const directoryBaseDir =
			options.directoryBaseDir ??
			projectRootResult.right ??
			options.projectRootBaseDir;
		const kbDirResult = normalizeDirectoryValue(
			filePath,
			"kb_dir",
			rawDirectories.kb_dir,
			directoryBaseDir,
		);
		if (E.isLeft(kbDirResult)) {
			return kbDirResult;
		}

		const workDirResult = normalizeDirectoryValue(
			filePath,
			"work_dir",
			rawDirectories.work_dir,
			directoryBaseDir,
		);
		if (E.isLeft(workDirResult)) {
			return workDirResult;
		}

		return E.right({
			directories: {
				projectRoot: projectRootResult.right,
				kbDir: kbDirResult.right,
				workDir: workDirResult.right,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return E.left(validationError(filePath, "L1", message));
	}
};

export const resolveGlobalSettingsPath = (): string =>
	join(homedir(), ".config", "rp1", "settings.toml");

export const resolveLocalSettingsPath = (cwd: string = process.cwd()): string =>
	join(cwd, ".rp1", "settings.toml");

export const loadDirectorySettings = (
	projectRootPath: string,
	options: LoadDirectorySettingsOptions = {},
): E.Either<CLIError, LoadedDirectorySettings> => {
	const resolvedProjectRoot = path.resolve(projectRootPath);
	const globalSettingsPath =
		options.globalSettingsPath ?? resolveGlobalSettingsPath();
	const localSettingsPath =
		options.localSettingsPath ?? resolveLocalSettingsPath(resolvedProjectRoot);
	const userHomeDir = options.userHomeDir ?? homedir();

	const userSettingsResult = parseDirectorySettingsFile(globalSettingsPath, {
		projectRootBaseDir: userHomeDir,
		directoryBaseDir: userHomeDir,
	});
	if (E.isLeft(userSettingsResult)) {
		return userSettingsResult;
	}

	const userSettings = userSettingsResult.right.directories;
	const loadProjectSettings = (
		root: string,
		settingsPath?: string,
	): E.Either<CLIError, ParsedSettingsDirectories> =>
		E.map(
			(parsedSettings: ParsedDirectorySettingsFile) =>
				parsedSettings.directories,
		)(
			parseDirectorySettingsFile(
				settingsPath ?? resolveLocalSettingsPath(root),
				{
					projectRootBaseDir: root,
				},
			),
		);

	const initialProjectSettingsResult = loadProjectSettings(
		resolvedProjectRoot,
		localSettingsPath,
	);
	if (E.isLeft(initialProjectSettingsResult)) {
		return initialProjectSettingsResult;
	}

	const initialProjectSettings = initialProjectSettingsResult.right;
	const candidateProjectRoot =
		initialProjectSettings.projectRoot ?? userSettings.projectRoot;
	const effectiveProjectRoot = path.resolve(
		candidateProjectRoot ?? resolvedProjectRoot,
	);
	const baseProjectSettings =
		effectiveProjectRoot === resolvedProjectRoot ||
		initialProjectSettings.projectRoot !== undefined
			? initialProjectSettings
			: ({} satisfies ParsedSettingsDirectories);
	const effectiveProjectSettingsResult =
		effectiveProjectRoot === resolvedProjectRoot
			? E.right(baseProjectSettings)
			: loadProjectSettings(effectiveProjectRoot);
	if (E.isLeft(effectiveProjectSettingsResult)) {
		return effectiveProjectSettingsResult;
	}

	const effectiveProjectSettings = effectiveProjectSettingsResult.right;
	const projectSettings: ParsedSettingsDirectories = {
		projectRoot:
			effectiveProjectSettings.projectRoot ?? baseProjectSettings.projectRoot,
		kbDir: effectiveProjectSettings.kbDir ?? baseProjectSettings.kbDir,
		workDir: effectiveProjectSettings.workDir ?? baseProjectSettings.workDir,
	};
	const resolvedSettingsProjectRoot =
		projectSettings.projectRoot ?? candidateProjectRoot ?? resolvedProjectRoot;

	return E.right({
		projectRoot: resolvedSettingsProjectRoot,
		kbDir: projectSettings.kbDir ?? userSettings.kbDir,
		workDir: projectSettings.workDir ?? userSettings.workDir,
		sources: {
			projectRoot:
				projectSettings.projectRoot !== undefined
					? "project_settings"
					: candidateProjectRoot !== undefined
						? "user_settings"
						: undefined,
			kbDir:
				projectSettings.kbDir !== undefined
					? "project_settings"
					: userSettings.kbDir !== undefined
						? "user_settings"
						: undefined,
			workDir:
				projectSettings.workDir !== undefined
					? "project_settings"
					: userSettings.workDir !== undefined
						? "user_settings"
						: undefined,
		},
	});
};
