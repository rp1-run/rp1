import { homedir } from "node:os";
import { join } from "node:path";

export interface DownsamplingSettings {
	readonly thresholdHours: number;
}

export interface AcpSettings {
	readonly enabled: boolean;
}

export interface Settings {
	readonly version: number;
	readonly theme: "light" | "dark" | "system";
	readonly downsampling: DownsamplingSettings;
	readonly acp: AcpSettings;
}

export const CURRENT_SETTINGS_VERSION = 1;

export const defaultSettings: Settings = {
	version: CURRENT_SETTINGS_VERSION,
	theme: "system",
	downsampling: {
		thresholdHours: 24,
	},
	acp: {
		enabled: false,
	},
};

export function getGlobalSettingsPath(): string {
	return join(homedir(), ".config", "rp1", "settings.json");
}

export function getProjectSettingsPath(rp1Root: string): string {
	return join(rp1Root, "settings.json");
}

async function readSettingsFile(
	filePath: string,
): Promise<Partial<Settings> | null> {
	try {
		const file = Bun.file(filePath);
		const exists = await file.exists();
		if (!exists) {
			return null;
		}

		const content = await file.text();
		const parsed = JSON.parse(content) as Partial<Settings>;
		return parsed;
	} catch (error) {
		console.warn(`Failed to read settings from ${filePath}:`, error);
		return null;
	}
}

function mergeDownsampling(
	base: DownsamplingSettings,
	override?: Partial<DownsamplingSettings>,
): DownsamplingSettings {
	if (!override) return base;
	return {
		thresholdHours: override.thresholdHours ?? base.thresholdHours,
	};
}

function mergeAcp(
	base: AcpSettings,
	override?: Partial<AcpSettings>,
): AcpSettings {
	if (!override) return base;
	return {
		enabled: override.enabled ?? base.enabled,
	};
}

interface MergePartialSettingsOptions {
	readonly includeAcp?: boolean;
}

function mergePartialSettings(
	base: Settings,
	override: Partial<Settings>,
	options: MergePartialSettingsOptions = {},
): Settings {
	return {
		version: override.version ?? base.version,
		theme: override.theme ?? base.theme,
		downsampling: mergeDownsampling(base.downsampling, override.downsampling),
		acp:
			options.includeAcp === false
				? base.acp
				: mergeAcp(base.acp, override.acp),
	};
}

export function migrateSettings(settings: Partial<Settings>): Settings {
	const version = settings.version ?? 0;

	if (version > CURRENT_SETTINGS_VERSION) {
		console.warn(
			`Settings version ${version} is newer than supported version ${CURRENT_SETTINGS_VERSION}. ` +
				`Some settings may be ignored.`,
		);
	}

	const migrated = mergePartialSettings(defaultSettings, settings);
	return {
		...migrated,
		version: CURRENT_SETTINGS_VERSION,
	};
}

export function mergeSettings(
	globalSettings: Partial<Settings> | null,
	projectSettings: Partial<Settings> | null,
): Settings {
	let merged: Settings = defaultSettings;

	if (globalSettings) {
		merged = mergePartialSettings(defaultSettings, globalSettings);
	}

	if (projectSettings) {
		merged = mergePartialSettings(merged, projectSettings, {
			includeAcp: false,
		});
	}

	return migrateSettings(merged);
}

export async function loadGlobalSettings(): Promise<Partial<Settings> | null> {
	const path = getGlobalSettingsPath();
	return readSettingsFile(path);
}

export async function loadProjectSettings(
	rp1Root: string,
): Promise<Partial<Settings> | null> {
	const path = getProjectSettingsPath(rp1Root);
	return readSettingsFile(path);
}

export async function loadSettings(rp1Root?: string): Promise<Settings> {
	const globalSettings = await loadGlobalSettings();
	const projectSettings = rp1Root ? await loadProjectSettings(rp1Root) : null;

	return mergeSettings(globalSettings, projectSettings);
}

export function validateSettings(settings: unknown): settings is Settings {
	if (typeof settings !== "object" || settings === null) {
		return false;
	}

	const s = settings as Record<string, unknown>;

	if (typeof s.version !== "number") {
		return false;
	}

	if (
		s.theme !== undefined &&
		s.theme !== "light" &&
		s.theme !== "dark" &&
		s.theme !== "system"
	) {
		return false;
	}

	if (s.downsampling !== undefined) {
		if (typeof s.downsampling !== "object" || s.downsampling === null) {
			return false;
		}
		const d = s.downsampling as Record<string, unknown>;
		if (
			d.thresholdHours !== undefined &&
			typeof d.thresholdHours !== "number"
		) {
			return false;
		}
	}

	if (s.acp !== undefined) {
		if (typeof s.acp !== "object" || s.acp === null) {
			return false;
		}
		const acp = s.acp as Record<string, unknown>;
		if (acp.enabled !== undefined && typeof acp.enabled !== "boolean") {
			return false;
		}
	}

	return true;
}
