import { describe, expect, test } from "bun:test";
import { calculatePopoverPosition, cn } from "../../lib/utils";

describe("cn", () => {
	test("merges conditional class names and resolves Tailwind conflicts", () => {
		expect(cn("px-2", false && "hidden", "px-4", ["text-fg"])).toBe(
			"px-4 text-fg",
		);
	});
});

describe("calculatePopoverPosition", () => {
	test("prefers the left side when the artifact sidebar leaves enough room", () => {
		expect(
			calculatePopoverPosition(
				{ left: 260, right: 320, top: 80, bottom: 100 },
				200,
				120,
				{ left: 0, right: 600, top: 0, bottom: 500 },
			),
		).toEqual({ x: 52, y: 80, side: "left" });
	});

	test("uses the right side when the left side is cramped", () => {
		expect(
			calculatePopoverPosition(
				{ left: 80, right: 140, top: 90, bottom: 110 },
				200,
				120,
				{ left: 0, right: 600, top: 0, bottom: 500 },
			),
		).toEqual({ x: 148, y: 90, side: "right" });
	});

	test("clamps fallback coordinates inside the container bounds", () => {
		expect(
			calculatePopoverPosition(
				{ left: 70, right: 120, top: 480, bottom: 500 },
				220,
				160,
				{ left: 20, right: 260, top: 40, bottom: 520 },
			),
		).toEqual({ x: 36, y: 344, side: "left" });
	});
});
