import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	PLUGIN_NAMES,
	parseCanonical,
	parseUserFacing,
	toCanonicalString,
	toPluginName,
	toUserFacing,
} from "../../../shared/canonical-name.js";

describe("parseCanonical", () => {
	test("parses dev:build", () => {
		const result = parseCanonical("dev:build");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toEqual({ plugin: "dev", artifact: "build" });
		}
	});

	test("parses base:knowledge-load", () => {
		const result = parseCanonical("base:knowledge-load");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toEqual({
				plugin: "base",
				artifact: "knowledge-load",
			});
		}
	});

	test("rejects input without colon", () => {
		expect(E.isLeft(parseCanonical("build"))).toBe(true);
	});

	test("rejects empty plugin", () => {
		expect(E.isLeft(parseCanonical(":build"))).toBe(true);
	});

	test("rejects empty artifact", () => {
		expect(E.isLeft(parseCanonical("dev:"))).toBe(true);
	});
});

describe("parseUserFacing", () => {
	test("parses rp1-dev:build", () => {
		const result = parseUserFacing("rp1-dev:build");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toEqual({ plugin: "dev", artifact: "build" });
		}
	});

	test("strips rp1- prefix from plugin", () => {
		const result = parseUserFacing("rp1-base:deep-research");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.plugin).toBe("base");
		}
	});

	test("accepts unprefixed input", () => {
		const result = parseUserFacing("dev:build");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toEqual({ plugin: "dev", artifact: "build" });
		}
	});

	test("rejects input without colon", () => {
		expect(E.isLeft(parseUserFacing("rp1-dev-build"))).toBe(true);
	});
});

describe("conversion functions", () => {
	const name = { plugin: "dev", artifact: "build" };

	test("toCanonicalString", () => {
		expect(toCanonicalString(name)).toBe("dev:build");
	});

	test("toUserFacing", () => {
		expect(toUserFacing(name)).toBe("rp1-dev:build");
	});

	test("toPluginName", () => {
		expect(toPluginName(name)).toBe("rp1-dev");
	});
});

describe("round-trip", () => {
	test("parseUserFacing -> toUserFacing", () => {
		const input = "rp1-utils:tester";
		const parsed = parseUserFacing(input);
		expect(E.isRight(parsed)).toBe(true);
		if (E.isRight(parsed)) {
			expect(toUserFacing(parsed.right)).toBe(input);
		}
	});

	test("parseCanonical -> toCanonicalString", () => {
		const input = "base:knowledge-load";
		const parsed = parseCanonical(input);
		expect(E.isRight(parsed)).toBe(true);
		if (E.isRight(parsed)) {
			expect(toCanonicalString(parsed.right)).toBe(input);
		}
	});
});

describe("PLUGIN_NAMES", () => {
	test("contains expected plugins", () => {
		expect(PLUGIN_NAMES).toContain("base");
		expect(PLUGIN_NAMES).toContain("dev");
		expect(PLUGIN_NAMES).toContain("utils");
	});
});
