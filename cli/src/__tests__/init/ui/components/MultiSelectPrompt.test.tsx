/**
 * Unit tests for MultiSelectPrompt component.
 * Tests rendering, default selection state, checkbox display, and
 * re-render stability (regression for event-loop freeze on state updates).
 *
 * NOTE: Keyboard interaction tests (space toggle, enter submit) are omitted
 * because ink-testing-library's stdin simulation doesn't reliably trigger
 * Ink's useInput hook (same limitation as SelectPrompt tests).
 *
 * These tests focus on:
 * - Component rendering (items display correctly)
 * - Default selection state (checked/unchecked indicators)
 * - Navigation hint display
 * - Edge cases (single item, empty defaults, all defaults)
 * - Re-render stability with changing props
 */

import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import {
	type MultiSelectItem,
	MultiSelectPrompt,
} from "../../../../init/ui/components/MultiSelectPrompt.js";

describe("MultiSelectPrompt", () => {
	describe("basic rendering", () => {
		test("renders prompt message", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select harnesses"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Select harnesses");
		});

		test("renders all items", () => {
			const items: MultiSelectItem[] = [
				{ value: "claude", label: "Claude Code" },
				{ value: "codex", label: "Codex" },
				{ value: "copilot", label: "Copilot" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Claude Code");
			expect(output).toContain("Codex");
			expect(output).toContain("Copilot");
		});

		test("shows multi-select navigation hint", () => {
			const items: MultiSelectItem[] = [{ value: "a", label: "Item A" }];

			const { lastFrame } = render(
				<MultiSelectPrompt message="Test" items={items} onSubmit={() => {}} />,
			);
			const output = lastFrame();

			expect(output).toContain("Space");
			expect(output).toContain("toggle");
			expect(output).toContain("Enter");
			expect(output).toContain("confirm");
		});
	});

	describe("default selection state", () => {
		test("items are unchecked when no defaultSelected provided", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame() ?? "";

			// checkboxOff = ☐, checkboxOn = ☒
			// With no defaults, no items should show checkboxOn
			expect(output).not.toContain("☒"); // ☒
		});

		test("defaultSelected items are pre-checked", () => {
			const items: MultiSelectItem[] = [
				{ value: "claude", label: "Claude Code" },
				{ value: "codex", label: "Codex" },
				{ value: "copilot", label: "Copilot" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					defaultSelected={["claude", "copilot"]}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame() ?? "";

			// Count checked checkboxes - should be 2
			const checkedCount = (output.match(/☒/g) || []).length;
			expect(checkedCount).toBe(2);

			// Count unchecked checkboxes - should be 1
			const uncheckedCount = (output.match(/☐/g) || []).length;
			expect(uncheckedCount).toBe(1);
		});

		test("all items pre-checked when all in defaultSelected", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					defaultSelected={["a", "b"]}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame() ?? "";

			const checkedCount = (output.match(/☒/g) || []).length;
			expect(checkedCount).toBe(2);
			expect(output).not.toContain("☐"); // no unchecked
		});
	});

	describe("focus and description", () => {
		test("first item is focused by default", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A", description: "Desc A" },
				{ value: "b", label: "Item B", description: "Desc B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			// Only focused item's description is shown
			expect(output).toContain("Desc A");
			expect(output).not.toContain("Desc B");
		});

		test("items without descriptions render without error", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Item A");
			expect(output).toContain("Item B");
		});
	});

	describe("edge cases", () => {
		test("handles single item", () => {
			const items: MultiSelectItem[] = [
				{ value: "only", label: "Only Item", description: "The only choice" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Only Item");
			expect(output).toContain("The only choice");
		});

		test("handles many items", () => {
			const items: MultiSelectItem[] = Array.from({ length: 8 }, (_, i) => ({
				value: `item-${i}`,
				label: `Item ${i + 1}`,
			}));

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame();

			for (let i = 1; i <= 8; i++) {
				expect(output).toContain(`Item ${i}`);
			}
		});

		test("ignores defaultSelected values not in items", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					defaultSelected={["a", "nonexistent"]}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame() ?? "";

			// Only "a" should be checked (1 checked checkbox)
			const checkedCount = (output.match(/☒/g) || []).length;
			expect(checkedCount).toBe(1);
		});

		test("empty defaultSelected array works like no defaults", () => {
			const items: MultiSelectItem[] = [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame } = render(
				<MultiSelectPrompt
					message="Select"
					items={items}
					defaultSelected={[]}
					onSubmit={() => {}}
				/>,
			);
			const output = lastFrame() ?? "";

			expect(output).not.toContain("☒");
		});
	});

	describe("re-render stability", () => {
		test("survives parent re-render with new items array reference", () => {
			const makeItems = (): MultiSelectItem[] => [
				{ value: "a", label: "Item A" },
				{ value: "b", label: "Item B" },
			];

			const { lastFrame, rerender } = render(
				<MultiSelectPrompt
					message="Select"
					items={makeItems()}
					defaultSelected={["a"]}
					onSubmit={() => {}}
				/>,
			);

			const first = lastFrame() ?? "";
			expect(first).toContain("Item A");

			rerender(
				<MultiSelectPrompt
					message="Select"
					items={makeItems()}
					defaultSelected={["a"]}
					onSubmit={() => {}}
				/>,
			);

			const second = lastFrame() ?? "";
			expect(second).toContain("Item A");
			expect(second).toContain("Item B");

			const checkedCount = (second.match(/☒/g) || []).length;
			expect(checkedCount).toBe(1);
		});

		test("preserves selection state across re-renders with new prop references", () => {
			const items: MultiSelectItem[] = [
				{ value: "x", label: "X" },
				{ value: "y", label: "Y" },
			];

			const { lastFrame, rerender } = render(
				<MultiSelectPrompt
					message="Pick"
					items={[...items]}
					defaultSelected={["x", "y"]}
					onSubmit={() => {}}
				/>,
			);

			const before = lastFrame() ?? "";
			const checkedBefore = (before.match(/☒/g) || []).length;
			expect(checkedBefore).toBe(2);

			rerender(
				<MultiSelectPrompt
					message="Pick"
					items={[...items]}
					defaultSelected={["x", "y"]}
					onSubmit={() => {}}
				/>,
			);

			const after = lastFrame() ?? "";
			const checkedAfter = (after.match(/☒/g) || []).length;
			expect(checkedAfter).toBe(2);
		});
	});
});
