import { describe, expect, test } from "bun:test";
import {
	GEMINI_ALPHA_AGENT_MARKDOWN,
	GEMINI_BETA_AGENT_MARKDOWN,
	GEMINI_EXTENSION_MANIFEST_JSON,
	GEMINI_EXTENSION_NAME,
	GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
	GEMINI_RUNTIME_FAIL_AGENT_MODEL,
	GEMINI_RUNTIME_FAIL_AGENT_NAME,
	GEMINI_SUBAGENT_COMMAND_TOML,
} from "../../../install/gemini/index.js";

const parseAgentFrontmatter = (
	content: string,
): Record<string, string | string[]> => {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	expect(match).not.toBeNull();

	const fields = new Map<string, string | string[]>();
	for (const line of match?.[1].split("\n") ?? []) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex < 0) continue;
		const key = line.slice(0, separatorIndex);
		const rawValue = line.slice(separatorIndex + 1).trim();
		fields.set(key, rawValue === "[]" ? [] : rawValue);
	}

	return Object.fromEntries(fields);
};

describe("Gemini subagent validation assets", () => {
	test("declares a valid Gemini extension manifest", () => {
		const manifest = JSON.parse(GEMINI_EXTENSION_MANIFEST_JSON) as {
			readonly name?: unknown;
			readonly version?: unknown;
			readonly description?: unknown;
		};

		expect(manifest.name).toBe(GEMINI_EXTENSION_NAME);
		expect(manifest.version).toBe("1.0.0");
		expect(manifest.description).toContain("P2 delegation");
		expect(manifest.description).toContain("P3 boundary validation");
	});

	test("subagent command parses as TOML and references only validation agents", () => {
		const parsed = Bun.TOML.parse(GEMINI_SUBAGENT_COMMAND_TOML) as {
			readonly description?: unknown;
			readonly prompt?: unknown;
		};
		expect(parsed.description).toBe(
			"Experimental rp1 P2 subagent fanout validation for Gemini CLI.",
		);
		expect(typeof parsed.prompt).toBe("string");

		const prompt = parsed.prompt as string;
		expect(prompt).toContain("@rp1-alpha");
		expect(prompt).toContain("@rp1-beta");
		expect(prompt).toContain("@rp1-runtime-fail");
		expect(prompt).toContain("ALPHA_MARKER_FROM_rp1-alpha");
		expect(prompt).toContain("BETA_MARKER_FROM_rp1-beta");
		expect(prompt).toContain("failing_error");
		expect(prompt).toContain("New Agents Discovered");
		expect(prompt).toContain("acknowledgement");
		expect(prompt).toContain("Gemini subagent validation: blocked");
		expect(prompt).toContain("User action: Run rp1 install gemini");
		expect(prompt).toContain("extension rp1-phase2-validation is enabled");
		expect(prompt.toLowerCase()).toContain("do not run full rp1 workflows");
		expect(prompt).not.toContain("/rp1:build");
		expect(prompt).not.toContain("/rp1:pr-review");
	});

	test("validation agents use Gemini custom-agent frontmatter and exact markers", () => {
		expect(parseAgentFrontmatter(GEMINI_ALPHA_AGENT_MARKDOWN)).toMatchObject({
			name: "rp1-alpha",
			kind: "local",
			tools: [],
			model: "inherit",
		});
		expect(GEMINI_ALPHA_AGENT_MARKDOWN).toContain(
			"Return exactly: ALPHA_MARKER_FROM_rp1-alpha",
		);

		expect(parseAgentFrontmatter(GEMINI_BETA_AGENT_MARKDOWN)).toMatchObject({
			name: "rp1-beta",
			kind: "local",
			tools: [],
			model: "inherit",
		});
		expect(GEMINI_BETA_AGENT_MARKDOWN).toContain(
			"Return exactly: BETA_MARKER_FROM_rp1-beta",
		);

		expect(
			parseAgentFrontmatter(GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN),
		).toMatchObject({
			name: GEMINI_RUNTIME_FAIL_AGENT_NAME,
			kind: "local",
			tools: [],
			model: GEMINI_RUNTIME_FAIL_AGENT_MODEL,
		});
		expect(GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN).toContain(
			"intentionally configured with an invalid model",
		);
	});
});
