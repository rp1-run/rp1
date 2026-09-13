import Database from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeProjectKey } from "../../../shared/directory-resolution.js";
import { executeMigrate } from "../../migrate/index.js";
import { detectPendingMigration } from "../../migrate/pending-detection.js";

const fixture = async () => {
	const root = await mkdtemp(join(tmpdir(), "rp1-pending-"));
	const home = await mkdtemp(join(tmpdir(), "rp1-home-"));
	await mkdir(join(root, ".rp1"), { recursive: true });
	return { root, home };
};

describe("detectPendingMigration", () => {
	test("detects missing project_id and legacy work artifacts", async () => {
		const { root, home } = await fixture();
		const legacy = join(home, ".rp1", "work", normalizeProjectKey(root));
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "features.md"), "legacy");
		const result = detectPendingMigration(root, { homeDir: home });
		expect(result).toEqual({
			needsMigration: true,
			reasons: ["legacy work directory", "missing project_id"],
		});
	});

	test("ignores empty legacy directories and missing databases", async () => {
		const { root, home } = await fixture();
		await writeFile(join(root, ".rp1", "project_id"), "id");
		const legacy = join(home, ".rp1", "work", normalizeProjectKey(root));
		await mkdir(join(legacy, "features", "empty"), { recursive: true });
		expect(detectPendingMigration(root, { homeDir: home })).toEqual({
			needsMigration: false,
			reasons: [],
		});
	});

	test("detects unlinked rows in a pre-project_id schema", async () => {
		const { root, home } = await fixture();
		await writeFile(join(root, ".rp1", "project_id"), "id");
		const dbPath = join(home, ".rp1", "rp1.db");
		await mkdir(join(home, ".rp1"), { recursive: true });
		const db = new Database(dbPath);
		db.exec(
			`CREATE TABLE runs (project_path TEXT, rp1_project_root TEXT); INSERT INTO runs VALUES ('${root}', NULL)`,
		);
		db.close();
		expect(detectPendingMigration(root, { homeDir: home })).toEqual({
			needsMigration: true,
			reasons: ["unlinked database rows"],
		});
	});

	test("clears the work reason after migration moves every artifact", async () => {
		const { root, home } = await fixture();
		const legacy = join(home, ".rp1", "work", normalizeProjectKey(root));
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "features.md"), "legacy");
		expect(detectPendingMigration(root, { homeDir: home }).needsMigration).toBe(
			true,
		);
		await executeMigrate(root, { homeDir: home });
		expect(detectPendingMigration(root, { homeDir: home })).toEqual({
			needsMigration: false,
			reasons: [],
		});
	});
});
