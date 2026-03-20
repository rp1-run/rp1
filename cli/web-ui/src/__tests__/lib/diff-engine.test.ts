import { describe, expect, test } from "bun:test";
import { diffLines } from "../../lib/diff-engine";

describe("diffLines", () => {
	test("returns all unchanged for identical documents", () => {
		const lines = ["# Hello", "World", ""];
		const result = diffLines(lines, lines);
		expect(result.every((e) => e.type === "unchanged")).toBe(true);
		expect(result.length).toBe(3);
	});

	test("detects a single line modification", () => {
		const baseline = ["alpha", "beta", "gamma"];
		const current = ["alpha", "BETA", "gamma"];
		const result = diffLines(baseline, current);

		const changed = result.filter((e) => e.type !== "unchanged");
		expect(changed).toEqual([
			{ type: "modified", line: 2, before: "beta", after: "BETA" },
		]);
	});

	test("classifies an inserted line as added with before: null", () => {
		const baseline = ["A", "B", "C", "D"];
		const current = ["A", "X", "B", "C", "D"];
		const result = diffLines(baseline, current);

		const added = result.filter((e) => e.type === "added");
		expect(added).toEqual([
			{ type: "added", line: 2, before: null, after: "X" },
		]);
		expect(result.filter((e) => e.type === "unchanged").length).toBe(4);
	});

	test("classifies a removed line as deleted with after: null", () => {
		const baseline = ["A", "B", "C", "D"];
		const current = ["A", "C", "D"];
		const result = diffLines(baseline, current);

		const deleted = result.filter((e) => e.type === "deleted");
		expect(deleted.length).toBe(1);
		expect(deleted[0]?.before).toBe("B");
		expect(deleted[0]?.after).toBeNull();
	});

	test("handles multiple insertions in different positions", () => {
		const baseline = ["A", "B", "C"];
		const current = ["X", "A", "B", "Y", "C", "Z"];
		const result = diffLines(baseline, current);

		const added = result.filter((e) => e.type === "added");
		expect(added.length).toBe(3);
		expect(added.map((e) => e.after)).toEqual(["X", "Y", "Z"]);
	});

	test("handles empty baseline (all lines are added)", () => {
		const result = diffLines([], ["A", "B"]);
		expect(result.every((e) => e.type === "added")).toBe(true);
		expect(result.length).toBe(2);
	});

	test("handles empty current (all lines are deleted)", () => {
		const result = diffLines(["A", "B"], []);
		expect(result.every((e) => e.type === "deleted")).toBe(true);
		expect(result.length).toBe(2);
	});

	test("handles both documents empty", () => {
		const result = diffLines([], []);
		expect(result).toEqual([]);
	});

	test("produces no changes when reverted to original", () => {
		const original = ["line1", "line2", "line3"];
		const result = diffLines(original, [...original]);
		expect(result.every((e) => e.type === "unchanged")).toBe(true);
	});

	test("computes diff for 1000-line document under 50ms", () => {
		const baseline = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
		const current = [...baseline];
		current[250] = "modified line 250";
		current[500] = "modified line 500";
		current.splice(750, 0, "inserted line");

		const start = performance.now();
		const result = diffLines(baseline, current);
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(50);
		const changes = result.filter((e) => e.type !== "unchanged");
		expect(changes.length).toBe(3);
	});

	test("assigns correct 1-based line numbers in current document", () => {
		const baseline = ["A", "B", "C"];
		const current = ["A", "X", "B", "C"];
		const result = diffLines(baseline, current);

		expect(result.map((e) => e.line)).toEqual([1, 2, 3, 4]);
		expect(result[0]?.type).toBe("unchanged");
		expect(result[1]?.type).toBe("added");
		expect(result[2]?.type).toBe("unchanged");
		expect(result[3]?.type).toBe("unchanged");
	});

	test("handles deletion at end of document", () => {
		const baseline = ["A", "B", "C"];
		const current = ["A", "B"];
		const result = diffLines(baseline, current);

		const deleted = result.filter((e) => e.type === "deleted");
		expect(deleted.length).toBe(1);
		expect(deleted[0]?.before).toBe("C");
	});

	test("handles complex mixed operations", () => {
		const baseline = ["A", "B", "C", "D", "E"];
		const current = ["A", "B2", "X", "D", "E"];
		const result = diffLines(baseline, current);

		const changed = result.filter((e) => e.type !== "unchanged");
		expect(
			changed.some((e) => e.type === "modified" || e.type === "added"),
		).toBe(true);
		expect(
			result.filter((e) => e.type === "unchanged").length,
		).toBeGreaterThanOrEqual(2);
	});
});
