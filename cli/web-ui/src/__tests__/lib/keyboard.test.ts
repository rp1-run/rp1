import { describe, expect, test } from "bun:test";
import { isTextInputElement } from "../../lib/keyboard";

describe("isTextInputElement", () => {
	test("treats text-entry form controls as shortcut-blocking inputs", () => {
		for (const type of [
			"text",
			"password",
			"email",
			"search",
			"tel",
			"url",
			"number",
		]) {
			const input = document.createElement("input");
			input.type = type;

			expect(isTextInputElement(input)).toBe(true);
		}

		expect(isTextInputElement(document.createElement("textarea"))).toBe(true);
	});

	test("allows global shortcuts for non-text controls and ordinary elements", () => {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		const button = document.createElement("button");
		const panel = document.createElement("div");

		expect(isTextInputElement(checkbox)).toBe(false);
		expect(isTextInputElement(button)).toBe(false);
		expect(isTextInputElement(panel)).toBe(false);
		expect(isTextInputElement(null)).toBe(false);
	});

	test("blocks shortcuts from editable rich-text regions", () => {
		const editor = document.createElement("div");
		editor.contentEditable = "true";

		expect(isTextInputElement(editor)).toBe(true);
	});
});
