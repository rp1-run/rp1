import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, summarizeResults, verifySkill } from "../commands.js";
import { buildDependencyGraph } from "../deps-graph.js";
import { emptyManifest, updateManifest } from "../manifest.js";
import { computeDepsHash, computePromptHash } from "../prompt-hash.js";
import type { AttestationManifest, SkillAttestation } from "../types.js";

const originalCwd = process.cwd();
const tempDirs: string[] = [];

const attestation: SkillAttestation = {
	platform: "claude-code",
	prompt_hash: "sha256:prompt",
	deps_hash: "sha256:old",
	version: "1.0.0",
	last_eval: {
		passed: true,
		timestamp: "2026-01-01T00:00:00Z",
		git_commit: "abc1234",
		result_file: "output/test.json",
	},
};

async function setup(): Promise<{ root: string; currentHash: string }> {
	const root = await mkdtemp(join(tmpdir(), "rp1-waiver-"));
	tempDirs.push(root);
	const skillPath = join(root, "dist/claude-code/dev/skills/test/SKILL.md");
	await mkdir(join(skillPath, ".."), { recursive: true });
	await writeFile(skillPath, "# test skill\n", "utf8");
	await writeFile(
		join(root, ".release-please-manifest.json"),
		JSON.stringify({ ".": "0.7.13" }),
		"utf8",
	);
	process.chdir(root);
	const graph = await buildDependencyGraph(
		"dist/claude-code/dev/skills/test/SKILL.md",
		"claude-code",
	)();
	if (graph._tag === "Left") throw graph.left;
	const hash = await computePromptHash(graph.right.skillPath)();
	if (hash._tag === "Left") throw hash.left;
	return { root, currentHash: computeDepsHash([hash.right]) };
}

function waiver(hash: string, expires = "0.7.14") {
	return {
		reason: "temporary test waiver",
		granted_at: "2026-01-01T00:00:00Z",
		granted_commit: "abc1234",
		waived_deps_hash: hash,
		expires_after_version: expires,
	};
}

function manifest(record: Record<string, unknown>): AttestationManifest {
	return {
		schema_version: "2.0.0",
		skills: { "rp1-dev:test@claude-code": attestation },
		files: {},
		waivers: record as AttestationManifest["waivers"],
	};
}

afterEach(async () => {
	process.chdir(originalCwd);
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("attestation waivers", () => {
	test("applies only when the exact hash is pinned and version is within expiry", async () => {
		const { currentHash } = await setup();
		const result = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:test@claude-code": waiver(currentHash) }),
			"0.7.13",
		)();
		expect(result._tag === "Right" && result.right.status).toBe("waived");
	});

	test("does not apply when hash differs, version is expired, or key is unrelated", async () => {
		const { currentHash } = await setup();
		const differentHash = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:test@claude-code": waiver("sha256:different") }),
			"0.7.13",
		)();
		expect(
			differentHash._tag === "Right" && differentHash.right.reason,
		).toContain("different hash");
		const expired = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:test@claude-code": waiver(currentHash, "0.7.12") }),
			"0.7.13",
		)();
		expect(expired._tag === "Right" && expired.right.reason).toContain(
			"expired after 0.7.12",
		);
		const unrelated = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:other@claude-code": waiver(currentHash) }),
			"0.7.13",
		)();
		expect(unrelated._tag === "Right" && unrelated.right.status).toBe("stale");
	});

	test("fails closed for malformed release versions and waiver records", async () => {
		const { currentHash } = await setup();
		const malformedRelease = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:test@claude-code": waiver(currentHash) }),
			undefined,
		)();
		expect(
			malformedRelease._tag === "Right" && malformedRelease.right.reason,
		).toContain("release version missing or malformed");
		const malformedWaiver = await verifySkill(
			"rp1-dev:test@claude-code",
			attestation,
			manifest({ "rp1-dev:test@claude-code": { reason: "missing fields" } }),
			"0.7.13",
		)();
		expect(
			malformedWaiver._tag === "Right" && malformedWaiver.right.reason,
		).toContain("malformed waiver");
	});

	test("never waives missing skills and leaves current attestations current", async () => {
		const missing = await verifySkill(
			"rp1-dev:missing@claude-code",
			attestation,
			manifest({ "rp1-dev:missing@claude-code": waiver("sha256:any") }),
			"0.7.13",
		)();
		expect(missing._tag === "Right" && missing.right.status).toBe("missing");
		const { currentHash } = await setup();
		const current = { ...attestation, deps_hash: currentHash };
		const result = await verifySkill(
			"rp1-dev:test@claude-code",
			current,
			manifest({}),
			"0.7.13",
		)();
		expect(result._tag === "Right" && result.right.status).toBe("current");
	});

	test("compares numeric semver segments and reports waiver summaries", () => {
		expect(compareVersions("0.7.13", "0.7.13")).toBe(0);
		expect(compareVersions("0.7.14", "0.7.13")).toBeGreaterThan(0);
		expect(compareVersions("0.8.0", "0.7.13")).toBeGreaterThan(0);
		expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
		const summary = summarizeResults([
			{
				skill: "rp1-dev:test@claude-code",
				status: "waived",
				reason: "temporary test waiver",
			},
		]);
		expect(summary).toMatchObject({
			total: 1,
			current: 0,
			stale: 0,
			missing: 0,
			waived: 1,
			passed: true,
		});
	});

	test("preserves waivers through manifest updates and JSON round trips", () => {
		const waiverRecord = waiver("sha256:pinned");
		const original = {
			...emptyManifest(),
			waivers: { "rp1-dev:test@claude-code": waiverRecord },
		};
		const updated = updateManifest(
			original,
			"rp1-dev:test@claude-code",
			attestation,
			[],
		);
		expect(JSON.parse(JSON.stringify(updated)).waivers).toEqual(
			original.waivers,
		);
	});
});
