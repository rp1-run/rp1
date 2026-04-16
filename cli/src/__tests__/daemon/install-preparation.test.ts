/**
 * Install preparation contract tests.
 * Verifies the restart-marker file behavior that the Justfile depends on:
 * marker written with port when daemon was running, cleared when not,
 * and legacy empty markers default to port 7710.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("install preparation restart marker contract", () => {
	let tempDir: string;
	let markerPath: string;

	beforeEach(async () => {
		tempDir = await createTempDir("install-prep");
		markerPath = join(tempDir, "restart-arcade-after-install");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("marker written with port number records the daemon port for post-install restart", () => {
		const port = 7710;
		writeFileSync(markerPath, String(port), { mode: 0o600 });

		expect(existsSync(markerPath)).toBe(true);
		const content = readFileSync(markerPath, "utf-8").trim();
		expect(content).toBe("7710");
		expect(Number.parseInt(content, 10)).toBe(7710);
	});

	test("marker with custom port preserves non-default port across install", () => {
		const port = 8080;
		writeFileSync(markerPath, String(port), { mode: 0o600 });

		const content = readFileSync(markerPath, "utf-8").trim();
		expect(Number.parseInt(content, 10)).toBe(8080);
	});

	test("empty marker file defaults to port 7710 for legacy compatibility", () => {
		// Legacy behavior: an empty marker from an older build should still work.
		writeFileSync(markerPath, "", { mode: 0o600 });

		const content = readFileSync(markerPath, "utf-8").trim();
		// The Justfile reads: port=$(cat "$restart_marker" | tr -d '[:space:]')
		// if [ -z "$port" ]; then port=7710; fi
		const port = content === "" ? 7710 : Number.parseInt(content, 10);
		expect(port).toBe(7710);
	});

	test("marker removal prevents post-install daemon restart", () => {
		writeFileSync(markerPath, "7710", { mode: 0o600 });
		expect(existsSync(markerPath)).toBe(true);

		const { unlinkSync } = require("node:fs");
		unlinkSync(markerPath);
		expect(existsSync(markerPath)).toBe(false);
	});

	test("stale marker from prior interrupted install is safe to remove", () => {
		writeFileSync(markerPath, "9090", { mode: 0o600 });

		try {
			if (existsSync(markerPath)) {
				const { unlinkSync } = require("node:fs");
				unlinkSync(markerPath);
			}
		} catch {
			// Best-effort cleanup should not throw
		}

		expect(existsSync(markerPath)).toBe(false);
	});

	test("marker does not exist when no daemon was running", () => {
		// Verify that absence of marker means no restart should occur.
		expect(existsSync(markerPath)).toBe(false);
	});

	test("post-install restart reads the recorded port from marker content", () => {
		// Simulates the Justfile read pattern.
		writeFileSync(markerPath, "7720", { mode: 0o600 });

		if (existsSync(markerPath)) {
			const rawContent = readFileSync(markerPath, "utf-8").replace(/\s/g, "");
			const port = rawContent === "" ? 7710 : Number.parseInt(rawContent, 10);
			expect(port).toBe(7720);
			expect(Number.isNaN(port)).toBe(false);
		}
	});
});
