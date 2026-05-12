import { describe, expect, test } from "bun:test";
import { GEMINI_SMOKE_COMMAND_TOML } from "../../../install/gemini/smoke-command.js";

const getSmokeNodeScript = (): string => {
	const parsed = Bun.TOML.parse(GEMINI_SMOKE_COMMAND_TOML) as {
		readonly prompt?: unknown;
	};
	expect(typeof parsed.prompt).toBe("string");

	const match = (parsed.prompt as string).match(
		/!{node - \{\{args\}\} <<'RP1_GEMINI_SMOKE'\n([\s\S]*?)\nRP1_GEMINI_SMOKE\n}/,
	);
	expect(match).not.toBeNull();
	return match?.[1] ?? "";
};

const getArgumentParsingPrelude = (): string => {
	const script = getSmokeNodeScript();
	const startIndex = script.indexOf("const parseSmokeArgs = (input) => {");
	const markerIndex = script.indexOf("\nconst versionResult =");
	expect(startIndex).toBeGreaterThanOrEqual(0);
	expect(markerIndex).toBeGreaterThan(startIndex);
	return script.slice(startIndex, markerIndex);
};

const parseSmokeArgs = async (
	args: string,
): Promise<{
	readonly rawArgs: string;
	readonly featureId: string;
	readonly runContext: string;
}> => {
	const script = `${getArgumentParsingPrelude().replace("{{args}}", args)}
const result = parseSmokeArgs(${JSON.stringify(args)});
console.log("RAW_ARGS=" + result.rawArgs);
console.log("FEATURE_ID=" + result.featureId);
console.log("RUN_CONTEXT=" + result.runContext);
`;

	const proc = Bun.spawn(["node", "-e", script], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	expect(stderr).toBe("");
	expect(exitCode).toBe(0);

	const values = new Map(
		stdout
			.trimEnd()
			.split("\n")
			.map((line) => {
				const separatorIndex = line.indexOf("=");
				return [
					line.slice(0, separatorIndex),
					line.slice(separatorIndex + 1),
				] as const;
			}),
	);

	return {
		rawArgs: values.get("RAW_ARGS") ?? "",
		featureId: values.get("FEATURE_ID") ?? "",
		runContext: values.get("RUN_CONTEXT") ?? "",
	};
};

describe("Gemini smoke command template", () => {
	test("parses as TOML", () => {
		const parsed = Bun.TOML.parse(GEMINI_SMOKE_COMMAND_TOML) as {
			readonly description?: unknown;
			readonly prompt?: unknown;
		};

		expect(parsed.description).toBe(
			"Experimental rp1 smoke workflow for Gemini CLI.",
		);
		expect(typeof parsed.prompt).toBe("string");
	});

	test("uses a Node heredoc without shell command substitution", () => {
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain(
			"!{node - {{args}} <<'RP1_GEMINI_SMOKE'",
		);
		expect(getSmokeNodeScript()).not.toContain("$(");
	});

	test("prefers the checkout rp1 CLI for workflow emits", () => {
		const script = getSmokeNodeScript();

		expect(script).toContain(
			'const localRp1CliPath = path.join(process.cwd(), "cli/src/main.ts");',
		);
		expect(script).toContain(
			"const runRp1 = (args) => run(rp1Command, rp1Args(args));",
		);
		expect(script).not.toContain('run("rp1",');
	});

	test("preserves named multi-token arguments before workflow bootstrap", async () => {
		const result = await parseSmokeArgs("FEATURE_ID=feat RUN_CONTEXT=normal");

		expect(result).toEqual({
			rawArgs: "FEATURE_ID=feat RUN_CONTEXT=normal",
			featureId: "feat",
			runContext: "normal",
		});
	});

	test("preserves positional multi-token arguments before workflow bootstrap", async () => {
		const result = await parseSmokeArgs("feat normal");

		expect(result).toEqual({
			rawArgs: "feat normal",
			featureId: "feat",
			runContext: "normal",
		});
	});

	test("surfaces named degraded states and remediation in the command prompt", () => {
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain(
			"State: degraded_trust_or_approval",
		);
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain(
			"State: degraded_missing_binary",
		);
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain(
			"State: degraded_missing_command",
		);
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain("State: registration_failed");
		expect(GEMINI_SMOKE_COMMAND_TOML).toContain("User action:");
	});
});
