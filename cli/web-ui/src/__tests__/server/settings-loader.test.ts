import { describe, expect, test } from "bun:test";
import { mergeSettings, validateSettings } from "../../server/settings-loader";

describe("Arcade settings loader", () => {
	test("defaults ACP sidecar behavior to disabled", () => {
		const settings = mergeSettings(null, null);

		expect(settings.acp).toEqual({ enabled: false });
	});

	test("uses only the global ACP setting", () => {
		expect(mergeSettings({ acp: { enabled: true } }, null).acp.enabled).toBe(
			true,
		);
		expect(mergeSettings(null, { acp: { enabled: true } }).acp.enabled).toBe(
			false,
		);
		expect(
			mergeSettings(
				{ acp: { enabled: true } },
				{ acp: { enabled: false }, theme: "dark" },
			),
		).toMatchObject({
			theme: "dark",
			acp: { enabled: true },
		});
	});

	test("validates optional ACP settings", () => {
		expect(validateSettings({ version: 1, acp: { enabled: true } })).toBe(true);
		expect(validateSettings({ version: 1, acp: { enabled: "yes" } })).toBe(
			false,
		);
		expect(validateSettings({ version: 1, acp: true })).toBe(false);
	});
});
