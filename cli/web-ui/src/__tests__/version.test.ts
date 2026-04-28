import { describe, expect, test } from "bun:test";
import cliPackage from "../../../package.json";
import viteConfig from "../../vite.config";
import { RP1_VERSION } from "../version";

describe("web-ui version metadata", () => {
	test("uses the CLI package version as the rp1 version source", () => {
		expect(RP1_VERSION).toBe(cliPackage.version);
	});

	test("injects the rp1 version into About build metadata", () => {
		const config = viteConfig as { define?: Record<string, unknown> };

		expect(config.define?.__RP1_WEB_UI_VERSION__).toBe(
			JSON.stringify(cliPackage.version),
		);
	});
});
