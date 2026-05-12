import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseSkill } from "../../build/parser.js";
import { GEMINI_SMOKE_COMMAND_TOML } from "../../install/gemini/smoke-command.js";
import { expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const skillDir = join(projectRoot, "plugins/dev/skills/gemini-harness-smoke");

const parseArtifactRegistrationPayload = (content: string) => {
	const payload = content.match(
		/--type artifact_registered[\s\S]*?--data '([^']+)'/,
	)?.[1];
	expect(payload).toBeDefined();

	return JSON.parse(
		payload!.replaceAll("{FEATURE_ID}", "gemini-smoke-test"),
	) as Record<string, unknown>;
};

describe("Gemini smoke workflow contracts", () => {
	test("declares the tracked smoke workflow arguments and state", async () => {
		const skill = await expectTaskRight(parseSkill(skillDir));

		expect(skill.name).toBe("gemini-harness-smoke");
		expect(skill.description).toContain(
			"Experimental Gemini CLI smoke workflow",
		);
		expect(skill.metadata?.category).toBe("development");
		expect(skill.metadata?.isWorkflow).toBe(true);
		expect(skill.metadata?.workflow).toEqual({
			runPolicy: "fresh",
			identityArgs: [],
		});
		expect(skill.metadata?.arguments?.map((arg) => arg.name)).toEqual([
			"FEATURE_ID",
			"RUN_CONTEXT",
		]);
		expect(skill.metadata?.arguments?.[0]).toMatchObject({
			name: "FEATURE_ID",
			type: "string",
			required: true,
		});
		expect(skill.metadata?.arguments?.[1]).toMatchObject({
			name: "RUN_CONTEXT",
			type: "string",
			required: false,
			default: "",
		});

		expect(skill.content).toContain("stateDiagram-v2");
		expect(skill.content).toContain("[*] --> smoke");
		expect(skill.content).toContain("smoke --> [*] : done");
	});

	test("declares the work-root artifact path and registration payload", async () => {
		const skill = await expectTaskRight(parseSkill(skillDir));
		const payload = parseArtifactRegistrationPayload(skill.content);

		expect(skill.content).toContain(
			"{workRoot}/features/{FEATURE_ID}/gemini-smoke.md",
		);
		expect(skill.content).toContain("features/{FEATURE_ID}/gemini-smoke.md");
		expect(payload).toEqual({
			path: "features/gemini-smoke-test/gemini-smoke.md",
			feature: "gemini-smoke-test",
			storageRoot: "work_dir",
			format: "markdown",
			harness: "gemini-cli",
		});
	});

	test("keeps the Gemini command template bound to bootstrap and smoke evidence only", () => {
		const parsed = Bun.TOML.parse(GEMINI_SMOKE_COMMAND_TOML) as {
			readonly description?: unknown;
			readonly prompt?: unknown;
		};
		expect(parsed.description).toBe(
			"Experimental rp1 smoke workflow for Gemini CLI.",
		);
		expect(typeof parsed.prompt).toBe("string");

		const prompt = parsed.prompt as string;
		expect(prompt).toContain("rp1 agent-tools workflow-bootstrap");
		expect(prompt).toContain("--workflow gemini-harness-smoke");
		expect(prompt).toContain("--harness gemini-cli");
		expect(prompt).toContain("FEATURE_ID=");
		expect(prompt).toContain("RUN_CONTEXT=");
		expect(prompt).toContain(
			'path.posix.join("features", featureId, "gemini-smoke.md")',
		);
		expect(prompt).toContain('storageRoot: "work_dir"');
		expect(prompt).toContain("registration_status:");
		expect(prompt).not.toContain("subagent");
		expect(prompt).not.toContain("fanout");
	});
});
