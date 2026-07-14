import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "./settings.js";

export type StorageMode = "local" | "central";

export const VALID_STORAGE_MODES: readonly StorageMode[] = [
	"local",
	"central",
] as const;

export interface DirectoryPaths {
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly effectiveMode: StorageMode;
}

export const computeDirectoryPaths = (
	projectRoot: string,
	projectId: string | undefined,
	mode: StorageMode,
): DirectoryPaths => {
	if (mode === "central" && projectId !== undefined) {
		const centralBase = join(homedir(), ".rp1", "projects", projectId);
		return {
			kbRoot: join(centralBase, "context"),
			workRoot: join(centralBase, "work"),
			effectiveMode: "central",
		};
	}

	return {
		kbRoot: join(projectRoot, ".rp1", "context"),
		workRoot: join(projectRoot, ".rp1", "work"),
		effectiveMode: "local",
	};
};

let containerDetectionResult: boolean | undefined;

export const isContainerEnvironment = (): boolean => {
	if (containerDetectionResult !== undefined) {
		return containerDetectionResult;
	}

	const result =
		process.env.REMOTE_CONTAINERS !== undefined ||
		process.env.CODESPACES !== undefined ||
		(process.env.RP1_TEST_HOME_BOUNDARY !== "1" && existsSync("/.dockerenv"));

	containerDetectionResult = result;
	return result;
};

export const resetContainerDetectionCache = (): void => {
	containerDetectionResult = undefined;
};

const isPlainRecord = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const parseStorageModeFromFile = (
	filePath: string,
): StorageMode | undefined => {
	if (!existsSync(filePath)) return undefined;

	try {
		const text = readFileSync(filePath, "utf-8");
		const parsed = Bun.TOML.parse(text) as Record<string, unknown>;
		const storageSection = parsed.storage;

		if (!isPlainRecord(storageSection)) return undefined;

		const mode = storageSection.mode;
		if (
			typeof mode === "string" &&
			(VALID_STORAGE_MODES as readonly string[]).includes(mode)
		) {
			return mode as StorageMode;
		}

		return undefined;
	} catch {
		return undefined;
	}
};

export const readStorageMode = (
	projectRoot: string,
	globalSettingsPath?: string,
): StorageMode => {
	const projectMode = parseStorageModeFromFile(
		resolveLocalSettingsPath(projectRoot),
	);
	if (projectMode !== undefined) return projectMode;

	const userMode = parseStorageModeFromFile(
		globalSettingsPath ?? resolveGlobalSettingsPath(),
	);
	if (userMode !== undefined) return userMode;

	return "local";
};
