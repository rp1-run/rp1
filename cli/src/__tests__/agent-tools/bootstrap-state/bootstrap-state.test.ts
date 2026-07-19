import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import {
	mkdir,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BOOTSTRAP_STATE_FILENAME,
	BOOTSTRAP_STATE_VERSION,
} from "../../../agent-tools/bootstrap-state/models.js";
import {
	deleteBootstrapState,
	readBootstrapState,
	writeBootstrapState,
} from "../../../agent-tools/bootstrap-state/operations.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("bootstrap-state operations", () => {
	let tempBase: string;

	beforeAll(async () => {
		const tempDir = join(tmpdir(), `bootstrap-state-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);
	});

	afterAll(async () => {
		await rm(tempBase, { recursive: true, force: true });
	});

	const makeDir = async (name: string): Promise<string> => {
		const dir = join(tempBase, name);
		await mkdir(dir, { recursive: true });
		return dir;
	};

	const markerFile = (targetDir: string): string =>
		join(targetDir, ".rp1", BOOTSTRAP_STATE_FILENAME);

	describe("write", () => {
		test("produces valid JSON with version, projectName, targetDir, and createdAt", async () => {
			const targetDir = await makeDir("write-basic");
			const state = await expectTaskRight(
				writeBootstrapState({ projectName: "my-project", targetDir }),
			);

			expect(state.version).toBe(BOOTSTRAP_STATE_VERSION);
			expect(state.projectName).toBe("my-project");
			expect(state.targetDir).toBe(targetDir);
			expect(typeof state.createdAt).toBe("string");
			expect(() => new Date(state.createdAt)).not.toThrow();
		});

		test("writes canonical absolute path even when given a relative-like form", async () => {
			const targetDir = await makeDir("write-canonical");
			const inputPath = join(targetDir, ".", "subdir", "..");
			const state = await expectTaskRight(
				writeBootstrapState({
					projectName: "canonical-test",
					targetDir: inputPath,
				}),
			);

			expect(state.targetDir).toBe(targetDir);
		});

		test("creates .rp1 directory if it does not exist", async () => {
			const targetDir = await makeDir("write-create-dir");
			await expectTaskRight(
				writeBootstrapState({ projectName: "dir-test", targetDir }),
			);

			expect(existsSync(join(targetDir, ".rp1"))).toBe(true);
			expect(existsSync(markerFile(targetDir))).toBe(true);
		});

		test("file on disk contains valid parseable JSON matching returned state", async () => {
			const targetDir = await makeDir("write-disk-json");
			const state = await expectTaskRight(
				writeBootstrapState({ projectName: "disk-check", targetDir }),
			);

			const raw = await Bun.file(markerFile(targetDir)).text();
			const parsed = JSON.parse(raw);

			expect(parsed).toEqual(state);
		});

		test("leaves no temp file after successful write", async () => {
			const targetDir = await makeDir("write-no-temp");
			await expectTaskRight(
				writeBootstrapState({ projectName: "temp-check", targetDir }),
			);

			const rp1Dir = join(targetDir, ".rp1");
			const files = readdirSync(rp1Dir);
			const tempFiles = files.filter((f) => f.includes(".tmp"));
			expect(tempFiles).toHaveLength(0);
		});

		test("handles special characters in project name via real JSON serialization", async () => {
			const targetDir = await makeDir("write-special-chars");
			const specialName = "Project \"with' quotes & back\\slashes\nnewlines";
			const state = await expectTaskRight(
				writeBootstrapState({ projectName: specialName, targetDir }),
			);

			expect(state.projectName).toBe(specialName);

			const raw = await Bun.file(markerFile(targetDir)).text();
			const parsed = JSON.parse(raw);
			expect(parsed.projectName).toBe(specialName);
		});

		test("rejects empty project name", async () => {
			const targetDir = await makeDir("write-empty-name");
			const error = await expectTaskLeft(
				writeBootstrapState({ projectName: "", targetDir }),
			);

			expect(error._tag).toBe("UsageError");
		});

		test("rejects empty target directory", async () => {
			const error = await expectTaskLeft(
				writeBootstrapState({ projectName: "test", targetDir: "" }),
			);

			expect(error._tag).toBe("UsageError");
		});
	});

	describe("read", () => {
		test("returns valid result for a correctly written marker", async () => {
			const targetDir = await makeDir("read-valid");
			const written = await expectTaskRight(
				writeBootstrapState({ projectName: "read-test", targetDir }),
			);

			const readResult = await expectTaskRight(readBootstrapState(targetDir));

			expect(readResult.valid).toBe(true);
			if (!readResult.valid) return;
			expect(readResult.state.version).toBe(written.version);
			expect(readResult.state.projectName).toBe(written.projectName);
			expect(readResult.state.targetDir).toBe(written.targetDir);
			expect(readResult.state.createdAt).toBe(written.createdAt);
		});

		test("write-read round-trip preserves all fields exactly", async () => {
			const targetDir = await makeDir("read-roundtrip");
			const written = await expectTaskRight(
				writeBootstrapState({ projectName: "roundtrip-proj", targetDir }),
			);

			const readResult = await expectTaskRight(readBootstrapState(targetDir));

			expect(readResult.valid).toBe(true);
			if (!readResult.valid) return;
			expect(readResult.state).toEqual(written);
		});

		test("round-trip preserves special characters", async () => {
			const targetDir = await makeDir("read-special");
			const specialName = 'Name with "quotes" and \\ backslash and > angle';
			const written = await expectTaskRight(
				writeBootstrapState({ projectName: specialName, targetDir }),
			);

			const readResult = await expectTaskRight(readBootstrapState(targetDir));

			expect(readResult.valid).toBe(true);
			if (!readResult.valid) return;
			expect(readResult.state.projectName).toBe(specialName);
			expect(readResult.state).toEqual(written);
		});

		test("returns not-found error when no marker exists", async () => {
			const targetDir = await makeDir("read-missing");
			const error = await expectTaskLeft(readBootstrapState(targetDir));

			expect(error._tag).toBe("NotFoundError");
		});

		test("rejects empty target directory", async () => {
			const error = await expectTaskLeft(readBootstrapState(""));

			expect(error._tag).toBe("UsageError");
		});
	});

	describe("delete", () => {
		test("removes a present marker and reports deleted", async () => {
			const targetDir = await makeDir("delete-present");
			await expectTaskRight(
				writeBootstrapState({ projectName: "delete-test", targetDir }),
			);

			const result = await expectTaskRight(deleteBootstrapState(targetDir));

			expect(result.deleted).toBe(true);
			expect(existsSync(markerFile(targetDir))).toBe(false);
		});

		test("is idempotent when no marker is present", async () => {
			const targetDir = await makeDir("delete-absent");

			const result = await expectTaskRight(deleteBootstrapState(targetDir));

			expect(result.deleted).toBe(false);
		});

		test("rejects empty target directory", async () => {
			const error = await expectTaskLeft(deleteBootstrapState(""));

			expect(error._tag).toBe("UsageError");
		});
	});

	describe("in-place discovery", () => {
		test("marker written and read from the same directory succeeds", async () => {
			const targetDir = await makeDir("discover-inplace");
			await expectTaskRight(
				writeBootstrapState({ projectName: "inplace-proj", targetDir }),
			);

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(true);
			if (!result.valid) return;
			expect(result.state.targetDir).toBe(targetDir);
			expect(result.state.projectName).toBe("inplace-proj");
		});
	});

	describe("child-target discovery", () => {
		test("marker at child directory is readable when targeted directly", async () => {
			const parent = await makeDir("discover-parent");
			const child = join(parent, "child-project");
			await mkdir(child, { recursive: true });

			await expectTaskRight(
				writeBootstrapState({ projectName: "child-proj", targetDir: child }),
			);

			const result = await expectTaskRight(readBootstrapState(child));

			expect(result.valid).toBe(true);
			if (!result.valid) return;
			expect(result.state.targetDir).toBe(child);
			expect(result.state.projectName).toBe("child-proj");
		});

		test("marker at parent directory is not found when reading from child", async () => {
			const parent = await makeDir("discover-child-no-parent");
			const child = join(parent, "sub");
			await mkdir(child, { recursive: true });

			await expectTaskRight(
				writeBootstrapState({ projectName: "parent-only", targetDir: parent }),
			);

			const error = await expectTaskLeft(readBootstrapState(child));
			expect(error._tag).toBe("NotFoundError");
		});
	});

	describe("malformed JSON", () => {
		test("returns malformed error for unparseable JSON", async () => {
			const targetDir = await makeDir("malformed-unparseable");
			const rp1Dir = join(targetDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(markerFile(targetDir), "not valid json {{{");

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("invalid JSON");
		});

		test("returns malformed error for JSON array instead of object", async () => {
			const targetDir = await makeDir("malformed-array");
			const rp1Dir = join(targetDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(markerFile(targetDir), "[1, 2, 3]");

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("JSON object");
		});

		test("returns malformed error for JSON null", async () => {
			const targetDir = await makeDir("malformed-null");
			const rp1Dir = join(targetDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(markerFile(targetDir), "null");

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
		});
	});

	describe("missing fields", () => {
		let targetDir: string;

		beforeAll(async () => {
			targetDir = await makeDir("missing-fields-base");
		});

		const writeRawMarker = async (
			name: string,
			content: Record<string, unknown>,
		): Promise<string> => {
			const dir = join(targetDir, name);
			const rp1Dir = join(dir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				join(rp1Dir, BOOTSTRAP_STATE_FILENAME),
				JSON.stringify(content),
			);
			return dir;
		};

		test("returns malformed error when version is missing", async () => {
			const dir = await writeRawMarker("no-version", {
				projectName: "test",
				targetDir: join(targetDir, "no-version"),
				createdAt: new Date().toISOString(),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("version");
		});

		test("returns malformed error when projectName is missing", async () => {
			const dir = await writeRawMarker("no-project-name", {
				version: 1,
				targetDir: join(targetDir, "no-project-name"),
				createdAt: new Date().toISOString(),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("projectName");
		});

		test("returns malformed error when targetDir is missing", async () => {
			const dir = await writeRawMarker("no-target-dir", {
				version: 1,
				projectName: "test",
				createdAt: new Date().toISOString(),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("targetDir");
		});

		test("returns malformed error when createdAt is missing", async () => {
			const dir = await writeRawMarker("no-created-at", {
				version: 1,
				projectName: "test",
				targetDir: join(targetDir, "no-created-at"),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("createdAt");
		});

		test("returns malformed error when projectName is empty string", async () => {
			const dir = await writeRawMarker("empty-project-name", {
				version: 1,
				projectName: "",
				targetDir: join(targetDir, "empty-project-name"),
				createdAt: new Date().toISOString(),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("projectName");
		});

		test("returns malformed error when version is a string instead of number", async () => {
			const dir = await writeRawMarker("string-version", {
				version: "1",
				projectName: "test",
				targetDir: join(targetDir, "string-version"),
				createdAt: new Date().toISOString(),
			});

			const result = await expectTaskRight(readBootstrapState(dir));
			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("version");
		});
	});

	describe("unsupported version", () => {
		test("returns stale error for version higher than supported", async () => {
			const targetDir = await makeDir("unsupported-version-high");
			const rp1Dir = join(targetDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				markerFile(targetDir),
				JSON.stringify({
					version: 999,
					projectName: "test",
					targetDir,
					createdAt: new Date().toISOString(),
				}),
			);

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("stale");
			expect(result.error.message).toContain("999");
			expect(result.error.message).toContain(String(BOOTSTRAP_STATE_VERSION));
		});

		test("returns stale error for version 0", async () => {
			const targetDir = await makeDir("unsupported-version-zero");
			const rp1Dir = join(targetDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				markerFile(targetDir),
				JSON.stringify({
					version: 0,
					projectName: "test",
					targetDir,
					createdAt: new Date().toISOString(),
				}),
			);

			const result = await expectTaskRight(readBootstrapState(targetDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("stale");
		});
	});

	describe("wrong-location marker (conflicting)", () => {
		test("returns conflicting error when recorded targetDir does not match location", async () => {
			const originalDir = await makeDir("conflicting-original");
			const movedDir = await makeDir("conflicting-moved");
			const movedRp1Dir = join(movedDir, ".rp1");
			await mkdir(movedRp1Dir, { recursive: true });

			writeFileSync(
				markerFile(movedDir),
				JSON.stringify({
					version: BOOTSTRAP_STATE_VERSION,
					projectName: "test",
					targetDir: originalDir,
					createdAt: new Date().toISOString(),
				}),
			);

			const result = await expectTaskRight(readBootstrapState(movedDir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("conflicting");
			expect(result.error.message).toContain(originalDir);
			expect(result.error.message).toContain(movedDir);
		});

		test("accepts marker when paths are equivalent after resolution", async () => {
			const targetDir = await makeDir("conflicting-equiv");
			await expectTaskRight(
				writeBootstrapState({ projectName: "equiv-test", targetDir }),
			);

			const readPath = join(targetDir, ".", "subdir", "..");
			const result = await expectTaskRight(readBootstrapState(readPath));

			expect(result.valid).toBe(true);
		});
	});

	describe("atomicity", () => {
		test("temp file is cleaned up on successful write", async () => {
			const targetDir = await makeDir("atomic-success");
			await expectTaskRight(
				writeBootstrapState({ projectName: "atomic-test", targetDir }),
			);

			const rp1Dir = join(targetDir, ".rp1");
			const files = readdirSync(rp1Dir);
			expect(files).toEqual([BOOTSTRAP_STATE_FILENAME]);
		});

		test("overwrites existing marker atomically", async () => {
			const targetDir = await makeDir("atomic-overwrite");

			await expectTaskRight(
				writeBootstrapState({ projectName: "first-write", targetDir }),
			);
			const firstResult = await expectTaskRight(readBootstrapState(targetDir));
			expect(firstResult.valid).toBe(true);
			if (!firstResult.valid) return;
			expect(firstResult.state.projectName).toBe("first-write");

			await expectTaskRight(
				writeBootstrapState({ projectName: "second-write", targetDir }),
			);
			const secondResult = await expectTaskRight(readBootstrapState(targetDir));
			expect(secondResult.valid).toBe(true);
			if (!secondResult.valid) return;
			expect(secondResult.state.projectName).toBe("second-write");

			const rp1Dir = join(targetDir, ".rp1");
			const files = readdirSync(rp1Dir);
			const tempFiles = files.filter((f) => f.includes(".tmp"));
			expect(tempFiles).toHaveLength(0);
		});

		test("injected rename failure leaves pre-existing marker unchanged and no orphaned temp file", async () => {
			const targetDir = await makeDir("atomic-injected-failure");

			const firstWrite = await expectTaskRight(
				writeBootstrapState({ projectName: "before-failure", targetDir }),
			);

			const failingRename: typeof rename = () => {
				throw new Error("simulated rename failure");
			};

			const error = await expectTaskLeft(
				writeBootstrapState(
					{ projectName: "after-failure", targetDir },
					{ rename: failingRename, writeFile },
				),
			);

			expect(error._tag).toBe("RuntimeError");

			const readResult = await expectTaskRight(readBootstrapState(targetDir));
			expect(readResult.valid).toBe(true);
			if (!readResult.valid) return;
			expect(readResult.state).toEqual(firstWrite);

			const rp1Dir = join(targetDir, ".rp1");
			const files = readdirSync(rp1Dir);
			const tempFiles = files.filter((f) => f.includes(".tmp"));
			expect(tempFiles).toHaveLength(0);
		});
	});

	describe("filesystem safety (review H1)", () => {
		test("does not follow a symlink planted at the legacy temp path", async () => {
			const targetDir = await makeDir("h1-symlink-guard");
			await mkdir(join(targetDir, ".rp1"), { recursive: true });

			const victimDir = await makeDir("h1-victim");
			const victim = join(victimDir, "precious.txt");
			await writeFile(victim, "ORIGINAL");

			// Pre-plant a symlink at the OLD fixed temp path the vulnerable code used.
			const legacyTmp = join(
				targetDir,
				".rp1",
				`.${BOOTSTRAP_STATE_FILENAME}.tmp`,
			);
			await symlink(victim, legacyTmp);

			const state = await expectTaskRight(
				writeBootstrapState({ projectName: "safe-write", targetDir }),
			);
			expect(state.projectName).toBe("safe-write");

			// The marker is written at its canonical location...
			const read = await expectTaskRight(readBootstrapState(targetDir));
			expect(read.valid).toBe(true);

			// ...and the symlink victim is never touched.
			const after = await Bun.file(victim).text();
			expect(after).toBe("ORIGINAL");
		});

		test("writes the temp file with exclusive-create and owner-only mode", async () => {
			const targetDir = await makeDir("h1-flag-guard");

			let capturedFlag: unknown;
			let capturedMode: unknown;
			const recordingWriteFile = (async (
				path: Parameters<typeof writeFile>[0],
				data: Parameters<typeof writeFile>[1],
				options?: Parameters<typeof writeFile>[2],
			) => {
				if (options && typeof options === "object") {
					capturedFlag = (options as { flag?: unknown }).flag;
					capturedMode = (options as { mode?: unknown }).mode;
				} else {
					capturedFlag = options;
				}
				// Delegate to the real writeFile so the subsequent rename succeeds.
				return writeFile(path, data, options);
			}) as unknown as typeof writeFile;

			await expectTaskRight(
				writeBootstrapState(
					{ projectName: "flag-check", targetDir },
					{ rename, writeFile: recordingWriteFile },
				),
			);

			// O_EXCL (no-follow, no-truncate) + owner-only permissions.
			expect(capturedFlag).toBe("wx");
			expect(capturedMode).toBe(0o600);
		});
	});

	describe("path canonicalization and field domains (review M1)", () => {
		test("reads a marker through a symlinked target dir and returns the real canonical path", async () => {
			const realDir = await makeDir("m1-real-target");
			await expectTaskRight(
				writeBootstrapState({ projectName: "sym-proj", targetDir: realDir }),
			);

			const linkDir = join(tempBase, "m1-link-target");
			await symlink(realDir, linkDir);

			const result = await expectTaskRight(readBootstrapState(linkDir));

			expect(result.valid).toBe(true);
			if (!result.valid) return;
			// Physical resolution collapses the symlink to the real directory
			// rather than reporting a spurious conflict.
			expect(result.state.targetDir).toBe(realDir);
			expect(result.state.projectName).toBe("sym-proj");
		});

		test("reports conflicting when the recorded target dir no longer resolves", async () => {
			const dir = await makeDir("m1-vanished-record");
			const rp1Dir = join(dir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				join(rp1Dir, BOOTSTRAP_STATE_FILENAME),
				JSON.stringify({
					version: BOOTSTRAP_STATE_VERSION,
					projectName: "ghost",
					targetDir: join(tempBase, "m1-never-created"),
					createdAt: new Date().toISOString(),
				}),
			);

			const result = await expectTaskRight(readBootstrapState(dir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("conflicting");
		});

		test("rejects a marker whose projectName spans multiple lines", async () => {
			const dir = await makeDir("m1-multiline-name");
			const rp1Dir = join(dir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				join(rp1Dir, BOOTSTRAP_STATE_FILENAME),
				JSON.stringify({
					version: BOOTSTRAP_STATE_VERSION,
					projectName: "line-one\nline-two",
					targetDir: dir,
					createdAt: new Date().toISOString(),
				}),
			);

			const result = await expectTaskRight(readBootstrapState(dir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("projectName");
		});

		test("rejects a marker whose createdAt is not a parseable timestamp", async () => {
			const dir = await makeDir("m1-bad-createdat");
			const rp1Dir = join(dir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			writeFileSync(
				join(rp1Dir, BOOTSTRAP_STATE_FILENAME),
				JSON.stringify({
					version: BOOTSTRAP_STATE_VERSION,
					projectName: "bad-date",
					targetDir: dir,
					createdAt: "not-a-timestamp",
				}),
			);

			const result = await expectTaskRight(readBootstrapState(dir));

			expect(result.valid).toBe(false);
			if (result.valid) return;
			expect(result.error.type).toBe("malformed");
			expect(result.error.message).toContain("createdAt");
		});
	});
});
