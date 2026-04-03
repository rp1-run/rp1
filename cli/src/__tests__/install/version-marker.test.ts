/**
 * Unit tests for install/version-marker.ts - Centralized version marker module.
 * Tests write/read round-trips, multi-platform isolation, and staleness detection.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	isStale,
	readAllVersionMarkers,
	readVersionMarker,
	writeVersionMarker,
} from "../../install/version-marker.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("version-marker", () => {
	let tempDir: string;
	let origHome: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("version-marker-test");
		origHome = process.env.HOME;
		process.env.HOME = tempDir;
	});

	afterEach(async () => {
		process.env.HOME = origHome;
		await cleanupTempDir(tempDir);
	});

	test("writeVersionMarker creates file and readVersionMarker retrieves it", async () => {
		const writeResult = await writeVersionMarker("claude-code", "0.6.5")();
		expect(writeResult._tag).toBe("Right");

		const readResult = await readVersionMarker("claude-code")();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			const marker = readResult.right;
			expect(marker).not.toBeNull();
			expect(marker!.version).toBe("0.6.5");
			expect(marker!.platform).toBe("claude-code");
			expect(marker!.installedAt).toBeTruthy();
		}
	});

	test("readVersionMarker returns null for missing platform", async () => {
		await writeVersionMarker("opencode", "0.6.5")();

		const readResult = await readVersionMarker("codex")();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toBeNull();
		}
	});

	test("readVersionMarker returns null when file does not exist", async () => {
		const readResult = await readVersionMarker("claude-code")();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toBeNull();
		}
	});

	test("writeVersionMarker preserves other platform entries", async () => {
		await writeVersionMarker("claude-code", "0.6.5")();
		await writeVersionMarker("opencode", "0.6.5")();
		await writeVersionMarker("codex", "0.6.4")();

		const readResult = await readAllVersionMarkers()();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			const markers = readResult.right;
			expect(markers["claude-code"]?.version).toBe("0.6.5");
			expect(markers.opencode?.version).toBe("0.6.5");
			expect(markers.codex?.version).toBe("0.6.4");
		}
	});

	test("writeVersionMarker overwrites existing entry for same platform", async () => {
		await writeVersionMarker("opencode", "0.6.3")();
		await writeVersionMarker("opencode", "0.6.5")();

		const readResult = await readVersionMarker("opencode")();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right!.version).toBe("0.6.5");
		}
	});

	test("readAllVersionMarkers returns empty object when file is absent", async () => {
		const readResult = await readAllVersionMarkers()();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right).toEqual({});
		}
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

	test("written file is valid JSON with expected structure", async () => {
		await writeVersionMarker("claude-code", "0.6.5")();

		const filePath = join(tempDir, ".rp1", "platform-versions.json");
		const content = JSON.parse(await readFile(filePath, "utf-8"));
		expect(content["claude-code"]).toBeDefined();
		expect(content["claude-code"].version).toBe("0.6.5");
		expect(content["claude-code"].platform).toBe("claude-code");
		expect(typeof content["claude-code"].installedAt).toBe("string");
	});
});
