import { describe, expect, test } from "bun:test";
import { GITIGNORE_PRESETS } from "../../init/models.js";
import { buildSettingsTomlTemplate } from "../../init/settings-template.js";

describe("buildSettingsTomlTemplate", () => {
	test("output contains [storage] section with mode = central", () => {
		const result = buildSettingsTomlTemplate();

		expect(result).toContain("[storage]");
		expect(result).toContain('mode = "central"');
	});

	test("output is valid TOML with storage.mode = central", () => {
		const result = buildSettingsTomlTemplate();
		const parsed = Bun.TOML.parse(result) as Record<string, unknown>;
		const storage = parsed.storage as Record<string, unknown>;

		expect(storage).toBeDefined();
		expect(storage.mode).toBe("central");
	});

	test("output preserves existing command default examples", () => {
		const result = buildSettingsTomlTemplate();

		expect(result).toContain("dev:build");
		expect(result).toContain("dev:build-fast");
	});
});

describe("GITIGNORE_PRESETS.central", () => {
	test("preset exists", () => {
		expect(GITIGNORE_PRESETS.central).toBeDefined();
	});

	test("tracks project_id", () => {
		expect(GITIGNORE_PRESETS.central).toContain("!.rp1/project_id");
	});

	test("tracks settings.toml", () => {
		expect(GITIGNORE_PRESETS.central).toContain("!.rp1/settings.toml");
	});

	test("excludes .rp1/context/ and .rp1/work/ via .rp1/* wildcard", () => {
		const preset = GITIGNORE_PRESETS.central;

		// .rp1/* ignores all direct children including context/ and work/
		expect(preset).toContain(".rp1/*");
		// Should NOT un-ignore context or work
		expect(preset).not.toContain("!.rp1/context/");
		expect(preset).not.toContain("!.rp1/work/");
	});

	test("overrides global gitignore with !.rp1/", () => {
		expect(GITIGNORE_PRESETS.central).toContain("!.rp1/");
	});

	test("does not include config directory un-ignores", () => {
		const preset = GITIGNORE_PRESETS.central;

		// Central mode should not track config/ or context/ directories
		expect(preset).not.toContain("!.rp1/config/");
		expect(preset).not.toContain("!.rp1/context/");
	});
});

describe("existing gitignore presets unchanged", () => {
	test("recommended preset still un-ignores context", () => {
		expect(GITIGNORE_PRESETS.recommended).toContain("!.rp1/context/");
		expect(GITIGNORE_PRESETS.recommended).toContain("!.rp1/context/**");
		expect(GITIGNORE_PRESETS.recommended).toContain("!.rp1/project_id");
	});

	test("track_all preset still tracks everything except meta.json", () => {
		expect(GITIGNORE_PRESETS.track_all).toContain("!.rp1/");
		expect(GITIGNORE_PRESETS.track_all).toContain(".rp1/context/meta.json");
	});

	test("ignore_all preset still ignores entire .rp1/", () => {
		expect(GITIGNORE_PRESETS.ignore_all).toBe(".rp1/");
	});
});
