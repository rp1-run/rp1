import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	computeDirectoryPaths,
	isContainerEnvironment,
	readStorageMode,
	resetContainerDetectionCache,
	type StorageMode,
	VALID_STORAGE_MODES,
} from "../../../shared/storage-mode.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	resetContainerDetectionCache();
	tempDir = await createTempDir("storage-mode");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("StorageMode types", () => {
	test("VALID_STORAGE_MODES contains local and central", () => {
		expect(VALID_STORAGE_MODES).toContain("local");
		expect(VALID_STORAGE_MODES).toContain("central");
		expect(VALID_STORAGE_MODES).toHaveLength(2);
	});

	test("StorageMode type accepts valid values", () => {
		const local: StorageMode = "local";
		const central: StorageMode = "central";
		expect(local).toBe("local");
		expect(central).toBe("central");
	});
});

describe("readStorageMode", () => {
	test("returns local when no settings.toml exists", () => {
		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("returns local when settings.toml has no [storage] section", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"[arguments.build]\nAFK = false\n",
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("returns central when [storage] mode = central", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			'[storage]\nmode = "central"\n',
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("central");
	});

	test("returns local when [storage] mode = local", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			'[storage]\nmode = "local"\n',
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("rejects invalid mode values and defaults to local", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			'[storage]\nmode = "invalid"\n',
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("rejects non-string mode values and defaults to local", async () => {
		await writeFixture(tempDir, ".rp1/settings.toml", "[storage]\nmode = 42\n");

		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("handles malformed TOML gracefully and defaults to local", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"this is not valid {{toml}}",
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("local");
	});

	test("project settings override user settings (project central wins)", async () => {
		const projectRoot = join(tempDir, "project");
		const userConfigDir = join(tempDir, "user-config");

		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			'[storage]\nmode = "central"\n',
		);
		await writeFixture(
			userConfigDir,
			"rp1/settings.toml",
			'[storage]\nmode = "local"\n',
		);

		const result = readStorageMode(
			projectRoot,
			join(userConfigDir, "rp1", "settings.toml"),
		);
		expect(result).toBe("central");
	});

	test("falls back to user settings when project has no [storage]", async () => {
		const projectRoot = join(tempDir, "project");
		const userConfigDir = join(tempDir, "user-config");

		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			"[arguments.build]\nAFK = false\n",
		);
		await writeFixture(
			userConfigDir,
			"rp1/settings.toml",
			'[storage]\nmode = "central"\n',
		);

		const result = readStorageMode(
			projectRoot,
			join(userConfigDir, "rp1", "settings.toml"),
		);
		expect(result).toBe("central");
	});

	test("returns local when neither project nor user has [storage]", async () => {
		const projectRoot = join(tempDir, "project");
		const userConfigDir = join(tempDir, "user-config");

		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			"[arguments.build]\nAFK = false\n",
		);
		await writeFixture(
			userConfigDir,
			"rp1/settings.toml",
			"[arguments.build]\nAFK = true\n",
		);

		const result = readStorageMode(
			projectRoot,
			join(userConfigDir, "rp1", "settings.toml"),
		);
		expect(result).toBe("local");
	});

	test("coexists with other settings sections", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[arguments.build]",
				"AFK = false",
				"",
				"[models.claude-code]",
				'deep = "claude-sonnet-4-20250514"',
				"",
				"[storage]",
				'mode = "central"',
				"",
				"[arcade]",
				'theme = "dark"',
			].join("\n"),
		);

		const result = readStorageMode(tempDir);
		expect(result).toBe("central");
	});
});

describe("computeDirectoryPaths", () => {
	const projectRoot = "/projects/my-app";
	const projectId = "550e8400-e29b-41d4-a716-446655440000";

	test("local mode returns paths under projectRoot/.rp1/", () => {
		const result = computeDirectoryPaths(projectRoot, projectId, "local");
		expect(result.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	test("central mode returns paths under ~/.rp1/projects/<id>/", () => {
		const result = computeDirectoryPaths(projectRoot, projectId, "central");
		const expectedBase = join(homedir(), ".rp1", "projects", projectId);
		expect(result.kbRoot).toBe(join(expectedBase, "context"));
		expect(result.workRoot).toBe(join(expectedBase, "work"));
	});

	test("central mode degrades to local when projectId is undefined", () => {
		const result = computeDirectoryPaths(projectRoot, undefined, "central");
		expect(result.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	test("local mode with undefined projectId still returns local paths", () => {
		const result = computeDirectoryPaths(projectRoot, undefined, "local");
		expect(result.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	test("central mode paths are under ~/.rp1/ with no network I/O", () => {
		const result = computeDirectoryPaths(projectRoot, projectId, "central");
		const home = homedir();
		expect(result.kbRoot.startsWith(join(home, ".rp1"))).toBe(true);
		expect(result.workRoot.startsWith(join(home, ".rp1"))).toBe(true);
	});
});

describe("isContainerEnvironment", () => {
	let originalRemoteContainers: string | undefined;
	let originalCodespaces: string | undefined;

	beforeEach(() => {
		originalRemoteContainers = process.env.REMOTE_CONTAINERS;
		originalCodespaces = process.env.CODESPACES;
		delete process.env.REMOTE_CONTAINERS;
		delete process.env.CODESPACES;
		resetContainerDetectionCache();
	});

	afterEach(() => {
		if (originalRemoteContainers === undefined) {
			delete process.env.REMOTE_CONTAINERS;
		} else {
			process.env.REMOTE_CONTAINERS = originalRemoteContainers;
		}
		if (originalCodespaces === undefined) {
			delete process.env.CODESPACES;
		} else {
			process.env.CODESPACES = originalCodespaces;
		}
		resetContainerDetectionCache();
	});

	test("detects REMOTE_CONTAINERS environment variable", () => {
		process.env.REMOTE_CONTAINERS = "true";
		const result = isContainerEnvironment();
		expect(result).toBe(true);
	});

	test("detects CODESPACES environment variable", () => {
		process.env.CODESPACES = "true";
		const result = isContainerEnvironment();
		expect(result).toBe(true);
	});

	test("returns false when no container signals present", () => {
		// On dev machines without /.dockerenv this should be false.
		// We can only guarantee the env var checks here; /.dockerenv
		// depends on the host. If /.dockerenv exists on the test host,
		// the result will be true, which is correct behavior.
		if (existsSync("/.dockerenv")) {
			expect(isContainerEnvironment()).toBe(true);
		} else {
			expect(isContainerEnvironment()).toBe(false);
		}
	});

	test("caches result for process lifetime", () => {
		const first = isContainerEnvironment();
		// After first call, changing env should not change the result
		process.env.CODESPACES = "true";
		const second = isContainerEnvironment();
		expect(second).toBe(first);
	});

	test("resetContainerDetectionCache allows re-evaluation", () => {
		isContainerEnvironment();
		resetContainerDetectionCache();
		process.env.CODESPACES = "true";
		const second = isContainerEnvironment();
		expect(second).toBe(true);
	});
});
