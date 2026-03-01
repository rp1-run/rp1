/**
 * Unit tests for manifest.ts - Attestation manifest operations.
 * Tests emptyManifest, updateManifest, and round-trip serialization.
 */

import { describe, expect, test } from "bun:test";
import { emptyManifest, updateManifest } from "../manifest.js";
import type {
	AttestationManifest,
	HashResult,
	SkillAttestation,
} from "../types.js";

describe("manifest", () => {
	describe("emptyManifest", () => {
		test("returns valid structure with schema_version 1.0.0", () => {
			const manifest = emptyManifest();

			expect(manifest.schema_version).toBe("1.0.0");
		});

		test("returns empty skills object", () => {
			const manifest = emptyManifest();

			expect(manifest.skills).toEqual({});
			expect(Object.keys(manifest.skills)).toHaveLength(0);
		});

		test("returns empty files object", () => {
			const manifest = emptyManifest();

			expect(manifest.files).toEqual({});
			expect(Object.keys(manifest.files)).toHaveLength(0);
		});

		test("returns all required fields", () => {
			const manifest = emptyManifest();

			expect(manifest).toHaveProperty("schema_version");
			expect(manifest).toHaveProperty("skills");
			expect(manifest).toHaveProperty("files");
		});

		test("returns consistent structure on multiple calls", () => {
			const manifest1 = emptyManifest();
			const manifest2 = emptyManifest();

			expect(manifest1).toEqual(manifest2);
		});
	});

	describe("updateManifest", () => {
		const sampleAttestation: SkillAttestation = {
			prompt_hash: "sha256:abc123",
			deps_hash: "sha256:def456",
			version: "1.0.0",
			last_eval: {
				passed: true,
				timestamp: "2026-01-18T12:00:00Z",
				git_commit: "abc1234",
				result_file: "output/test-result.json",
			},
		};

		const sampleHashes: readonly HashResult[] = [
			{
				path: "plugins/dev/skills/build-fast/SKILL.md",
				hash: "sha256:abc123",
				content_length: 1000,
			},
			{
				path: "plugins/dev/agents/fast-builder.md",
				hash: "sha256:xyz789",
				content_length: 2000,
			},
		];

		test("adds new skill attestation to empty manifest", () => {
			const manifest = emptyManifest();
			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.skills["rp1-dev:build-fast"]).toEqual(sampleAttestation);
		});

		test("preserves existing skills when adding new one", () => {
			const existingAttestation: SkillAttestation = {
				prompt_hash: "sha256:existing",
				deps_hash: "sha256:existing-deps",
				version: "0.9.0",
				last_eval: {
					passed: true,
					timestamp: "2026-01-17T12:00:00Z",
					git_commit: "prev123",
					result_file: "output/prev-result.json",
				},
			};

			const manifest: AttestationManifest = {
				schema_version: "1.0.0",
				skills: { "rp1-dev:existing-skill": existingAttestation },
				files: {
					"plugins/dev/skills/existing/SKILL.md": "sha256:old",
				},
			};

			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.skills["rp1-dev:existing-skill"]).toEqual(
				existingAttestation,
			);
			expect(updated.skills["rp1-dev:build-fast"]).toEqual(sampleAttestation);
			expect(Object.keys(updated.skills)).toHaveLength(2);
		});

		test("updates existing skill attestation", () => {
			const oldAttestation: SkillAttestation = {
				prompt_hash: "sha256:old",
				deps_hash: "sha256:old-deps",
				version: "0.9.0",
				last_eval: {
					passed: false,
					timestamp: "2026-01-17T12:00:00Z",
					git_commit: "old123",
					result_file: "output/old-result.json",
				},
			};

			const manifest: AttestationManifest = {
				schema_version: "1.0.0",
				skills: { "rp1-dev:build-fast": oldAttestation },
				files: {},
			};

			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.skills["rp1-dev:build-fast"]).toEqual(sampleAttestation);
			expect(updated.skills["rp1-dev:build-fast"]).not.toEqual(oldAttestation);
		});

		test("adds file hashes to manifest", () => {
			const manifest = emptyManifest();
			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.files["plugins/dev/skills/build-fast/SKILL.md"]).toBe(
				"sha256:abc123",
			);
			expect(updated.files["plugins/dev/agents/fast-builder.md"]).toBe(
				"sha256:xyz789",
			);
		});

		test("preserves existing file hashes when adding new ones", () => {
			const manifest: AttestationManifest = {
				schema_version: "1.0.0",
				skills: {},
				files: {
					"plugins/base/skills/existing/SKILL.md": "sha256:preserved",
				},
			};

			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.files["plugins/base/skills/existing/SKILL.md"]).toBe(
				"sha256:preserved",
			);
			expect(updated.files["plugins/dev/skills/build-fast/SKILL.md"]).toBe(
				"sha256:abc123",
			);
		});

		test("updates existing file hash with new value", () => {
			const manifest: AttestationManifest = {
				schema_version: "1.0.0",
				skills: {},
				files: {
					"plugins/dev/skills/build-fast/SKILL.md": "sha256:old-hash",
				},
			};

			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.files["plugins/dev/skills/build-fast/SKILL.md"]).toBe(
				"sha256:abc123",
			);
		});

		test("preserves schema_version from original manifest", () => {
			const manifest = emptyManifest();
			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated.schema_version).toBe("1.0.0");
		});

		test("returns new object (immutable update)", () => {
			const manifest = emptyManifest();
			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				sampleHashes,
			);

			expect(updated).not.toBe(manifest);
			expect(updated.skills).not.toBe(manifest.skills);
			expect(updated.files).not.toBe(manifest.files);
		});

		test("handles empty file hashes array", () => {
			const manifest = emptyManifest();
			const updated = updateManifest(
				manifest,
				"rp1-dev:build-fast",
				sampleAttestation,
				[],
			);

			expect(updated.skills["rp1-dev:build-fast"]).toEqual(sampleAttestation);
			expect(Object.keys(updated.files)).toHaveLength(0);
		});
	});

	describe("round-trip serialization", () => {
		test("JSON serialization preserves manifest structure", () => {
			const original: AttestationManifest = {
				schema_version: "1.0.0",
				skills: {
					"rp1-dev:build-fast": {
						prompt_hash: "sha256:abc123",
						deps_hash: "sha256:def456",
						version: "1.0.0",
						last_eval: {
							passed: true,
							timestamp: "2026-01-18T12:00:00Z",
							git_commit: "abc1234",
							result_file: "output/test-result.json",
						},
					},
				},
				files: {
					"plugins/dev/skills/build-fast/SKILL.md": "sha256:abc123",
					"plugins/dev/agents/fast-builder.md": "sha256:xyz789",
				},
			};

			const serialized = JSON.stringify(original, null, 2);
			const deserialized = JSON.parse(serialized) as AttestationManifest;

			expect(deserialized).toEqual(original);
		});

		test("JSON serialization preserves empty manifest", () => {
			const original = emptyManifest();

			const serialized = JSON.stringify(original, null, 2);
			const deserialized = JSON.parse(serialized) as AttestationManifest;

			expect(deserialized).toEqual(original);
		});

		test("JSON serialization preserves updated manifest", () => {
			const attestation: SkillAttestation = {
				prompt_hash: "sha256:test",
				deps_hash: "sha256:deps",
				version: "2.0.0",
				last_eval: {
					passed: true,
					timestamp: "2026-01-18T15:30:00Z",
					git_commit: "commit123",
					result_file: "output/result.json",
				},
			};

			const hashes: readonly HashResult[] = [
				{
					path: "path/to/file.md",
					hash: "sha256:filehash",
					content_length: 500,
				},
			];

			const original = updateManifest(
				emptyManifest(),
				"test:skill",
				attestation,
				hashes,
			);

			const serialized = JSON.stringify(original, null, 2);
			const deserialized = JSON.parse(serialized) as AttestationManifest;

			expect(deserialized).toEqual(original);
			expect(deserialized.skills["test:skill"]).toEqual(attestation);
			expect(deserialized.files["path/to/file.md"]).toBe("sha256:filehash");
		});

		test("multiple updates followed by serialization preserves all data", () => {
			let manifest = emptyManifest();

			const attestation1: SkillAttestation = {
				prompt_hash: "sha256:first",
				deps_hash: "sha256:first-deps",
				version: "1.0.0",
				last_eval: {
					passed: true,
					timestamp: "2026-01-18T10:00:00Z",
					git_commit: "commit1",
					result_file: "output/first.json",
				},
			};

			const attestation2: SkillAttestation = {
				prompt_hash: "sha256:second",
				deps_hash: "sha256:second-deps",
				version: "1.1.0",
				last_eval: {
					passed: true,
					timestamp: "2026-01-18T11:00:00Z",
					git_commit: "commit2",
					result_file: "output/second.json",
				},
			};

			manifest = updateManifest(manifest, "rp1-dev:skill-one", attestation1, [
				{ path: "file1.md", hash: "sha256:hash1", content_length: 100 },
			]);

			manifest = updateManifest(manifest, "rp1-dev:skill-two", attestation2, [
				{ path: "file2.md", hash: "sha256:hash2", content_length: 200 },
			]);

			const serialized = JSON.stringify(manifest, null, 2);
			const deserialized = JSON.parse(serialized) as AttestationManifest;

			expect(deserialized.skills["rp1-dev:skill-one"]).toEqual(attestation1);
			expect(deserialized.skills["rp1-dev:skill-two"]).toEqual(attestation2);
			expect(deserialized.files["file1.md"]).toBe("sha256:hash1");
			expect(deserialized.files["file2.md"]).toBe("sha256:hash2");
		});
	});
});
