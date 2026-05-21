import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(process.cwd(), "..");

const readRepoFile = (path: string): Promise<string> =>
	readFile(join(repoRoot, path), "utf-8");

const recipeNames = [
	"antigravity-validate",
	"antigravity-validate-build",
	"antigravity-validate-package",
	"antigravity-validate-lifecycle",
	"antigravity-validate-docs",
	"antigravity-validate-support-matrix",
	"antigravity-smoke-normal",
	"antigravity-smoke-worktree",
	"antigravity-smoke-checkout-evidence",
	"antigravity-smoke-dynamic-delegation",
	"antigravity-smoke-dynamic-fanout",
	"antigravity-smoke-dynamic-failure",
	"antigravity-smoke-boundaries",
	"antigravity-smoke-permissions-trust",
	"antigravity-smoke-mcp-failure",
	"antigravity-regression-existing-harnesses",
	"antigravity-regression-existing-harness-run-state",
] as const;

describe("Antigravity validation recipes", () => {
	test("exposes active Antigravity build and validation recipes in justfile", async () => {
		const justfile = await readRepoFile("Justfile");

		expect(justfile).toContain("build-antigravity:");
		expect(justfile).toContain("bun run scripts/build-antigravity.ts");
		expect(justfile).not.toContain("build-gemini:");
		expect(justfile).not.toContain("bun run scripts/build-gemini.ts");
		expect(justfile).not.toContain("RP1_GEMINI_BUNDLE_DIR");
		expect(justfile).not.toContain("./bin/rp1 install gemini");

		for (const recipeName of recipeNames) {
			expect(justfile).toContain(`${recipeName}:`);
		}

		expect(justfile).toContain("RP1_ANTIGRAVITY_BUNDLE_DIR=dist/antigravity");
		expect(justfile).toContain("./bin/rp1 install antigravity");
		expect(justfile).toContain("agy plugin validate");
		expect(justfile).toContain("scripts/audit-antigravity-docs.ts");
		expect(justfile).toContain(
			"scripts/record-antigravity-boundary-evidence.ts",
		);
		expect(justfile).toContain(
			"scripts/record-antigravity-checkout-evidence.ts",
		);
		expect(justfile).toContain("antigravity-support.test.ts");
		expect(justfile).toContain("workflow-bootstrap.test.ts");
		expect(justfile).toContain("antigravity-package.test.ts");
		expect(justfile).toContain("PRODUCT-OWNED ANTIGRAVITY EXCEPTION");
		expect(justfile).toContain("--scenario permissions_trust");
		expect(justfile).toContain("--scenario mcp_failure");
		expect(justfile).toContain("--scenario all");
		expect(justfile).toContain("install-core.test.ts");
		expect(justfile).toContain("copilot/installer.test.ts");
		expect(justfile).toContain("--harness codex");
		expect(justfile).toContain("workflow-state --run-id");
		expect(justfile).toContain(
			"Existing-harness artifact/run-state smoke passed",
		);
	});

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
