import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeDatabase,
	resetInstance,
} from "../../agent-tools/emit/database.js";
import {
	gitUnstageTracked,
	relocateToCenter,
	removeProjectStanzas,
	updateGitignoreCentral,
	writeStorageSection,
} from "../../migrate/central-store.js";
import { executeMigrate, formatMigrateSummary } from "../../migrate/index.js";
import { initTestRepo, spawnGit } from "../helpers/git-helpers.js";

setDefaultTimeout(15000);

describe("central-store", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `rp1-central-store-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("relocateToCenter", () => {
		const projectId = "test-project-id";

		test("moves context files preserving directory structure", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			await mkdir(join(projectRoot, ".rp1", "context", "sub"), {
				recursive: true,
			});
			await writeFile(
				join(projectRoot, ".rp1", "context", "index.md"),
				"# KB Index",
			);
			await writeFile(
				join(projectRoot, ".rp1", "context", "sub", "nested.md"),
				"nested",
			);

			const result = relocateToCenter(projectRoot, projectId, { homeDir });

			expect(result.contextFiles).toBe(2);
			expect(
				existsSync(
					join(homeDir, ".rp1", "projects", projectId, "context", "index.md"),
				),
			).toBe(true);
			expect(
				existsSync(
					join(
						homeDir,
						".rp1",
						"projects",
						projectId,
						"context",
						"sub",
						"nested.md",
					),
				),
			).toBe(true);
			expect(
				readFileSync(
					join(homeDir, ".rp1", "projects", projectId, "context", "index.md"),
					"utf-8",
				),
			).toBe("# KB Index");
		});

		test("moves work files preserving directory structure", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			await mkdir(join(projectRoot, ".rp1", "work", "features"), {
				recursive: true,
			});
			await writeFile(
				join(projectRoot, ".rp1", "work", "features", "design.md"),
				"design",
			);

			const result = relocateToCenter(projectRoot, projectId, { homeDir });

			expect(result.workFiles).toBe(1);
			expect(
				existsSync(
					join(
						homeDir,
						".rp1",
						"projects",
						projectId,
						"work",
						"features",
						"design.md",
					),
				),
			).toBe(true);
		});

		test("skips files that already exist at destination (merge-without-overwrite)", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			const destContextDir = join(
				homeDir,
				".rp1",
				"projects",
				projectId,
				"context",
			);
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(destContextDir, { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "context", "index.md"),
				"local version",
			);
			await writeFile(
				join(destContextDir, "index.md"),
				"central version already here",
			);

			const result = relocateToCenter(projectRoot, projectId, { homeDir });

			expect(result.contextFiles).toBe(0);
			expect(result.skipped).toBe(1);
			expect(readFileSync(join(destContextDir, "index.md"), "utf-8")).toBe(
				"central version already here",
			);
		});

		test("handles empty source directories gracefully", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });

			const result = relocateToCenter(projectRoot, projectId, { homeDir });

			expect(result.contextFiles).toBe(0);
			expect(result.workFiles).toBe(0);
			expect(result.skipped).toBe(0);
		});

		test("handles missing source directories gracefully", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });

			const result = relocateToCenter(projectRoot, projectId, { homeDir });

			expect(result.contextFiles).toBe(0);
			expect(result.workFiles).toBe(0);
			expect(result.skipped).toBe(0);
		});

		test("dryRun reports planned file counts without moving", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "context", "index.md"),
				"content",
			);
			await writeFile(join(projectRoot, ".rp1", "work", "tasks.md"), "tasks");

			const result = relocateToCenter(projectRoot, projectId, {
				homeDir,
				dryRun: true,
			});

			expect(result.contextFiles).toBe(1);
			expect(result.workFiles).toBe(1);
			expect(existsSync(join(projectRoot, ".rp1", "context", "index.md"))).toBe(
				true,
			);
			expect(
				existsSync(join(homeDir, ".rp1", "projects", projectId, "context")),
			).toBe(false);
		});
	});

	describe("writeStorageSection", () => {
		test("creates new file with [storage] section when settings.toml does not exist", () => {
			const filePath = join(tempDir, ".rp1", "settings.toml");

			const written = writeStorageSection(filePath, "central");

			expect(written).toBe(true);
			const content = readFileSync(filePath, "utf-8");
			expect(content).toBe('[storage]\nmode = "central"\n');
		});

		test("appends [storage] section to existing file with other sections", async () => {
			const filePath = join(tempDir, "settings.toml");
			await writeFile(filePath, '[models]\ntier = "standard"\n');

			const written = writeStorageSection(filePath, "central");

			expect(written).toBe(true);
			const content = readFileSync(filePath, "utf-8");
			expect(content).toContain('[models]\ntier = "standard"');
			expect(content).toContain("[storage]");
			expect(content).toContain('mode = "central"');
		});

		test("is idempotent -- no-op when mode already set to central", async () => {
			const filePath = join(tempDir, "settings.toml");
			await writeFile(filePath, '[storage]\nmode = "central"\n');

			const written = writeStorageSection(filePath, "central");

			expect(written).toBe(false);
			expect(readFileSync(filePath, "utf-8")).toBe(
				'[storage]\nmode = "central"\n',
			);
		});

		test("updates existing mode value when different", async () => {
			const filePath = join(tempDir, "settings.toml");
			await writeFile(filePath, '[storage]\nmode = "local"\n');

			const written = writeStorageSection(filePath, "central");

			expect(written).toBe(true);
			const content = readFileSync(filePath, "utf-8");
			expect(content).toContain('mode = "central"');
			expect(content).not.toContain('mode = "local"');
		});

		test("preserves comments in existing file", async () => {
			const filePath = join(tempDir, "settings.toml");
			const original =
				'# User models config\n[models]\ntier = "standard"\n\n# Arcade config\n[arcade]\ntheme = "dark"\n';
			await writeFile(filePath, original);

			writeStorageSection(filePath, "central");

			const content = readFileSync(filePath, "utf-8");
			expect(content).toContain("# User models config");
			expect(content).toContain("# Arcade config");
			expect(content).toContain('[models]\ntier = "standard"');
			expect(content).toContain('theme = "dark"');
			expect(content).toContain("[storage]");
			expect(content).toContain('mode = "central"');
		});

		test("preserves other sections when [storage] already exists", async () => {
			const filePath = join(tempDir, "settings.toml");
			const original =
				'[models]\ntier = "standard"\n\n[storage]\nmode = "local"\n\n[arcade]\ntheme = "dark"\n';
			await writeFile(filePath, original);

			writeStorageSection(filePath, "central");

			const content = readFileSync(filePath, "utf-8");
			expect(content).toContain('[models]\ntier = "standard"');
			expect(content).toContain('theme = "dark"');
			expect(content).toContain('mode = "central"');
		});

		test("dryRun reports whether write would happen without modifying file", async () => {
			const filePath = join(tempDir, "settings.toml");
			await writeFile(filePath, '[models]\ntier = "standard"\n');

			const wouldWrite = writeStorageSection(filePath, "central", {
				dryRun: true,
			});

			expect(wouldWrite).toBe(true);
			const content = readFileSync(filePath, "utf-8");
			expect(content).not.toContain("[storage]");
		});

		test("dryRun returns false when already set to target mode", async () => {
			const filePath = join(tempDir, "settings.toml");
			await writeFile(filePath, '[storage]\nmode = "central"\n');

			const wouldWrite = writeStorageSection(filePath, "central", {
				dryRun: true,
			});

			expect(wouldWrite).toBe(false);
		});

		test("dryRun returns true for non-existent file", () => {
			const filePath = join(tempDir, "nonexistent", "settings.toml");

			const wouldWrite = writeStorageSection(filePath, "central", {
				dryRun: true,
			});

			expect(wouldWrite).toBe(true);
			expect(existsSync(filePath)).toBe(false);
		});
	});

	describe("updateGitignoreCentral", () => {
		test("replaces existing shell-fenced block with central preset", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const gitignorePath = join(projectRoot, ".gitignore");
			const existing =
				"# user rules\nnode_modules/\n\n# rp1:start\n!.rp1/\n.rp1/*\n!.rp1/project_id\n!.rp1/context/\n!.rp1/context/**\n# rp1:end\n";
			await writeFile(gitignorePath, existing);

			const result = updateGitignoreCentral(projectRoot);

			expect(result.updated).toBe(true);
			const content = readFileSync(gitignorePath, "utf-8");
			expect(content).toContain("node_modules/");
			expect(content).toContain("!.rp1/project_id");
			expect(content).toContain("!.rp1/settings.toml");
			expect(content).not.toContain("!.rp1/context/");
			expect(content).not.toContain("!.rp1/context/**");
		});

		test("creates new .gitignore with central preset when none exists", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });

			const result = updateGitignoreCentral(projectRoot);

			expect(result.updated).toBe(true);
			const content = readFileSync(join(projectRoot, ".gitignore"), "utf-8");
			expect(content).toContain("# rp1:start");
			expect(content).toContain("!.rp1/");
			expect(content).toContain(".rp1/*");
			expect(content).toContain("!.rp1/project_id");
			expect(content).toContain("!.rp1/settings.toml");
			expect(content).toContain("# rp1:end");
		});

		test("dryRun reports updated without modifying file", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const gitignorePath = join(projectRoot, ".gitignore");
			await writeFile(gitignorePath, "node_modules/\n");

			const result = updateGitignoreCentral(projectRoot, { dryRun: true });

			expect(result.updated).toBe(true);
			const content = readFileSync(gitignorePath, "utf-8");
			expect(content).toBe("node_modules/\n");
		});

		test("preserves user content outside the fenced block", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const gitignorePath = join(projectRoot, ".gitignore");
			const existing =
				"# Custom rules\nnode_modules/\ndist/\n\n# rp1:start\n!.rp1/\n.rp1/*\n# rp1:end\n\n# More custom\n.env\n";
			await writeFile(gitignorePath, existing);

			updateGitignoreCentral(projectRoot);

			const content = readFileSync(gitignorePath, "utf-8");
			expect(content).toContain("# Custom rules");
			expect(content).toContain("node_modules/");
			expect(content).toContain("dist/");
			expect(content).toContain("# More custom");
			expect(content).toContain(".env");
		});
	});

	describe("gitUnstageTracked", () => {
		test("unstages tracked files in git repo", async () => {
			const repoDir = join(tempDir, "repo");
			await mkdir(join(repoDir, ".rp1", "context"), { recursive: true });
			await initTestRepo(repoDir);
			await writeFile(
				join(repoDir, ".rp1", "context", "index.md"),
				"# KB Index",
			);

			const addProc = spawnGit(["add", "-f", ".rp1/context/index.md"], {
				cwd: repoDir,
			});
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "add context"], {
				cwd: repoDir,
			});
			await commitProc.exited;

			const result = gitUnstageTracked(repoDir, [".rp1/context"]);

			expect(result.unstaged.length).toBeGreaterThan(0);
			expect(result.unstaged).toContain(".rp1/context/index.md");
		});

		test("skips directories with no tracked files", async () => {
			const repoDir = join(tempDir, "repo");
			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			const addProc = spawnGit(["add", "."], { cwd: repoDir });
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "init"], {
				cwd: repoDir,
			});
			await commitProc.exited;

			const result = gitUnstageTracked(repoDir, [".rp1/context"]);

			expect(result.unstaged).toEqual([]);
		});

		test("skips non-git repos without error", async () => {
			const plainDir = join(tempDir, "nongit");
			await mkdir(plainDir, { recursive: true });

			const result = gitUnstageTracked(plainDir, [".rp1/context"]);

			expect(result.unstaged).toEqual([]);
		});

		test("dryRun lists files that would be unstaged without modifying git index", async () => {
			const repoDir = join(tempDir, "repo");
			await mkdir(join(repoDir, ".rp1", "context"), { recursive: true });
			await initTestRepo(repoDir);
			await writeFile(join(repoDir, ".rp1", "context", "index.md"), "# KB");

			const addProc = spawnGit(["add", "-f", ".rp1/context/index.md"], {
				cwd: repoDir,
			});
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "add context"], {
				cwd: repoDir,
			});
			await commitProc.exited;

			const result = gitUnstageTracked(repoDir, [".rp1/context"], {
				dryRun: true,
			});

			expect(result.unstaged).toContain(".rp1/context/index.md");

			const lsProc = spawnGit(["ls-files", ".rp1/context"], {
				cwd: repoDir,
			});
			await lsProc.exited;
			const stillTracked = (
				await new Response(lsProc.stdout as ReadableStream).text()
			).trim();
			expect(stillTracked).toContain(".rp1/context/index.md");
		});
	});

	describe("removeProjectStanzas", () => {
		test("removes fenced block from CLAUDE.md preserving user content", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const claudePath = join(projectRoot, "CLAUDE.md");
			const content =
				"# My Project\n\nCustom instructions here.\n\n<!-- rp1:start -->\nManaged content\n<!-- rp1:end -->\n\nMore user content.\n";
			await writeFile(claudePath, content);

			const result = removeProjectStanzas(projectRoot);

			expect(result.filesModified).toContain("CLAUDE.md");
			const cleaned = readFileSync(claudePath, "utf-8");
			expect(cleaned).toContain("# My Project");
			expect(cleaned).toContain("Custom instructions here.");
			expect(cleaned).toContain("More user content.");
			expect(cleaned).not.toContain("rp1:start");
			expect(cleaned).not.toContain("Managed content");
		});

		test("removes fenced block from AGENTS.md", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const agentsPath = join(projectRoot, "AGENTS.md");
			const content =
				"<!-- rp1:start:v0.7.1 -->\nAgent instructions\n<!-- rp1:end:v0.7.1 -->\n";
			await writeFile(agentsPath, content);

			const result = removeProjectStanzas(projectRoot);

			expect(result.filesModified).toContain("AGENTS.md");
			const cleaned = readFileSync(agentsPath, "utf-8");
			expect(cleaned).not.toContain("rp1:start");
			expect(cleaned).not.toContain("Agent instructions");
		});

		test("handles missing files gracefully", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });

			const result = removeProjectStanzas(projectRoot);

			expect(result.filesSkipped).toContain("CLAUDE.md");
			expect(result.filesSkipped).toContain("AGENTS.md");
			expect(result.filesModified).toEqual([]);
		});

		test("skips files without rp1 fences", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			await writeFile(
				join(projectRoot, "CLAUDE.md"),
				"# Custom instructions only\nNo fences here.\n",
			);

			const result = removeProjectStanzas(projectRoot);

			expect(result.filesSkipped).toContain("CLAUDE.md");
			expect(result.filesModified).not.toContain("CLAUDE.md");
			const content = readFileSync(join(projectRoot, "CLAUDE.md"), "utf-8");
			expect(content).toBe("# Custom instructions only\nNo fences here.\n");
		});

		test("fence-only file produces empty or minimal content", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			await writeFile(
				join(projectRoot, "CLAUDE.md"),
				"<!-- rp1:start -->\nAll managed content\n<!-- rp1:end -->\n",
			);

			removeProjectStanzas(projectRoot);

			const content = readFileSync(join(projectRoot, "CLAUDE.md"), "utf-8");
			expect(content.trim()).toBe("");
		});

		test("dryRun detects fences and reports without writing", async () => {
			const projectRoot = join(tempDir, "project");
			await mkdir(projectRoot, { recursive: true });
			const originalContent =
				"User content\n\n<!-- rp1:start -->\nManaged\n<!-- rp1:end -->\n";
			await writeFile(join(projectRoot, "CLAUDE.md"), originalContent);

			const result = removeProjectStanzas(projectRoot, { dryRun: true });

			expect(result.filesModified).toContain("CLAUDE.md");
			const content = readFileSync(join(projectRoot, "CLAUDE.md"), "utf-8");
			expect(content).toBe(originalContent);
		});
	});

	describe("relocateToCenter cross-device fallback", () => {
		test("falls back to copy+delete when rename throws EXDEV", async () => {
			const projectRoot = join(tempDir, "project");
			const homeDir = join(tempDir, "home");
			const projectId = "cross-device-test";
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "context", "index.md"),
				"cross device content",
			);

			const fs = require("node:fs");
			const renameSyncRef = Object.getOwnPropertyDescriptor(fs, "renameSync");

			try {
				fs.renameSync = (_src: string, _dest: string) => {
					const err = new Error(
						"EXDEV: cross-device link not permitted",
					) as NodeJS.ErrnoException;
					err.code = "EXDEV";
					throw err;
				};

				const result = relocateToCenter(projectRoot, projectId, { homeDir });

				expect(result.contextFiles).toBe(1);
				expect(
					existsSync(
						join(homeDir, ".rp1", "projects", projectId, "context", "index.md"),
					),
				).toBe(true);
				expect(
					readFileSync(
						join(homeDir, ".rp1", "projects", projectId, "context", "index.md"),
						"utf-8",
					),
				).toBe("cross device content");
				expect(
					existsSync(join(projectRoot, ".rp1", "context", "index.md")),
				).toBe(false);
			} finally {
				if (renameSyncRef) {
					Object.defineProperty(fs, "renameSync", renameSyncRef);
				}
			}
		});
	});

	describe("executeMigrate central-store integration", () => {
		let originalRp1Db: string | undefined;
		let homeDir: string;
		let globalSettingsPath: string;

		beforeEach(async () => {
			originalRp1Db = process.env.RP1_DB;
			process.env.RP1_DB = join(tempDir, "test-central.db");
			homeDir = join(tempDir, "fake-home");
			await mkdir(homeDir, { recursive: true });
			globalSettingsPath = join(homeDir, ".config", "rp1", "settings.toml");
		});

		afterEach(async () => {
			closeDatabase();
			resetInstance();

			if (originalRp1Db === undefined) {
				delete process.env.RP1_DB;
			} else {
				process.env.RP1_DB = originalRp1Db;
			}
		});

		test("REQ-008: bare migrate does NOT convert a local project to central", async () => {
			const projectRoot = join(tempDir, "local-project");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
			await writeFile(join(projectRoot, ".rp1", "context", "index.md"), "# KB");
			await writeFile(join(projectRoot, ".rp1", "work", "tasks.md"), "# Tasks");

			const result = await executeMigrate(projectRoot);

			expect(result.centralStore).toBeUndefined();
			expect(existsSync(join(projectRoot, ".rp1", "context", "index.md"))).toBe(
				true,
			);
			expect(existsSync(join(projectRoot, ".rp1", "work", "tasks.md"))).toBe(
				true,
			);
			const settingsPath = join(projectRoot, ".rp1", "settings.toml");
			if (existsSync(settingsPath)) {
				const content = readFileSync(settingsPath, "utf-8");
				expect(content).not.toContain('mode = "central"');
			}
		});

		test("REQ-008: bare migrate output contains NO --to-central recommendation", async () => {
			const projectRoot = join(tempDir, "no-rec-project");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });

			const result = await executeMigrate(projectRoot);
			const summary = formatMigrateSummary(result);

			expect(summary).not.toContain("--to-central");
			expect(summary).not.toContain("to-central");
			expect(summary).not.toContain("central storage");
			expect(summary).not.toContain("Central storage");
		});

		test("REQ-008: --dry-run without --to-central reports only local-mode actions", async () => {
			const projectRoot = join(tempDir, "dry-local-project");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await writeFile(join(projectRoot, ".rp1", "context", "index.md"), "# KB");

			const result = await executeMigrate(projectRoot, { dryRun: true });

			expect(result.dryRun).toBe(true);
			expect(result.centralStore).toBeUndefined();

			const summary = formatMigrateSummary(result);
			expect(summary).toContain("Migration dry-run");
			expect(summary).not.toContain("Central storage conversion");
			expect(summary).not.toContain("Would relocate");
			expect(summary).not.toContain("central preset");
		});

		test("--to-central converts a local project to central end-to-end", async () => {
			const projectRoot = join(tempDir, "convert-project");
			await mkdir(join(projectRoot, ".rp1", "context", "sub"), {
				recursive: true,
			});
			await mkdir(join(projectRoot, ".rp1", "work", "features"), {
				recursive: true,
			});
			await writeFile(
				join(projectRoot, ".rp1", "context", "index.md"),
				"# KB Index",
			);
			await writeFile(
				join(projectRoot, ".rp1", "context", "sub", "nested.md"),
				"nested",
			);
			await writeFile(
				join(projectRoot, ".rp1", "work", "features", "design.md"),
				"design",
			);

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			const cs = result.centralStore!;

			expect(cs.relocated.contextFiles).toBe(2);
			expect(cs.relocated.workFiles).toBe(1);
			expect(cs.settingsWritten).toBe(true);

			const settingsContent = readFileSync(
				join(projectRoot, ".rp1", "settings.toml"),
				"utf-8",
			);
			expect(settingsContent).toContain('mode = "central"');

			const centralBase = join(homeDir, ".rp1", "projects", result.projectId);
			expect(existsSync(join(centralBase, "context", "index.md"))).toBe(true);
			expect(
				readFileSync(join(centralBase, "context", "index.md"), "utf-8"),
			).toBe("# KB Index");
			expect(existsSync(join(centralBase, "context", "sub", "nested.md"))).toBe(
				true,
			);
			expect(
				existsSync(join(centralBase, "work", "features", "design.md")),
			).toBe(true);

			expect(cs.gitignoreUpdated.updated).toBe(true);
			const gitignoreContent = readFileSync(
				join(projectRoot, ".gitignore"),
				"utf-8",
			);
			expect(gitignoreContent).toContain("!.rp1/settings.toml");
		});

		test("--to-central is idempotent on an already-central project", async () => {
			const projectRoot = join(tempDir, "already-central");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "settings.toml"),
				'[storage]\nmode = "central"\n',
			);

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			const cs = result.centralStore!;

			expect(cs.relocated.contextFiles).toBe(0);
			expect(cs.relocated.workFiles).toBe(0);
			expect(cs.relocated.skipped).toBe(0);
			expect(cs.settingsWritten).toBe(false);
			expect(cs.stanzasRemoved.filesModified).toEqual([]);
			expect(cs.gitignoreUpdated.updated).toBe(false);
			expect(cs.gitUnstaged.unstaged).toEqual([]);
		});

		test("--dry-run + --to-central reports planned central actions without modifying files", async () => {
			const projectRoot = join(tempDir, "dry-central-project");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
			await writeFile(join(projectRoot, ".rp1", "context", "index.md"), "# KB");
			await writeFile(join(projectRoot, ".rp1", "work", "tasks.md"), "tasks");
			await writeFile(
				join(projectRoot, "CLAUDE.md"),
				"User content\n\n<!-- rp1:start -->\nManaged\n<!-- rp1:end -->\n",
			);

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				dryRun: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.dryRun).toBe(true);
			expect(result.centralStore).toBeDefined();
			const cs = result.centralStore!;

			expect(cs.relocated.contextFiles).toBe(1);
			expect(cs.relocated.workFiles).toBe(1);
			expect(cs.settingsWritten).toBe(true);
			expect(cs.stanzasRemoved.filesModified).toContain("CLAUDE.md");

			expect(existsSync(join(projectRoot, ".rp1", "context", "index.md"))).toBe(
				true,
			);
			expect(existsSync(join(projectRoot, ".rp1", "work", "tasks.md"))).toBe(
				true,
			);
			const claudeContent = readFileSync(
				join(projectRoot, "CLAUDE.md"),
				"utf-8",
			);
			expect(claudeContent).toContain("rp1:start");

			if (existsSync(join(projectRoot, ".rp1", "settings.toml"))) {
				const settings = readFileSync(
					join(projectRoot, ".rp1", "settings.toml"),
					"utf-8",
				);
				expect(settings).not.toContain('mode = "central"');
			}

			expect(existsSync(join(homeDir, ".rp1", "projects"))).toBe(false);

			const summary = formatMigrateSummary(result);
			expect(summary).toContain("Central storage conversion");
			expect(summary).toContain("Would relocate");
			expect(summary).toContain("Would write [storage]");
			expect(summary).toContain("Would remove stanzas from");
		});

		test("stanza removal preserves surrounding user content on full central conversion", async () => {
			const projectRoot = join(tempDir, "stanza-preserve");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			const userContentBefore =
				"# My Custom Project Notes\n\nImportant config details.\n";
			const userContentAfter =
				"\n## My Build Instructions\n\nAlways run tests first.\n";
			await writeFile(
				join(projectRoot, "CLAUDE.md"),
				`${userContentBefore}\n<!-- rp1:start -->\nrp1 managed block\n<!-- rp1:end -->\n${userContentAfter}`,
			);
			await writeFile(
				join(projectRoot, "AGENTS.md"),
				"<!-- rp1:start:v0.7.0 -->\nAgent stanza\n<!-- rp1:end:v0.7.0 -->\n",
			);

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			expect(result.centralStore!.stanzasRemoved.filesModified).toContain(
				"CLAUDE.md",
			);
			expect(result.centralStore!.stanzasRemoved.filesModified).toContain(
				"AGENTS.md",
			);

			const claudeContent = readFileSync(
				join(projectRoot, "CLAUDE.md"),
				"utf-8",
			);
			expect(claudeContent).toContain("# My Custom Project Notes");
			expect(claudeContent).toContain("Important config details.");
			expect(claudeContent).toContain("## My Build Instructions");
			expect(claudeContent).toContain("Always run tests first.");
			expect(claudeContent).not.toContain("rp1:start");
			expect(claudeContent).not.toContain("rp1 managed block");

			const agentsContent = readFileSync(
				join(projectRoot, "AGENTS.md"),
				"utf-8",
			);
			expect(agentsContent).not.toContain("rp1:start");
			expect(agentsContent).not.toContain("Agent stanza");
		});

		test("central gitignore rules include settings.toml un-ignore and exclude context/work", async () => {
			const projectRoot = join(tempDir, "gitignore-rules");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			await writeFile(
				join(projectRoot, ".gitignore"),
				"node_modules/\n\n# rp1:start\n!.rp1/\n.rp1/*\n!.rp1/project_id\n!.rp1/context/\n!.rp1/context/**\n# rp1:end\n",
			);

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			expect(result.centralStore!.gitignoreUpdated.updated).toBe(true);

			const gitignoreContent = readFileSync(
				join(projectRoot, ".gitignore"),
				"utf-8",
			);
			expect(gitignoreContent).toContain("!.rp1/settings.toml");
			expect(gitignoreContent).toContain("!.rp1/project_id");
			expect(gitignoreContent).not.toContain("!.rp1/context/");
			expect(gitignoreContent).not.toContain("!.rp1/context/**");
			expect(gitignoreContent).toContain("node_modules/");
		});

		test("git rm --cached only runs on tracked files in git repos", async () => {
			const repoDir = join(tempDir, "tracked-repo");
			await mkdir(join(repoDir, ".rp1", "context"), { recursive: true });
			await initTestRepo(repoDir);
			await writeFile(join(repoDir, ".rp1", "context", "index.md"), "# KB");

			const addProc = spawnGit(["add", "-f", ".rp1/context/index.md"], {
				cwd: repoDir,
			});
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "track context"], {
				cwd: repoDir,
			});
			await commitProc.exited;

			const result = await executeMigrate(repoDir, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			expect(result.centralStore!.gitUnstaged.unstaged.length).toBeGreaterThan(
				0,
			);
			expect(result.centralStore!.gitUnstaged.unstaged).toContain(
				".rp1/context/index.md",
			);
		});

		test("git rm --cached is skipped gracefully for non-git repos", async () => {
			const plainDir = join(tempDir, "non-git-project");
			await mkdir(join(plainDir, ".rp1", "context"), { recursive: true });
			await writeFile(join(plainDir, ".rp1", "context", "index.md"), "# KB");

			const result = await executeMigrate(plainDir, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			expect(result.centralStore!.gitUnstaged.unstaged).toEqual([]);
		});

		test("storage section write is idempotent through full orchestrator", async () => {
			const projectRoot = join(tempDir, "idempotent-settings");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "settings.toml"),
				'[models]\ntier = "standard"\n',
			);

			const centralOpts = { toCentral: true, homeDir, globalSettingsPath };

			const first = await executeMigrate(projectRoot, centralOpts);

			expect(first.centralStore).toBeDefined();
			expect(first.centralStore!.settingsWritten).toBe(true);

			const settingsAfterFirst = readFileSync(
				join(projectRoot, ".rp1", "settings.toml"),
				"utf-8",
			);
			expect(settingsAfterFirst).toContain('[models]\ntier = "standard"');
			expect(settingsAfterFirst).toContain('mode = "central"');

			closeDatabase();
			resetInstance();

			const second = await executeMigrate(projectRoot, centralOpts);

			expect(second.centralStore).toBeDefined();
			expect(second.centralStore!.settingsWritten).toBe(false);

			const settingsAfterSecond = readFileSync(
				join(projectRoot, ".rp1", "settings.toml"),
				"utf-8",
			);
			const modeOccurrences = (
				settingsAfterSecond.match(/mode = "central"/g) || []
			).length;
			expect(modeOccurrences).toBe(1);
		});

		test("global stanza injection is scoped to enabled harnesses only", async () => {
			const globalSettingsDir = join(homeDir, ".config", "rp1");
			await mkdir(globalSettingsDir, { recursive: true });
			await writeFile(
				globalSettingsPath,
				'[harnesses]\nenabled = ["claude-code"]\n',
			);

			const projectRoot = join(tempDir, "stanza-scope");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });

			const result = await executeMigrate(projectRoot, {
				toCentral: true,
				homeDir,
				globalSettingsPath,
			});

			expect(result.centralStore).toBeDefined();
			const gs = result.centralStore!.globalStanza;

			const claudeActioned =
				gs.written.includes("claude-code") ||
				gs.updated.includes("claude-code");
			expect(claudeActioned).toBe(true);

			const claudePath = join(homeDir, ".claude", "CLAUDE.md");
			expect(existsSync(claudePath)).toBe(true);
			const claudeContent = readFileSync(claudePath, "utf-8");
			expect(claudeContent).toContain("rp1");

			expect(gs.written).not.toContain("codex");
			expect(gs.updated).not.toContain("codex");
			const codexPath = join(homeDir, ".codex", "AGENTS.md");
			expect(existsSync(codexPath)).toBe(false);
		});

		test("formatMigrateSummary includes central store section for --to-central results", () => {
			const summary = formatMigrateSummary({
				projectRoot: tempDir,
				projectId: "test-uuid",
				projectIdCreated: false,
				workDirCreated: false,
				legacyWork: undefined,
				gitignore: { updated: false, rulesAdded: [] },
				dbBackfill: {
					runsUpdated: 0,
					artifactsUpdated: 0,
					tasksUpdated: 0,
					notificationsUpdated: 0,
					artifactFilesMoved: 0,
				},
				stanzaUpgrade: {
					filesUpgraded: [],
					filesAlreadyCurrent: [],
					filesScanned: 0,
					filesNotFound: [],
					errors: [],
				},
				arcadeSettings: {
					globalMigrated: false,
					projectMigrated: false,
				},
				centralStore: {
					relocated: { contextFiles: 3, workFiles: 2, skipped: 1 },
					settingsWritten: true,
					stanzasRemoved: {
						filesModified: ["CLAUDE.md", "AGENTS.md"],
						filesSkipped: [],
					},
					globalStanza: {
						written: ["claude-code"],
						updated: [],
						removed: [],
						skipped: [],
						errors: [],
						paths: new Map(),
					},
					gitignoreUpdated: { updated: true },
					gitUnstaged: { unstaged: [".rp1/context/index.md"] },
				},
			});

			expect(summary).toContain("Central storage conversion");
			expect(summary).toContain(
				"Relocated 3 context file(s) and 2 work file(s)",
			);
			expect(summary).toContain(
				"Skipped 1 file(s) (already exist at destination)",
			);
			expect(summary).toContain('Wrote [storage] mode = "central"');
			expect(summary).toContain("Removed stanzas from: CLAUDE.md, AGENTS.md");
			expect(summary).toContain("Global stanzas: 1 written");
			expect(summary).toContain("Updated .gitignore to central preset");
			expect(summary).toContain("Unstaged 1 file(s) from git index");
		});

		test("formatMigrateSummary dry-run central section reports would-do actions", () => {
			const summary = formatMigrateSummary({
				dryRun: true,
				projectRoot: tempDir,
				projectId: "(generated on apply)",
				projectIdCreated: true,
				workDirCreated: true,
				legacyWork: undefined,
				gitignore: { updated: false, rulesAdded: [] },
				dbBackfill: {
					runsUpdated: 0,
					artifactsUpdated: 0,
					tasksUpdated: 0,
					notificationsUpdated: 0,
					artifactFilesMoved: 0,
				},
				stanzaUpgrade: {
					filesUpgraded: [],
					filesAlreadyCurrent: [],
					filesScanned: 0,
					filesNotFound: [],
					errors: [],
				},
				arcadeSettings: {
					globalMigrated: false,
					projectMigrated: false,
				},
				centralStore: {
					relocated: { contextFiles: 1, workFiles: 2, skipped: 0 },
					settingsWritten: true,
					stanzasRemoved: {
						filesModified: ["CLAUDE.md"],
						filesSkipped: ["AGENTS.md"],
					},
					globalStanza: {
						written: ["claude-code", "codex"],
						updated: [],
						removed: [],
						skipped: [],
						errors: [],
						paths: new Map(),
					},
					gitignoreUpdated: { updated: true },
					gitUnstaged: {
						unstaged: [".rp1/context/index.md", ".rp1/work/tasks.md"],
					},
				},
			});

			expect(summary).toContain("Migration dry-run");
			expect(summary).toContain("Central storage conversion");
			expect(summary).toContain(
				"Would relocate 1 context file(s) and 2 work file(s)",
			);
			expect(summary).toContain('Would write [storage] mode = "central"');
			expect(summary).toContain("Would remove stanzas from: CLAUDE.md");
			expect(summary).toContain("Would manage global stanzas: 2 to write");
			expect(summary).toContain("Would update .gitignore to central preset");
			expect(summary).toContain("Would unstage 2 tracked file(s)");
		});
	});
});
