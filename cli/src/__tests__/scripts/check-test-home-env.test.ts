import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	analyzeTestHomeEnvironmentSource,
	formatTestHomeEnvironmentViolation,
} from "../../../scripts/check-test-home-env.js";

const fixtureRoot = join(import.meta.dir, "fixtures", "test-home-env");

const analyzeFixture = async (name: string): Promise<readonly string[]> => {
	const fileName = `${name}.ts.txt`;
	const source = await readFile(join(fixtureRoot, fileName), "utf-8");
	return analyzeTestHomeEnvironmentSource(source, fileName).map(
		formatTestHomeEnvironmentViolation,
	);
};

describe("direct test home environment lint", () => {
	test("runs before maintained standard and coverage commands", async () => {
		const packageJson = JSON.parse(
			await readFile(
				join(import.meta.dir, "..", "..", "..", "package.json"),
				"utf-8",
			),
		) as { readonly scripts: Readonly<Record<string, string>> };

		for (const scriptName of [
			"test",
			"test:unit",
			"test:integration",
			"test:coverage",
			"test:watch",
		]) {
			expect(packageJson.scripts[scriptName], scriptName).toStartWith(
				"bun run check:test-home-env && ",
			);
		}
	});

	test("reports direct protected mutations and explicit partial child environments", async () => {
		expect(await analyzeFixture("direct-negative")).toEqual([
			"direct-negative.ts.txt:1:1 [test-home-env-mutation] Do not mutate process.env.HOME directly; use the admitted sandbox environment",
			"direct-negative.ts.txt:2:8 [test-home-env-mutation] Do not mutate process.env.XDG_CONFIG_HOME directly; use the admitted sandbox environment",
			"direct-negative.ts.txt:3:22 [test-home-env-replacement] Bun.spawn env must inherit process.env without overriding protected sandbox keys",
			"direct-negative.ts.txt:4:29 [test-home-env-replacement] Worker env must inherit process.env without overriding protected sandbox keys",
			"direct-negative.ts.txt:5:20 [test-home-env-replacement] Node spawn env must inherit process.env without overriding protected sandbox keys",
		]);
	});

	test("leaves aliases, computed keys, and unresolved environment values outside its contract", async () => {
		expect(await analyzeFixture("direct-positive")).toEqual([]);
	});
});
