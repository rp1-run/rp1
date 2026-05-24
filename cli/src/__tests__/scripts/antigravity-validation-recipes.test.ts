import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(process.cwd(), "..");

const readRepoFile = (path: string): Promise<string> =>
	readFile(join(repoRoot, path), "utf-8");

describe("Antigravity validation recipes", () => {
	test("keeps package build scripts pointed at Antigravity", async () => {
		const packageJson = JSON.parse(await readRepoFile("cli/package.json")) as {
			readonly scripts: Record<string, string>;
		};
		const buildScript = await readRepoFile("cli/scripts/build-antigravity.ts");
		const buildPlatformsScript = await readRepoFile(
			"cli/scripts/build-platforms.ts",
		);

		expect(packageJson.scripts["build:antigravity"]).toBe(
			"bun run scripts/build-antigravity.ts",
		);
		expect(packageJson.scripts["build:gemini"]).toBeUndefined();
		expect(buildScript).toContain('"--platform", "antigravity"');
		expect(buildScript).toContain("dist/antigravity/");
		expect(buildPlatformsScript).toContain(
			"dist/claude-code/, dist/opencode/, dist/codex/, dist/copilot/, and dist/antigravity/",
		);
		expect(buildPlatformsScript).not.toContain("dist/gemini/");
	});

	test("documents explicit boundary evidence transcript inputs", async () => {
		const recorder = await readRepoFile(
			"cli/scripts/record-antigravity-boundary-evidence.ts",
		);

		expect(recorder).toContain("RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT");
		expect(recorder).toContain("RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT");
		expect(recorder).toContain("RP1_ANTIGRAVITY_REQUIRE_LIVE");
		expect(recorder).toContain("feature_verification_1.md blocker 4");
		expect(recorder).toContain("antigravity-boundaries.md");
		expect(recorder).toContain("antigravity-boundaries.json");
	});

	test("documents explicit checkout and artifact evidence outputs", async () => {
		const recorder = await readRepoFile(
			"cli/scripts/record-antigravity-checkout-evidence.ts",
		);

		expect(recorder).toContain("normal_checkout");
		expect(recorder).toContain("worktree_checkout");
		expect(recorder).toContain("artifact_registration_failure");
		expect(recorder).toContain("feature_verification_1.md REQ-005");
		expect(recorder).toContain("antigravity-checkout-evidence.md");
		expect(recorder).toContain("antigravity-checkout-evidence.json");
		expect(recorder).toContain("--harness");
		expect(recorder).toContain("storageRoot");
		expect(recorder).toContain("workflow-state");
	});
});
