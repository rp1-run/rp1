/**
 * Filesystem helpers for test setup and teardown.
 * Provides temp directory management for integration tests.
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get the root of the main rp1 development repository.
 * Uses import.meta.url to find the CLI source location.
 */
function getMainRepoRoot(): string {
	const currentFile = fileURLToPath(import.meta.url);
	// Navigate from cli/src/__tests__/helpers/ up to repo root
	return join(dirname(currentFile), "..", "..", "..", "..");
}

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

/**
 * Assert that a test directory is properly isolated from the main rp1 repo.
 * Throws if the path is inside the main development repository.
 *
 * Use in beforeAll to catch test isolation failures early:
 * ```ts
 * beforeAll(async () => {
 *   tempDir = await createTempDir("my-test");
 *   await assertTestIsolation(tempDir);
 * });
 * ```
 *
 * @param testPath - Path to validate
 * @throws Error if path is inside the main rp1 repository
 */
export async function assertTestIsolation(testPath: string): Promise<void> {
	const resolvedPath = await realpath(testPath);
	const mainRepoRoot = await realpath(getMainRepoRoot());

	// Check if test path is inside the main repo
	if (resolvedPath.startsWith(mainRepoRoot)) {
		throw new Error(
			`TEST ISOLATION FAILURE: Test directory "${resolvedPath}" is inside the main rp1 repo "${mainRepoRoot}". ` +
				"Tests must use isolated temp directories to prevent contamination of the development environment.",
		);
	}
}
