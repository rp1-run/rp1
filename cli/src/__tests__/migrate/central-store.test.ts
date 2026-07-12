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
	gitUnstageTracked,
	relocateToCenter,
	removeProjectStanzas,
	updateGitignoreCentral,
	writeStorageSection,
} from "../../migrate/central-store.js";
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
});
