import { describe, expect, test } from "bun:test";
import {
	getLogicalStepDisplayId,
	getLogicalStepKey,
	isNamespacedLifecycleStep,
} from "../../../shared/logical-step.js";

describe("isNamespacedLifecycleStep", () => {
	test("returns false for non-namespaced steps", () => {
		expect(isNamespacedLifecycleStep("build")).toBe(false);
	});

	test("returns true for namespaced lifecycle steps", () => {
		expect(isNamespacedLifecycleStep("task-builder:building")).toBe(true);
		expect(isNamespacedLifecycleStep("task-builder:completed")).toBe(true);
	});

	test("treats namespaced sub-agent steps as lifecycle steps", () => {
		expect(isNamespacedLifecycleStep("task-builder:summary")).toBe(true);
	});
});

describe("getLogicalStepKey", () => {
	test("keeps plain steps unchanged", () => {
		expect(getLogicalStepKey("build")).toBe("build");
	});

	test("normalizes namespaced lifecycle steps to the namespace prefix", () => {
		expect(getLogicalStepKey("task-builder:building")).toBe("task-builder");
	});

	test("includes unit for namespaced lifecycle steps", () => {
		expect(getLogicalStepKey("task-builder:completed", "T1")).toBe(
			"task-builder::T1",
		);
	});

	test("does not include unit for plain steps", () => {
		expect(getLogicalStepKey("build", "T1")).toBe("build");
	});
});

describe("getLogicalStepDisplayId", () => {
	test("keeps plain steps unchanged", () => {
		expect(getLogicalStepDisplayId("build")).toBe("build");
	});

	test("uses the namespace prefix for lifecycle steps", () => {
		expect(getLogicalStepDisplayId("task-builder:building")).toBe(
			"task-builder",
		);
		expect(getLogicalStepDisplayId("task-builder:completed")).toBe(
			"task-builder",
		);
	});
});
