import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { verifyInstallation } from "../../install/verifier.js";
import { getErrorMessage } from "../helpers/index.js";

const validFrontmatter = (description: string): string => `---
description: "${description}"
---

Body.
`;

const writeFixture = async (
	root: string,
	relativePath: string,
	content: string,
): Promise<void> => {
	const target = join(root, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content);
};

describe("verifyInstallation filesystem coverage", () => {
	const originalHome = process.env.HOME;
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-verifier-coverage-"));
		process.env.HOME = tempDir;
	});

	afterEach(async () => {
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	test("reports a healthy OpenCode installation from explicit expected counts", async () => {
		await writeFixture(
			tempDir,
			".config/opencode/agents/rp1-alpha.md",
			validFrontmatter("Alpha agent"),
		);
		await writeFixture(
			tempDir,
			".config/opencode/agents/rp1-beta.md",
			validFrontmatter("Beta agent"),
		);
		await writeFixture(
			tempDir,
			".config/opencode/skills/rp1-alpha/SKILL.md",
			validFrontmatter("Alpha skill"),
		);
		await writeFixture(
			tempDir,
			".config/opencode/skills/rp1-beta/SKILL.md",
			validFrontmatter("Beta skill"),
		);
		await writeFixture(
			tempDir,
			".config/opencode/plugins/rp1-base-hooks.ts",
			"export default {};\n",
		);

		const result = await verifyInstallation(undefined, {
			agents: 2,
			skills: 2,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toMatchObject({
				agentsFound: 2,
				agentsExpected: 2,
				skillsFound: 2,
				skillsExpected: 2,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			});
		}
	});

	test("uses artifact manifest names to report missing and unhealthy files", async () => {
		await writeFixture(
			tempDir,
			"artifacts/base/manifest.json",
			JSON.stringify({
				plugin: "rp1-base",
				version: "1.0.0",
				opencode_version_tested: "0.9.0",
				artifacts: {
					commands: [],
					agents: ["rp1-present-agent", "rp1-missing-agent"],
					skills: ["rp1-present-skill", "rp1-missing-skill"],
				},
			}),
		);
		await writeFixture(
			tempDir,
			".config/opencode/agents/rp1-present-agent.md",
			validFrontmatter("Present agent"),
		);
		await writeFixture(
			tempDir,
			".config/opencode/agents/rp1-invalid-agent.md",
			"Missing frontmatter\n",
		);
		await writeFixture(
			tempDir,
			".config/opencode/skills/rp1-present-skill/SKILL.md",
			"Missing frontmatter\n",
		);

		const result = await verifyInstallation(join(tempDir, "artifacts"))();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.agentsExpected).toBe(2);
			expect(result.right.skillsExpected).toBe(2);
			expect(result.right.issues.join("\n")).toContain("Missing agents (1)");
			expect(result.right.issues.join("\n")).toContain("Missing skills (1)");
			expect(result.right.issues.join("\n")).toContain(
				"Missing YAML frontmatter",
			);
			expect(result.right.issues.join("\n")).toContain("Missing plugins (1)");
		}
	});

	test("returns a verification error when OpenCode has no configuration directory", async () => {
		const result = await verifyInstallation()();

		expect(E.isLeft(result)).toBe(true);
		if (E.isLeft(result)) {
			expect(getErrorMessage(result.left)).toContain(
				"OpenCode configuration directory not found",
			);
		}
	});
});
