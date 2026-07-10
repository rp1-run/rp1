/**
 * Tests for central-mode init directory restructure (T2).
 *
 * Verifies: minimal project structure creation, storage directory creation
 * for both central and local modes, storage path resolution, and the
 * reordered init flow that establishes project_id before computing
 * central directory paths.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../../shared/logger.js";
import {
	resolveStorageDirectoryPaths,
	type StorageDirectoryPaths,
} from "../../../init/directory-model.js";
import {
	createMinimalProjectStructure,
	createStorageDirectories,
} from "../../../init/steps/project-setup.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

function createTrackingLogger(): Logger & {
	calls: { method: string; args: unknown[] }[];
} {
	const calls: { method: string; args: unknown[] }[] = [];
	return {
		calls,
		trace: (...args) => calls.push({ method: "trace", args }),
		debug: (...args) => calls.push({ method: "debug", args }),
		info: (...args) => calls.push({ method: "info", args }),
		warn: (...args) => calls.push({ method: "warn", args }),
		error: (...args) => calls.push({ method: "error", args }),
		start: (...args) => calls.push({ method: "start", args }),
		success: (...args) => calls.push({ method: "success", args }),
		fail: (...args) => calls.push({ method: "fail", args }),
		box: (...args) => calls.push({ method: "box", args }),
	};
}

describe("createMinimalProjectStructure", () => {
	let tempDir: string;
	let logger: ReturnType<typeof createTrackingLogger>;

	beforeEach(async () => {
		tempDir = await createTempDir("minimal-proj-setup-");
		logger = createTrackingLogger();
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("creates only .rp1/ directory without context/ or work/", async () => {
		const actions = await createMinimalProjectStructure(tempDir, logger);

		expect(actions).toHaveLength(1);
		expect(actions[0].type).toBe("created_directory");
		expect(
			actions[0].type === "created_directory" && actions[0].path,
		).toContain(".rp1");

		expect(existsSync(join(tempDir, ".rp1"))).toBe(true);
		expect(existsSync(join(tempDir, ".rp1", "context"))).toBe(false);
		expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(false);
	});

	test("is idempotent when .rp1/ already exists", async () => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });

		const actions = await createMinimalProjectStructure(tempDir, logger);

		expect(actions).toHaveLength(0);
		expect(existsSync(join(tempDir, ".rp1"))).toBe(true);
	});
});

describe("createStorageDirectories", () => {
	let tempDir: string;
	let fakeHome: string;
	let logger: ReturnType<typeof createTrackingLogger>;

	beforeEach(async () => {
		tempDir = await createTempDir("storage-dirs-");
		fakeHome = join(tempDir, "fake-home");
		await mkdir(fakeHome, { recursive: true });
		logger = createTrackingLogger();
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("creates central dirs under ~/.rp1/projects/{id}/ for central mode", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "test-uuid-1234";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(
			join(projectRoot, ".rp1", "settings.toml"),
			'[storage]\nmode = "central"\n',
		);
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const actions = await createStorageDirectories(
			projectRoot,
			projectId,
			logger,
			fakeHome,
		);

		expect(actions).toHaveLength(2);
		expect(actions.every((a) => a.type === "created_directory")).toBe(true);

		const centralBase = join(fakeHome, ".rp1", "projects", projectId);
		expect(existsSync(join(centralBase, "context"))).toBe(true);
		expect(existsSync(join(centralBase, "work"))).toBe(true);

		// Local context/work should NOT exist
		expect(existsSync(join(projectRoot, ".rp1", "context"))).toBe(false);
		expect(existsSync(join(projectRoot, ".rp1", "work"))).toBe(false);
	});

	test("creates local dirs .rp1/context/ and .rp1/work/ for local mode", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "test-uuid-5678";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(
			join(projectRoot, ".rp1", "settings.toml"),
			'[storage]\nmode = "local"\n',
		);
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const actions = await createStorageDirectories(
			projectRoot,
			projectId,
			logger,
			fakeHome,
		);

		expect(actions).toHaveLength(2);

		expect(existsSync(join(projectRoot, ".rp1", "context"))).toBe(true);
		expect(existsSync(join(projectRoot, ".rp1", "work"))).toBe(true);
	});

	test("falls back to local when no settings.toml exists", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "test-uuid-fallback";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const actions = await createStorageDirectories(
			projectRoot,
			projectId,
			logger,
			fakeHome,
		);

		expect(actions).toHaveLength(2);
		expect(existsSync(join(projectRoot, ".rp1", "context"))).toBe(true);
		expect(existsSync(join(projectRoot, ".rp1", "work"))).toBe(true);
	});

	test("is idempotent for central mode", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "test-uuid-idempotent";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(
			join(projectRoot, ".rp1", "settings.toml"),
			'[storage]\nmode = "central"\n',
		);
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const centralBase = join(fakeHome, ".rp1", "projects", projectId);
		await mkdir(join(centralBase, "context"), { recursive: true });
		await mkdir(join(centralBase, "work"), { recursive: true });

		const actions = await createStorageDirectories(
			projectRoot,
			projectId,
			logger,
			fakeHome,
		);

		expect(actions).toHaveLength(0);
	});
});

describe("resolveStorageDirectoryPaths", () => {
	let tempDir: string;
	let fakeHome: string;

	beforeEach(async () => {
		tempDir = await createTempDir("resolve-storage-");
		fakeHome = join(tempDir, "fake-home");
		await mkdir(fakeHome, { recursive: true });
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("returns central paths when settings.toml has mode = central", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "central-test-id";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(
			join(projectRoot, ".rp1", "settings.toml"),
			'[storage]\nmode = "central"\n',
		);
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const result = resolveStorageDirectoryPaths(
			projectRoot,
			projectId,
			fakeHome,
		);

		const expectedBase = join(fakeHome, ".rp1", "projects", projectId);
		expect(result.contextDir).toBe(join(expectedBase, "context"));
		expect(result.workDir).toBe(join(expectedBase, "work"));
		expect(result.storageMode).toBe("central");
	});

	test("returns local paths when settings.toml has mode = local", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "local-test-id";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(
			join(projectRoot, ".rp1", "settings.toml"),
			'[storage]\nmode = "local"\n',
		);
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const result = resolveStorageDirectoryPaths(
			projectRoot,
			projectId,
			fakeHome,
		);

		expect(result.contextDir).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.workDir).toBe(join(projectRoot, ".rp1", "work"));
		expect(result.storageMode).toBe("local");
	});

	test("returns local paths when no settings.toml exists", async () => {
		const projectRoot = join(tempDir, "project");
		const projectId = "no-settings-id";
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);

		const result = resolveStorageDirectoryPaths(
			projectRoot,
			projectId,
			fakeHome,
		);

		expect(result.contextDir).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.workDir).toBe(join(projectRoot, ".rp1", "work"));
		expect(result.storageMode).toBe("local");
	});
});

describe("init directory restructure: two repos get distinct project IDs", () => {
	let tempDir: string;
	let fakeHome: string;
	let logger: ReturnType<typeof createTrackingLogger>;

	beforeEach(async () => {
		tempDir = await createTempDir("distinct-ids-");
		fakeHome = join(tempDir, "fake-home");
		await mkdir(fakeHome, { recursive: true });
		logger = createTrackingLogger();
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("two repos get distinct central directories", async () => {
		const repo1 = join(tempDir, "repo1");
		const repo2 = join(tempDir, "repo2");
		const id1 = "uuid-repo-1";
		const id2 = "uuid-repo-2";

		for (const [root, id] of [
			[repo1, id1],
			[repo2, id2],
		] as const) {
			await mkdir(join(root, ".rp1"), { recursive: true });
			await writeFile(
				join(root, ".rp1", "settings.toml"),
				'[storage]\nmode = "central"\n',
			);
			await writeFile(join(root, ".rp1", "project_id"), id);
		}

		await createStorageDirectories(repo1, id1, logger, fakeHome);
		await createStorageDirectories(repo2, id2, logger, fakeHome);

		const central1 = join(fakeHome, ".rp1", "projects", id1);
		const central2 = join(fakeHome, ".rp1", "projects", id2);

		expect(existsSync(join(central1, "context"))).toBe(true);
		expect(existsSync(join(central1, "work"))).toBe(true);
		expect(existsSync(join(central2, "context"))).toBe(true);
		expect(existsSync(join(central2, "work"))).toBe(true);
		expect(central1).not.toBe(central2);
	});
});
