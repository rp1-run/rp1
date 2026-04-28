/**
 * Unit tests for install/version-marker.ts - Centralized version marker module.
 * Tests direct write/read round-trips, multi-platform isolation, and staleness detection.
 *
 * Most read-path tests seed JSON directly to keep fixtures compact. Dedicated
 * write-path tests below exercise writeVersionMarker(..., homeOverride)
 * end-to-end so merge and overwrite regressions fail coverage.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
	PlatformVersions,
	VersionMarker,
} from "../../install/version-marker.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

type VersionMarkerModule = typeof import("../../install/version-marker.js");

const {
	isStale,
	readAllVersionMarkers,
	readVersionMarker,
	writeVersionMarker,
} = (await import(
	`../../install/version-marker.js?version-marker-test=${Date.now()}`
)) as VersionMarkerModule;

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

	test("writeVersionMarker writes to the overridden home directory", async () => {
		const dir = await createTempDir("vm-write-override");

		const writeResult = await writeVersionMarker("codex", "0.7.0", dir)();
		expect(writeResult._tag).toBe("Right");

		const filePath = join(dir, ".rp1", "platform-versions.json");
		const content = JSON.parse(
			await Bun.file(filePath).text(),
		) as PlatformVersions;
		expect(content.codex).toBeDefined();
		expect(content.codex?.version).toBe("0.7.0");
		expect(content.codex?.platform).toBe("codex");
		expect(typeof content.codex?.installedAt).toBe("string");

		await cleanupTempDir(dir);
	});

	test("writeVersionMarker merges with existing platform entries", async () => {
		const dir = await createTempDir("vm-write-merge");
		await writeMarkerFile(dir, {
			"claude-code": marker("claude-code", "0.6.5"),
		});

		const writeResult = await writeVersionMarker("opencode", "0.7.0", dir)();
		expect(writeResult._tag).toBe("Right");

		const readResult = await readAllVersionMarkers(dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right["claude-code"]?.version).toBe("0.6.5");
			expect(readResult.right.opencode?.version).toBe("0.7.0");
			expect(readResult.right.opencode?.platform).toBe("opencode");
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

	test("writeVersionMarker overwrites an existing platform entry while preserving others", async () => {
		const dir = await createTempDir("vm-write-overwrite");
		const oldInstalledAt = "2026-01-01T00:00:00.000Z";
		await writeMarkerFile(dir, {
			opencode: {
				version: "0.6.4",
				installedAt: oldInstalledAt,
				platform: "opencode",
			},
			codex: marker("codex", "0.6.5"),
		});

		const writeResult = await writeVersionMarker("opencode", "0.7.1", dir)();
		expect(writeResult._tag).toBe("Right");

		const readResult = await readAllVersionMarkers(dir)();
		expect(readResult._tag).toBe("Right");
		if (readResult._tag === "Right") {
			expect(readResult.right.opencode?.version).toBe("0.7.1");
			expect(readResult.right.opencode?.platform).toBe("opencode");
			expect(readResult.right.opencode?.installedAt).not.toBe(oldInstalledAt);
			expect(readResult.right.codex?.version).toBe("0.6.5");
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
