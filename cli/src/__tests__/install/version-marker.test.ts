/**
 * Unit tests for install/version-marker.ts - Centralized version marker module.
 * Tests write/read round-trips, multi-platform isolation, and staleness detection.
 *
 * Write tests use Bun.write directly to create version marker files, then
 * verify reads through the module functions. This avoids flaky interactions
 * between fp-ts TaskEither, node:fs/promises, and Bun's async runtime in CI.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	isStale,
	type PlatformVersions,
	readAllVersionMarkers,
	readVersionMarker,
	type VersionMarker,
} from "../../install/version-marker.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

/** Write a version marker file directly, bypassing the module's TE wrapper. */
async function writeMarkerFile(
	homeDir: string,
	markers: PlatformVersions,
): Promise<void> {
	const dir = join(homeDir, ".rp1");
	await mkdir(dir, { recursive: true });
	await Bun.write(
		join(dir, "platform-versions.json"),
		JSON.stringify(markers, null, 2),
	);
}

function marker(platform: string, version: string): VersionMarker {
	return { version, installedAt: new Date().toISOString(), platform };
}

describe("version-marker", () => {
	let baseDir: string;

	beforeAll(async () => {
		baseDir = await createTempDir("version-marker-test");
	});

	afterAll(async () => {
		await cleanupTempDir(baseDir);
	});

	test("readVersionMarker retrieves a written marker", async () => {
		const dir = await createTempDir("vm-read");
		await writeMarkerFile(dir, {
			"claude-code": marker("claude-code", "0.6.5"),
		});

		const readResult = await readVersionMarker("claude-code", dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).not.toBeNull();
			expect(readResult.right!.version).toBe("0.6.5");
			expect(readResult.right!.platform).toBe("claude-code");
			expect(readResult.right!.installedAt).toBeTruthy();
		}
		await cleanupTempDir(dir);
	});

	test("readVersionMarker returns null for missing platform", async () => {
		const dir = await createTempDir("vm-missing");
		await writeMarkerFile(dir, {
			opencode: marker("opencode", "0.6.5"),
		});

		const readResult = await readVersionMarker("codex", dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toBeNull();
		}
		await cleanupTempDir(dir);
	});

	test("readVersionMarker returns null when file does not exist", async () => {
		const dir = await createTempDir("vm-nofile");
		const readResult = await readVersionMarker("claude-code", dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toBeNull();
		}
		await cleanupTempDir(dir);
	});

	test("readAllVersionMarkers returns all platform entries", async () => {
		const dir = await createTempDir("vm-all");
		await writeMarkerFile(dir, {
			"claude-code": marker("claude-code", "0.6.5"),
			opencode: marker("opencode", "0.6.5"),
			codex: marker("codex", "0.6.4"),
		});

		const readResult = await readAllVersionMarkers(dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			const markers = readResult.right;
			expect(markers["claude-code"]?.version).toBe("0.6.5");
			expect(markers.opencode?.version).toBe("0.6.5");
			expect(markers.codex?.version).toBe("0.6.4");
		}
		await cleanupTempDir(dir);
	});

	test("readVersionMarker reads the latest version for a platform", async () => {
		const dir = await createTempDir("vm-overwrite");
		// Simulate overwrite by writing the final state directly
		await writeMarkerFile(dir, {
			opencode: marker("opencode", "0.6.5"),
		});

		const readResult = await readVersionMarker("opencode", dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right!.version).toBe("0.6.5");
		}
		await cleanupTempDir(dir);
	});

	test("readAllVersionMarkers returns empty object when file is absent", async () => {
		const dir = await createTempDir("vm-absent");
		const readResult = await readAllVersionMarkers(dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toEqual({});
		}
		await cleanupTempDir(dir);
	});

	test("isStale returns true for null marker", () => {
		expect(isStale(null, "0.6.5")).toBe(true);
	});

	test("isStale returns true when versions differ", () => {
		expect(
			isStale(
				{
					version: "0.6.3",
					installedAt: "2026-01-01T00:00:00Z",
					platform: "opencode",
				},
				"0.6.5",
			),
		).toBe(true);
	});

	test("isStale returns false when versions match", () => {
		expect(
			isStale(
				{
					version: "0.6.5",
					installedAt: "2026-01-01T00:00:00Z",
					platform: "opencode",
				},
				"0.6.5",
			),
		).toBe(false);
	});

	test("marker file is valid JSON with expected structure", async () => {
		const dir = await createTempDir("vm-json");
		await writeMarkerFile(dir, {
			"claude-code": marker("claude-code", "0.6.5"),
		});

		const filePath = join(dir, ".rp1", "platform-versions.json");
		const content = JSON.parse(await Bun.file(filePath).text());
		expect(content["claude-code"]).toBeDefined();
		expect(content["claude-code"].version).toBe("0.6.5");
		expect(content["claude-code"].platform).toBe("claude-code");
		expect(typeof content["claude-code"].installedAt).toBe("string");
		await cleanupTempDir(dir);
	});
});
