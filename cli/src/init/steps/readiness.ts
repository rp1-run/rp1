/**
 * Readiness check step for the rp1 init command.
 * Performs parallel checks to determine rp1 setup readiness.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	type ResolvedDirectorySet,
	resolveDirectorySet,
} from "../../../shared/directory-resolution.js";
import type { StepCallbacks } from "../models.js";

/**
 * Result of rp1 readiness checks.
 * Tracks whether directories, KB, and charter exist.
 */
export interface ReadinessResult {
	readonly directoriesExist: boolean;
	readonly kbExists: boolean;
	readonly charterExists: boolean;
}

/**
 * Check if a path exists (file or directory).
 * Handles permission errors gracefully by returning false.
 *
 * @param filePath - Absolute path to check
 * @returns true if path exists, false otherwise (including permission errors)
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a path exists and is a directory.
 * Handles permission errors gracefully by returning false.
 *
 * @param dirPath - Absolute path to check
 * @returns true if path exists and is a directory, false otherwise
 */
async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const dirStat = await stat(dirPath);
		return dirStat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check rp1 readiness by performing parallel file system checks.
 * Checks for the local rp1 directories, KB presence, and charter presence.
 * The work root is resolved from directory settings/env but may be created on
 * demand, so it is not required for readiness.
 *
 * @param cwd - Current working directory
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns ReadinessResult with boolean flags for each check
 */
export async function checkRp1Readiness(
	cwd: string,
	callbacks?: StepCallbacks,
): Promise<ReadinessResult> {
	const rp1Root = process.env.RP1_ROOT || ".rp1";

	callbacks?.onActivity("Checking existing rp1 configuration", "info");

	const rp1Dir = resolve(cwd, rp1Root);
	const contextDir = resolve(cwd, rp1Root, "context");
	const kbFile = resolve(cwd, rp1Root, "context", "index.md");
	const charterFile = resolve(cwd, rp1Root, "context", "charter.md");
	const workDir = E.match(
		() => resolve(rp1Dir, "work"),
		(directories: ResolvedDirectorySet) => resolve(directories.workRoot),
	)(resolveDirectorySet(cwd));

	const [
		rp1DirExists,
		contextDirExists,
		kbExists,
		charterExists,
		workDirExists,
	] = await Promise.all([
		isDirectory(rp1Dir),
		isDirectory(contextDir),
		pathExists(kbFile),
		pathExists(charterFile),
		isDirectory(workDir),
	]);

	const directoriesExist = rp1DirExists && contextDirExists;

	// Report findings
	if (directoriesExist) {
		callbacks?.onActivity("Found existing rp1 directory structure", "info");
	}
	if (workDirExists) {
		callbacks?.onActivity("Resolved work directory exists", "info");
	}
	if (kbExists) {
		callbacks?.onActivity("Knowledge base exists", "info");
	}
	if (charterExists) {
		callbacks?.onActivity("Charter exists", "info");
	}

	return {
		directoriesExist,
		kbExists,
		charterExists,
	};
}
