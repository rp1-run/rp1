import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { TOOLS_REGISTRY } from "../../config/supported-tools.generated.stub.js";

const YAML_PATH = resolve(import.meta.dir, "../../config/supported-tools.yaml");

interface YamlTool {
	readonly id: string;
	readonly capabilities: readonly string[];
}

interface YamlRegistry {
	readonly version: string;
	readonly tools: readonly YamlTool[];
}

const loadCanonicalYaml = (): YamlRegistry => {
	const raw = readFileSync(YAML_PATH, "utf-8");
	return parseYaml(raw) as YamlRegistry;
};

describe("supported-tools stub parity with canonical YAML", () => {
	test("stub capability arrays match canonical YAML for every tool", () => {
		const canonical = loadCanonicalYaml();
		const stubTools = TOOLS_REGISTRY.tools;

		for (const yamlTool of canonical.tools) {
			const stubTool = stubTools.find((t) => t.id === yamlTool.id);
			expect(stubTool).toBeDefined();
			const stubCaps: readonly string[] = stubTool!.capabilities;
			expect(stubCaps).toEqual(yamlTool.capabilities);
		}
	});

	test("stub and YAML list the same set of tool IDs", () => {
		const canonical = loadCanonicalYaml();
		const yamlIds = canonical.tools.map((t) => t.id);
		const stubIds: string[] = TOOLS_REGISTRY.tools.map((t) => t.id as string);

		expect(stubIds).toEqual(yamlIds);
	});
});
