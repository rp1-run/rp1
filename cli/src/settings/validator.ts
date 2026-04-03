/**
 * Settings file validation.
 * Validates TOML syntax in global and local rp1 settings files.
 */

export {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../shared/settings.js";

import {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../shared/settings.js";

/**
 * Load a single settings file for validation purposes.
 * Returns parsed content status and any TOML parse error details.
 *
 * @param filePath - Absolute path to settings file
 * @returns Object with exists, valid, parsed content, and any error
 */
const loadSettingsFileForValidation = async (
	filePath: string,
): Promise<{
	exists: boolean;
	valid: boolean;
	error?: string;
	line?: number;
}> => {
	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return { exists: false, valid: true };
	}

	const text = await file.text();

	try {
		Bun.TOML.parse(text);
		return { exists: true, valid: true };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const lineMatch = message.match(/line (\d+)/i);
		const line = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;
		return { exists: true, valid: false, error: message, line };
	}
};

/**
 * Validate settings files and return validation result.
 *
 * Checks both global and local settings files for TOML validity.
 *
 * @param cwd - Current working directory for local settings resolution
 * @returns Promise with validation results for both files
 */
export const validateSettings = async (
	cwd: string = process.cwd(),
): Promise<{
	valid: boolean;
	globalFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
	localFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
}> => {
	const globalPath = resolveGlobalSettingsPath();
	const localPath = resolveLocalSettingsPath(cwd);

	const [globalResult, localResult] = await Promise.all([
		loadSettingsFileForValidation(globalPath),
		loadSettingsFileForValidation(localPath),
	]);

	const globalFile = {
		path: globalPath,
		exists: globalResult.exists,
		valid: globalResult.valid,
		error: globalResult.error,
		line: globalResult.line,
	};

	const localFile = {
		path: localPath,
		exists: localResult.exists,
		valid: localResult.valid,
		error: localResult.error,
		line: localResult.line,
	};

	const valid = globalFile.valid && localFile.valid;

	return { valid, globalFile, localFile };
};
