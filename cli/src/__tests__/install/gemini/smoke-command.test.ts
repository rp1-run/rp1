import { describe, expect, test } from "bun:test";
import { GEMINI_SMOKE_COMMAND_TOML } from "../../../install/gemini/smoke-command.js";

const getSmokeShellScript = (): string => {
	const parsed = Bun.TOML.parse(GEMINI_SMOKE_COMMAND_TOML) as {
		readonly prompt?: unknown;
	};
	expect(typeof parsed.prompt).toBe("string");

	const match = (parsed.prompt as string).match(
		/!{bash <<'RP1_GEMINI_SMOKE'\n([\s\S]*?)\nRP1_GEMINI_SMOKE\n}/,
	);
	expect(match).not.toBeNull();
	return match?.[1] ?? "";
};

const getArgumentParsingPrelude = (): string => {
	const script = getSmokeShellScript();
	const marker = '\nif [ -z "$FEATURE_ID" ]; then';
	const markerIndex = script.indexOf(marker);
	expect(markerIndex).toBeGreaterThan(0);
	return script.slice(0, markerIndex);
};

const parseSmokeArgs = async (
	args: string,
): Promise<{
	readonly rawArgs: string;
	readonly featureId: string;
	readonly runContext: string;
}> => {
	const script = `${getArgumentParsingPrelude().replace("{{args}}", args)}
printf 'RAW_ARGS=%s\\n' "$RAW_ARGS"
printf 'FEATURE_ID=%s\\n' "$FEATURE_ID"
printf 'RUN_CONTEXT=%s\\n' "$RUN_CONTEXT"
`;

	const proc = Bun.spawn(["bash", "-c", script], {
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
});
