import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseSkill } from "../../build/parser.js";
import { GEMINI_BOUNDARY_COMMAND_TOML } from "../../install/gemini/boundary-command.js";
import { GEMINI_SMOKE_COMMAND_TOML } from "../../install/gemini/smoke-command.js";
import { expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const skillDir = join(projectRoot, "plugins/dev/skills/gemini-harness-smoke");
const boundarySkillDir = join(
	projectRoot,
	"plugins/dev/skills/gemini-harness-boundaries",
);
const subagentSkillDir = join(
	projectRoot,
	"plugins/dev/skills/gemini-harness-subagents",
);

const parseArtifactRegistrationPayload = (content: string) => {
	const payload = content.match(
		/--type artifact_registered[\s\S]*?--data '([^']+)'/,
	)?.[1];
	expect(payload).toBeDefined();

	return JSON.parse(
		payload!.replaceAll("{FEATURE_ID}", "gemini-smoke-test"),
	) as Record<string, unknown>;
};

const parseArtifactRegistrationPayloads = (
	content: string,
	featureId: string,
): readonly Record<string, unknown>[] =>
	[...content.matchAll(/--type artifact_registered[\s\S]*?--data '([^']+)'/g)]
		.map((match) => match[1])
		.map((payload) => {
			expect(payload).toBeDefined();
			return JSON.parse(
				(payload ?? "").replaceAll("{FEATURE_ID}", featureId),
			) as Record<string, unknown>;
		});

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
		expect(prompt).toContain(
			"const runRp1 = (args) => run(rp1Command, rp1Args(args));",
		);
		expect(prompt).toMatch(
			/const bootstrapResult = runRp1\(\[\s*"agent-tools",\s*"workflow-bootstrap",/,
		);
		expect(prompt).toMatch(/"--workflow",\s*"gemini-harness-smoke"/);
		expect(prompt).toMatch(/"--harness",\s*"gemini-cli"/);
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

	test("declares the tracked subagent workflow schema and terminal gates", async () => {
		const skill = await expectTaskRight(parseSkill(subagentSkillDir));

		expect(skill.name).toBe("gemini-harness-subagents");
		expect(skill.description).toContain(
			"Experimental Gemini CLI subagent and fanout validation workflow",
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
		expect(skill.content).toContain("stateDiagram-v2");
		expect(skill.content).toContain("[*] --> smoke");
		expect(skill.content).toContain(
			"smoke --> validation : delegated_smoke_ready",
		);
		expect(skill.content).toContain(
			"smoke --> blocked : unsupported_or_ack_required",
		);
		expect(skill.content).toContain(
			"validation --> completed : evidence_passed",
		);
		expect(skill.content).toContain("validation --> failed : evidence_failed");
		expect(skill.content).toContain(
			"validation --> blocked : evidence_blocked",
		);
		expect(skill.content).toContain("Do not claim Gemini first-class support");
	});

	test("declares subagent evidence artifact registrations with explicit work-root storage", async () => {
		const skill = await expectTaskRight(parseSkill(subagentSkillDir));
		const payloads = parseArtifactRegistrationPayloads(
			skill.content,
			"gemini-phase2",
		);

		expect(skill.content).toContain(
			"{workRoot}/features/{FEATURE_ID}/gemini-subagents.md",
		);
		expect(skill.content).toContain(
			"{workRoot}/features/{FEATURE_ID}/gemini-subagents.json",
		);
		expect(payloads).toEqual([
			{
				path: "features/gemini-phase2/gemini-subagents.md",
				feature: "gemini-phase2",
				storageRoot: "work_dir",
				format: "markdown",
				harness: "gemini-cli",
			},
			{
				path: "features/gemini-phase2/gemini-subagents.json",
				feature: "gemini-phase2",
				storageRoot: "work_dir",
				format: "json",
				harness: "gemini-cli",
			},
		]);
	});

	test("declares the tracked boundary workflow schema and terminal gates", async () => {
		const skill = await expectTaskRight(parseSkill(boundarySkillDir));

		expect(skill.name).toBe("gemini-harness-boundaries");
		expect(skill.description).toContain(
			"Experimental Gemini CLI boundary evidence workflow",
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
		expect(skill.content).toContain("stateDiagram-v2");
		expect(skill.content).toContain("[*] --> boundary");
		expect(skill.content).toContain(
			"boundary --> evidence : scenario_recorded",
		);
		expect(skill.content).toContain(
			"evidence --> completed : evidence_persisted",
		);
		expect(skill.content).toContain(
			"evidence --> unsupported : unsupported_boundary",
		);
		expect(skill.content).toContain("Do not claim Gemini first-class support");
	});

	test("declares boundary evidence artifact registrations with explicit work-root storage", async () => {
		const skill = await expectTaskRight(parseSkill(boundarySkillDir));
		const payloads = parseArtifactRegistrationPayloads(
			skill.content,
			"gemini-phase-3",
		);

		expect(skill.content).toContain(
			"{workRoot}/features/{FEATURE_ID}/gemini-boundaries.md",
		);
		expect(skill.content).toContain(
			"{workRoot}/features/{FEATURE_ID}/gemini-boundaries.json",
		);
		expect(payloads).toEqual([
			{
				path: "features/gemini-phase-3/gemini-boundaries.md",
				feature: "gemini-phase-3",
				storageRoot: "work_dir",
				format: "markdown",
				harness: "gemini-cli",
			},
			{
				path: "features/gemini-phase-3/gemini-boundaries.json",
				feature: "gemini-phase-3",
				storageRoot: "work_dir",
				format: "json",
				harness: "gemini-cli",
			},
		]);
	});

	test("keeps the Gemini boundary command template scoped to boundary evidence", () => {
		const parsed = Bun.TOML.parse(GEMINI_BOUNDARY_COMMAND_TOML) as {
			readonly description?: unknown;
			readonly prompt?: unknown;
		};
		expect(parsed.description).toBe(
			"Experimental rp1 Gemini boundary evidence recorder.",
		);
		expect(typeof parsed.prompt).toBe("string");

		const prompt = parsed.prompt as string;
		expect(prompt).toMatch(
			/const bootstrapResult = runRp1\(\[\s*"agent-tools",\s*"workflow-bootstrap",/,
		);
		expect(prompt).toMatch(/"--name",\s*WORKFLOW/);
		expect(prompt).toContain('const WORKFLOW = "gemini-harness-boundaries";');
		expect(prompt).toContain('const HARNESS = "gemini-cli";');
		expect(prompt).toContain("SCENARIO=");
		expect(prompt).toContain("MODE=");
		expect(prompt).toContain("STATUS=");
		expect(prompt).toContain("STATE=");
		expect(prompt).toContain("gemini-boundaries.md");
		expect(prompt).toContain("gemini-boundaries.json");
		expect(prompt).toContain('storageRoot: "work_dir"');
		expect(prompt).toContain(
			"Classification: experimental boundary evidence only",
		);
		expect(prompt).not.toContain("rp1-alpha");
		expect(prompt).not.toContain("rp1-beta");
	});
});
