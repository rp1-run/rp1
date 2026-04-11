import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

describe("build-fast work-root wiring", () => {
	test("passes canonical workRoot into the build-fast planner agent", async () => {
		const skillPath = join(REPO_ROOT, "plugins/dev/skills/build-fast/SKILL.md");
		const content = await readFile(skillPath, "utf-8");

		expect(content).toContain("WORK_ROOT={workRoot}");
	});

	test("uses WORK_ROOT for quick-build artifact filesystem writes", async () => {
		const agentPath = join(
			REPO_ROOT,
			"plugins/dev/agents/build-fast-planner.md",
		);
		const content = await readFile(agentPath, "utf-8");

		expect(content).toContain("{{WORK_ROOT from prompt}}");
		expect(content).toContain("in `{WORK_ROOT}/quick-builds/`");
		expect(content).toContain(
			"Write the file to `{WORK_ROOT}/quick-builds/{filename}`",
		);
		expect(content).toContain('mkdir -p "{WORK_ROOT}/quick-builds"');
		expect(content).not.toContain('mkdir -p ".rp1/work/quick-builds"');
	});
});
