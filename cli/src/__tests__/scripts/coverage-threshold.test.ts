import { describe, expect, test } from "bun:test";
import {
	formatCoveragePercent,
	meetsLineThreshold,
	summarizeLcovLineCoverage,
} from "../../../scripts/coverage-threshold.ts";

describe("coverage threshold helper", () => {
	test("aggregates LCOV line coverage globally across files", () => {
		const summary = summarizeLcovLineCoverage(
			[
				"TN:",
				"SF:src/covered.ts",
				"LF:8",
				"LH:8",
				"end_of_record",
				"SF:src/partial.ts",
				"LF:2",
				"LH:1",
				"end_of_record",
			].join("\n"),
		);

		expect(summary).toEqual({ hit: 9, found: 10, ratio: 0.9 });
		expect(meetsLineThreshold(summary, 0.8)).toBe(true);
		expect(formatCoveragePercent(summary.ratio)).toBe("90.00%");
	});

	test("fails only when aggregate LCOV line coverage is below threshold", () => {
		const summary = summarizeLcovLineCoverage(
			[
				"SF:src/one.ts",
				"LF:4",
				"LH:3",
				"end_of_record",
				"SF:src/two.ts",
				"LF:6",
				"LH:4",
				"end_of_record",
			].join("\n"),
		);

		expect(summary).toEqual({ hit: 7, found: 10, ratio: 0.7 });
		expect(meetsLineThreshold(summary, 0.8)).toBe(false);
	});
});
