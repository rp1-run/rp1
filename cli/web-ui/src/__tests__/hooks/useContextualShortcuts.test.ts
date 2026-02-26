import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
	isTextInputElement,
	useContextualShortcuts,
} from "../../hooks/useContextualShortcuts";
import { ShortcutRegistryProvider } from "../../providers/ShortcutRegistryProvider";

function wrapper({ children }: { children: ReactNode }) {
	return createElement(ShortcutRegistryProvider, null, children);
}

function fireKeydown(key: string, options: Partial<KeyboardEvent> = {}) {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	});
	document.dispatchEvent(event);
	return event;
}

describe("isTextInputElement", () => {
	test("returns false for null", () => {
		expect(isTextInputElement(null)).toBe(false);
	});

	test("returns true for text input", () => {
		const input = document.createElement("input");
		input.type = "text";
		document.body.appendChild(input);
		expect(isTextInputElement(input)).toBe(true);
		input.remove();
	});

	test("returns true for search input", () => {
		const input = document.createElement("input");
		input.type = "search";
		document.body.appendChild(input);
		expect(isTextInputElement(input)).toBe(true);
		input.remove();
	});

	test("returns false for checkbox input", () => {
		const input = document.createElement("input");
		input.type = "checkbox";
		document.body.appendChild(input);
		expect(isTextInputElement(input)).toBe(false);
		input.remove();
	});

	test("returns true for textarea", () => {
		const textarea = document.createElement("textarea");
		document.body.appendChild(textarea);
		expect(isTextInputElement(textarea)).toBe(true);
		textarea.remove();
	});

	test("returns true for contentEditable element", () => {
		const div = document.createElement("div");
		div.contentEditable = "true";
		document.body.appendChild(div);
		expect(isTextInputElement(div)).toBe(true);
		div.remove();
	});

	test("returns false for regular div", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		expect(isTextInputElement(div)).toBe(false);
		div.remove();
	});
});

describe("useContextualShortcuts", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	test("fires action when matching key is pressed", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "f", label: "Filter", description: "Focus filter", action },
		];

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("f");
		});

		expect(action).toHaveBeenCalledTimes(1);
	});

	test("does not fire action for non-matching key", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "f", label: "Filter", description: "Focus filter", action },
		];

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("x");
		});

		expect(action).toHaveBeenCalledTimes(0);
	});

	test("suppresses shortcuts when text input is focused", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "f", label: "Filter", description: "Focus filter", action },
		];

		const input = document.createElement("input");
		input.type = "text";
		document.body.appendChild(input);
		input.focus();

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("f");
		});

		expect(action).toHaveBeenCalledTimes(0);
		input.remove();
	});

	test("suppresses shortcuts when textarea is focused", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "s", label: "Sort", description: "Open sort", action },
		];

		const textarea = document.createElement("textarea");
		document.body.appendChild(textarea);
		textarea.focus();

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("s");
		});

		expect(action).toHaveBeenCalledTimes(0);
		textarea.remove();
	});

	test("ignores shortcuts with modifier keys", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "f", label: "Filter", description: "Focus filter", action },
		];

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("f", { metaKey: true });
		});

		expect(action).toHaveBeenCalledTimes(0);

		act(() => {
			fireKeydown("f", { ctrlKey: true });
		});

		expect(action).toHaveBeenCalledTimes(0);

		act(() => {
			fireKeydown("f", { altKey: true });
		});

		expect(action).toHaveBeenCalledTimes(0);
	});

	test("does not fire when disabled", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "f", label: "Filter", description: "Focus filter", action },
		];

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
					enabled: false,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("f");
		});

		expect(action).toHaveBeenCalledTimes(0);
	});

	test("cleans up listener on unmount", () => {
		const action = mock(() => {});
		const shortcuts = [
			{ key: "r", label: "Refresh", description: "Refresh data", action },
		];

		const { unmount } = renderHook(
			() =>
				useContextualShortcuts({
					viewId: "test-view",
					viewLabel: "Test View",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("r");
		});
		expect(action).toHaveBeenCalledTimes(1);

		unmount();

		act(() => {
			fireKeydown("r");
		});
		expect(action).toHaveBeenCalledTimes(1);
	});

	test("registers multiple shortcuts", () => {
		const filterAction = mock(() => {});
		const sortAction = mock(() => {});
		const refreshAction = mock(() => {});
		const shortcuts = [
			{
				key: "f",
				label: "Filter",
				description: "Focus filter",
				action: filterAction,
			},
			{
				key: "s",
				label: "Sort",
				description: "Open sort",
				action: sortAction,
			},
			{
				key: "r",
				label: "Refresh",
				description: "Refresh data",
				action: refreshAction,
			},
		];

		renderHook(
			() =>
				useContextualShortcuts({
					viewId: "runs-list",
					viewLabel: "Runs List",
					shortcuts,
				}),
			{ wrapper },
		);

		act(() => {
			fireKeydown("f");
		});
		act(() => {
			fireKeydown("s");
		});
		act(() => {
			fireKeydown("r");
		});

		expect(filterAction).toHaveBeenCalledTimes(1);
		expect(sortAction).toHaveBeenCalledTimes(1);
		expect(refreshAction).toHaveBeenCalledTimes(1);
	});
});
