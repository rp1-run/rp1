import { describe, expect, test } from "bun:test";
import cliPackage from "../../../package.json";
import viteConfig, {
	buildRuntimeManifest,
	runtimeManifestAsset,
} from "../../vite.config";
import {
	ARCADE_RUNTIME_MANIFEST_FILENAME,
	type ArcadeRuntimeManifest,
} from "../types/runtime";
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
		expect(
			typeof JSON.parse(String(config.define?.__RP1_WEB_UI_BUILD_ID__)),
		).toBe("string");
	});

	test("builds a deterministic runtime manifest identity", () => {
		const first = buildRuntimeManifest({
			version: "0.7.6",
			gitCommit: "abc1234",
			buildTime: "2026-05-04T00:00:00.000Z",
		});
		const second = buildRuntimeManifest({
			version: "0.7.6",
			gitCommit: "abc1234",
			buildTime: "2026-05-04T00:01:00.000Z",
		});

		expect(first).toEqual({
			version: "0.7.6",
			gitCommit: "abc1234",
			buildTime: "2026-05-04T00:00:00.000Z",
			buildId: second.buildId,
		});
		expect(first.buildId).toHaveLength(12);
	});

	test("emits the runtime manifest asset into the client build", () => {
		const manifest: ArcadeRuntimeManifest = {
			version: "0.7.6",
			gitCommit: "abc1234",
			buildTime: "2026-05-04T00:00:00.000Z",
			buildId: "build-abc1234",
		};
		const asset = runtimeManifestAsset(manifest);

		expect(asset.type).toBe("asset");
		expect(asset.fileName).toBe(ARCADE_RUNTIME_MANIFEST_FILENAME);
		expect(JSON.parse(asset.source)).toEqual(manifest);
	});
});
