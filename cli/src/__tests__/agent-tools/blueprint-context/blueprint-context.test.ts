import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type BlueprintContextWriteDeps,
	deleteBlueprintContext,
	readBlueprintContext,
	writeBlueprintContext,
} from "../../../agent-tools/blueprint-context/operations.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("blueprint-context operations", () => {
	let tempBase: string;

	beforeAll(async () => {
		const tempDir = join(tmpdir(), `blueprint-context-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);
	});

	afterAll(async () => {
		await rm(tempBase, { recursive: true, force: true });
	});

	// A fresh work root per test. Some tests use a root path containing spaces to
	// exercise central-storage locations (review M3).
	const makeWorkRoot = async (name: string): Promise<string> => {
		const dir = join(tempBase, name);
		await mkdir(dir, { recursive: true });
		return dir;
	};

	describe("round-trip fidelity", () => {
		test("preserves arbitrary shell-significant content byte-for-byte", async () => {
			const workRoot = await makeWorkRoot("roundtrip");
			const content = [
				"line one",
				"a \"double\" and 'single' quote",
				"command-looking: $(rm -rf /) and `whoami` and $HOME",
				"embedded delimiter: --- and EOF and }",
				"trailing spaces   ",
				"", // blank line
				"unicode: café — 日本語 — 🎮",
			].join("\n");

			await expectTaskRight(
				writeBlueprintContext({ key: "prd-alpha", content, workRoot }),
			);
			const read = await expectTaskRight(
				readBlueprintContext(workRoot, "prd-alpha"),
			);

			expect(read.found).toBe(true);
			if (read.found && read.valid) {
				expect(read.content).toBe(content);
			} else {
				throw new Error("expected a valid round-trip read");
			}
		});

		test("stores central-storage work roots containing spaces", async () => {
			const workRoot = await makeWorkRoot("central store with spaces");
			await expectTaskRight(
				writeBlueprintContext({
					key: "prd-spaces",
					content: "context under a spaced root",
					workRoot,
				}),
			);
			const read = await expectTaskRight(
				readBlueprintContext(workRoot, "prd-spaces"),
			);
			expect(read.found && read.valid).toBe(true);
		});

		test("overwrites an existing payload on rewrite", async () => {
			const workRoot = await makeWorkRoot("rewrite");
			await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "first", workRoot }),
			);
			await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "second", workRoot }),
			);
			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			if (read.found && read.valid) {
				expect(read.content).toBe("second");
			} else {
				throw new Error("expected a valid read after rewrite");
			}
		});
	});

	describe("owner-only permissions and boundary", () => {
		test("writes the sidecar with 0600 permissions", async () => {
			const workRoot = await makeWorkRoot("perms");
			const result = await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "x", workRoot }),
			);
			const stat = await lstat(result.path);
			expect(stat.mode & 0o777).toBe(0o600);
		});

		test("stores the sidecar directly under {workRoot}/blueprint/context", async () => {
			const workRoot = await makeWorkRoot("layout");
			const result = await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "x", workRoot }),
			);
			const expected = join(
				await realpath(workRoot),
				"blueprint",
				"context",
				"prd.json",
			);
			expect(result.path).toBe(expected);
		});

		test("refuses to write through a symlinked destination leaf", async () => {
			const workRoot = await makeWorkRoot("symlink-leaf");
			const contextDir = join(workRoot, "blueprint", "context");
			await mkdir(contextDir, { recursive: true });
			// Plant an external file and point the destination leaf at it.
			const external = join(workRoot, "external.json");
			await writeFile(external, '{"pre":"external"}');
			await symlink(external, join(contextDir, "prd.json"));

			const error = await expectTaskLeft(
				writeBlueprintContext({ key: "prd", content: "evil", workRoot }),
			);
			expect(error._tag).toBe("RuntimeError");
			if (error._tag === "RuntimeError") {
				expect(error.message).toContain("symlink");
			}
			// The external file must be untouched.
			expect(await readFile(external, "utf-8")).toBe('{"pre":"external"}');
		});

		test("read refuses to follow a symlinked leaf, reporting invalid", async () => {
			const workRoot = await makeWorkRoot("symlink-read");
			const contextDir = join(workRoot, "blueprint", "context");
			await mkdir(contextDir, { recursive: true });
			const external = join(workRoot, "external.json");
			await writeFile(
				external,
				JSON.stringify({ version: 1, key: "prd", content: "external" }),
			);
			await symlink(external, join(contextDir, "prd.json"));

			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			expect(read.found).toBe(true);
			expect(read.found && read.valid === false).toBe(true);
		});
	});

	// Round-9 adversarial finding: a symlinked `context` (or `blueprint`) store
	// COMPONENT must not redirect the sidecar outside the work tree. Guarding only
	// the leaf leaves write as an arbitrary-location write primitive, read pulling
	// foreign content back as authoritative, and delete unlinking a foreign file.
	describe("directory-symlink store boundary (review M3, round-9)", () => {
		test("write refuses a symlinked context directory and creates nothing outside", async () => {
			const workRoot = await makeWorkRoot("dir-symlink-write");
			const outside = join(tempBase, "outside-store-write");
			await mkdir(join(workRoot, "blueprint"), { recursive: true });
			await mkdir(outside, { recursive: true });
			await symlink(outside, join(workRoot, "blueprint", "context"));

			const error = await expectTaskLeft(
				writeBlueprintContext({ key: "main", content: "escaped", workRoot }),
			);
			expect(error._tag).toBe("RuntimeError");
			if (error._tag === "RuntimeError") {
				expect(error.message).toContain("symlink");
			}
			// Nothing may have been written into the external directory.
			expect(await readdir(outside)).toEqual([]);
		});

		test("read refuses a symlinked context directory, never trusting foreign content", async () => {
			const workRoot = await makeWorkRoot("dir-symlink-read");
			const outside = join(tempBase, "outside-store-read");
			await mkdir(join(workRoot, "blueprint"), { recursive: true });
			await mkdir(outside, { recursive: true });
			// A structurally valid foreign payload the reader must NOT trust.
			await writeFile(
				join(outside, "main.json"),
				JSON.stringify({ version: 1, key: "main", content: "foreign" }),
			);
			await symlink(outside, join(workRoot, "blueprint", "context"));

			const read = await expectTaskRight(
				readBlueprintContext(workRoot, "main"),
			);
			expect(read.found).toBe(true);
			expect(read.found && read.valid === false).toBe(true);
		});

		test("delete refuses a symlinked context directory, leaving foreign files intact", async () => {
			const workRoot = await makeWorkRoot("dir-symlink-delete");
			const outside = join(tempBase, "outside-store-delete");
			await mkdir(join(workRoot, "blueprint"), { recursive: true });
			await mkdir(outside, { recursive: true });
			const victim = join(outside, "main.json");
			await writeFile(victim, "victim");
			await symlink(outside, join(workRoot, "blueprint", "context"));

			const error = await expectTaskLeft(
				deleteBlueprintContext(workRoot, "main"),
			);
			expect(error._tag).toBe("RuntimeError");
			if (error._tag === "RuntimeError") {
				expect(error.message).toContain("symlink");
			}
			// The foreign file must survive.
			expect(await readFile(victim, "utf-8")).toBe("victim");
		});

		test("allows a symlinked work root itself (central storage) to round-trip", async () => {
			const realStore = await makeWorkRoot("central-real-store");
			const linkRoot = join(tempBase, "central-link");
			await symlink(realStore, linkRoot);

			await expectTaskRight(
				writeBlueprintContext({
					key: "main",
					content: "central-ok",
					workRoot: linkRoot,
				}),
			);
			const read = await expectTaskRight(
				readBlueprintContext(linkRoot, "main"),
			);
			expect(read.found && read.valid && read.content).toBe("central-ok");
		});
	});

	describe("key validation (review M2, M3)", () => {
		const badKeys: ReadonlyArray<[string, string]> = [
			["traversal", "../escape"],
			["nested-traversal", "a/../../b"],
			["forward-slash", "a/b"],
			["back-slash", "a\\b"],
			["whitespace", "has space"],
			["leading-dot", ".hidden"],
			["glob-star", "prd*"],
			["glob-bracket", "prd[1]"],
			["command-sub", "prd$(whoami)"],
			["newline", "line1\nline2"],
			["empty", ""],
		];

		for (const [label, key] of badKeys) {
			test(`write rejects unsafe key: ${label}`, async () => {
				const workRoot = await makeWorkRoot(`badkey-write-${label}`);
				const error = await expectTaskLeft(
					writeBlueprintContext({ key, content: "x", workRoot }),
				);
				expect(error._tag).toBe("UsageError");
			});

			test(`read rejects unsafe key: ${label}`, async () => {
				const workRoot = await makeWorkRoot(`badkey-read-${label}`);
				const error = await expectTaskLeft(readBlueprintContext(workRoot, key));
				expect(error._tag).toBe("UsageError");
			});

			test(`delete rejects unsafe key: ${label}`, async () => {
				const workRoot = await makeWorkRoot(`badkey-del-${label}`);
				const error = await expectTaskLeft(
					deleteBlueprintContext(workRoot, key),
				);
				expect(error._tag).toBe("UsageError");
			});
		}

		test("accepts documented safe keys (slug, digits, underscore, hyphen)", async () => {
			const workRoot = await makeWorkRoot("goodkeys");
			for (const key of ["prd", "payments-v2", "my_product_prd", "A1", "x"]) {
				await expectTaskRight(
					writeBlueprintContext({ key, content: "ok", workRoot }),
				);
			}
		});
	});

	describe("read classification", () => {
		test("missing sidecar returns found=false, not an error", async () => {
			const workRoot = await makeWorkRoot("missing");
			const read = await expectTaskRight(
				readBlueprintContext(workRoot, "absent"),
			);
			expect(read.found).toBe(false);
		});

		test("a truncated (invalid JSON) sidecar returns valid=false", async () => {
			const workRoot = await makeWorkRoot("truncated");
			const contextDir = join(workRoot, "blueprint", "context");
			await mkdir(contextDir, { recursive: true });
			// Simulate a partial write that somehow reached the destination.
			await writeFile(
				join(contextDir, "prd.json"),
				'{"version":1,"key":"prd","con',
			);

			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			expect(read.found).toBe(true);
			expect(read.found && read.valid === false).toBe(true);
		});

		test("a wrong-version sidecar returns valid=false", async () => {
			const workRoot = await makeWorkRoot("version");
			const contextDir = join(workRoot, "blueprint", "context");
			await mkdir(contextDir, { recursive: true });
			await writeFile(
				join(contextDir, "prd.json"),
				JSON.stringify({ version: 999, key: "prd", content: "x" }),
			);

			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			expect(read.found && read.valid === false).toBe(true);
		});

		test("a key-mismatched sidecar returns valid=false", async () => {
			const workRoot = await makeWorkRoot("keymismatch");
			const contextDir = join(workRoot, "blueprint", "context");
			await mkdir(contextDir, { recursive: true });
			await writeFile(
				join(contextDir, "prd.json"),
				JSON.stringify({ version: 1, key: "other", content: "x" }),
			);

			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			expect(read.found && read.valid === false).toBe(true);
		});
	});

	describe("delete idempotency", () => {
		test("delete removes an existing sidecar then reports deleted=false", async () => {
			const workRoot = await makeWorkRoot("delete");
			await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "x", workRoot }),
			);

			const first = await expectTaskRight(
				deleteBlueprintContext(workRoot, "prd"),
			);
			expect(first.deleted).toBe(true);

			const second = await expectTaskRight(
				deleteBlueprintContext(workRoot, "prd"),
			);
			expect(second.deleted).toBe(false);
		});
	});

	describe("interrupted write leaves no partial or foreign destination (review M3)", () => {
		const contextDirFor = (workRoot: string): string =>
			join(workRoot, "blueprint", "context");

		const tempLeftovers = async (workRoot: string): Promise<string[]> => {
			try {
				return (await readdir(contextDirFor(workRoot))).filter((n) =>
					n.endsWith(".tmp"),
				);
			} catch {
				return [];
			}
		};

		test("a rename failure (crash mid-commit) leaves no destination and no temp litter", async () => {
			const workRoot = await makeWorkRoot("interrupt-rename");
			const failingDeps: BlueprintContextWriteDeps = {
				writeFile: (async (...args: Parameters<typeof writeFile>) => {
					await writeFile(...args);
				}) as typeof writeFile,
				rename: (async () => {
					throw new Error("simulated crash before rename completes");
				}) as typeof import("node:fs/promises").rename,
			};

			const error = await expectTaskLeft(
				writeBlueprintContext(
					{ key: "prd", content: "partial", workRoot },
					failingDeps,
				),
			);
			expect(error._tag).toBe("RuntimeError");

			// No destination file was published...
			const destExists = await lstat(
				join(await realpath(contextDirFor(workRoot)), "prd.json"),
			)
				.then(() => true)
				.catch(() => false);
			expect(destExists).toBe(false);
			// ...and the temp file was cleaned up.
			expect(await tempLeftovers(workRoot)).toHaveLength(0);
		});

		test("a writeFile failure leaves no destination", async () => {
			const workRoot = await makeWorkRoot("interrupt-write");
			const failingDeps: BlueprintContextWriteDeps = {
				writeFile: (async () => {
					throw new Error("simulated write failure");
				}) as typeof writeFile,
				rename: (async () => {
					throw new Error("rename must not be reached");
				}) as typeof import("node:fs/promises").rename,
			};

			await expectTaskLeft(
				writeBlueprintContext(
					{ key: "prd", content: "x", workRoot },
					failingDeps,
				),
			);

			const destExists = await lstat(
				join(await realpath(contextDirFor(workRoot)), "prd.json"),
			)
				.then(() => true)
				.catch(() => false);
			expect(destExists).toBe(false);
			expect(await tempLeftovers(workRoot)).toHaveLength(0);
		});

		test("a failed write does not corrupt a previously committed payload", async () => {
			const workRoot = await makeWorkRoot("interrupt-preserve");
			await expectTaskRight(
				writeBlueprintContext({ key: "prd", content: "committed", workRoot }),
			);

			const failingDeps: BlueprintContextWriteDeps = {
				writeFile: (async (...args: Parameters<typeof writeFile>) => {
					await writeFile(...args);
				}) as typeof writeFile,
				rename: (async () => {
					throw new Error("simulated crash before rename completes");
				}) as typeof import("node:fs/promises").rename,
			};

			await expectTaskLeft(
				writeBlueprintContext(
					{ key: "prd", content: "overwrite-attempt", workRoot },
					failingDeps,
				),
			);

			// The original payload is intact.
			const read = await expectTaskRight(readBlueprintContext(workRoot, "prd"));
			if (read.found && read.valid) {
				expect(read.content).toBe("committed");
			} else {
				throw new Error("expected the prior payload to survive");
			}
		});
	});
});
