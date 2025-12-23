/**
 * Filesystem helpers for test setup and teardown.
 * Provides temp directory management for integration tests.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Create a temporary directory for test isolation.
 * @param prefix - Prefix for the temp directory name
 * @returns Promise resolving to the absolute path of the created directory
 */
export async function createTempDir(prefix: string): Promise<string> {
	const tempPath = await mkdtemp(join(tmpdir(), `rp1-test-${prefix}-`));
	return tempPath;
}

/**
 * Clean up a temporary directory and all its contents.
 * @param path - Absolute path to the directory to remove
 */
export async function cleanupTempDir(path: string): Promise<void> {
	await rm(path, { recursive: true, force: true });
}

/**
 * Write a fixture file to a temp directory.
 * Creates parent directories as needed.
 * @param dir - Base directory path
 * @param relativePath - Relative path within the directory
 * @param content - File content to write
 * @returns Promise resolving to the absolute path of the written file
 */
export async function writeFixture(
	dir: string,
	relativePath: string,
	content: string,
): Promise<string> {
	const fullPath = join(dir, relativePath);
	const parentDir = join(fullPath, "..");
	await mkdir(parentDir, { recursive: true });
	await writeFile(fullPath, content, "utf-8");
	return fullPath;
}
