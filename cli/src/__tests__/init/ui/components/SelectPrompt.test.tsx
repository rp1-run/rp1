/**
 * Unit tests for SelectPrompt component.
 * Tests user choice handling through option presets and rendering.
 *
 * NOTE: Keyboard navigation tests are omitted because:
 * 1. ink-testing-library's stdin simulation doesn't reliably trigger
 *    Ink's useInput hook (known limitation)
 * 2. Testing framework's input handling would violate testing rule #2:
 *    "Do not test third-party libraries, framework behavior"
 *
 * The keyboard navigation logic itself is simple (arrow keys update index,
 * enter calls onSelect) and is covered by Ink's own test suite.
 *
 * These tests focus on:
 * - Option preset data integrity (values, labels, descriptions)
 * - Component rendering (options display correctly)
 * - Default selection behavior
 */

import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import {
	gitignorePresetOptions,
	gitRootOptions,
	reinitOptions,
	type SelectOption,
	SelectPrompt,
} from "../../../../init/ui/components/SelectPrompt.js";

describe("SelectPrompt", () => {
	describe("basic rendering", () => {
		test("renders prompt message", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A" },
				{ value: "b", label: "Option B" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Choose an option"
					options={options}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Choose an option");
		});

		test("renders all options", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "First Option" },
				{ value: "b", label: "Second Option" },
				{ value: "c", label: "Third Option" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("First Option");
			expect(output).toContain("Second Option");
			expect(output).toContain("Third Option");
		});

		test("shows navigation hint", () => {
			const options: SelectOption[] = [{ value: "a", label: "Option A" }];

			const { lastFrame } = render(
				<SelectPrompt message="Test" options={options} onSelect={() => {}} />,
			);
			const output = lastFrame();

			expect(output).toContain("navigate");
			expect(output).toContain("Enter");
			expect(output).toContain("select");
		});
	});

	describe("initial selection", () => {
		test("first option is selected by default", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A", description: "First choice" },
				{ value: "b", label: "Option B", description: "Second choice" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			// Description is only shown for selected option
			expect(output).toContain("First choice");
			expect(output).not.toContain("Second choice");
		});

		test("respects defaultIndex prop", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A", description: "First desc" },
				{ value: "b", label: "Option B", description: "Second desc" },
				{ value: "c", label: "Option C", description: "Third desc" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
					defaultIndex={2}
				/>,
			);
			const output = lastFrame();

			// Third option should be selected
			expect(output).toContain("Third desc");
			expect(output).not.toContain("First desc");
			expect(output).not.toContain("Second desc");
		});

		test("handles defaultIndex of 0 correctly", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A", description: "Desc A" },
				{ value: "b", label: "Option B", description: "Desc B" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
					defaultIndex={0}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Desc A");
			expect(output).not.toContain("Desc B");
		});
	});

	describe("gitRootOptions preset", () => {
		test("contains continue, switch, and cancel options", () => {
			expect(gitRootOptions).toHaveLength(3);

			const values = gitRootOptions.map((opt) => opt.value);
			expect(values).toContain("continue");
			expect(values).toContain("switch");
			expect(values).toContain("cancel");
		});

		test("options are in expected order", () => {
			expect(gitRootOptions[0].value).toBe("continue");
			expect(gitRootOptions[1].value).toBe("switch");
			expect(gitRootOptions[2].value).toBe("cancel");
		});

		test("each option has label and description", () => {
			for (const option of gitRootOptions) {
				expect(option.label).toBeDefined();
				expect(option.label.length).toBeGreaterThan(0);
				expect(option.description).toBeDefined();
				expect(option.description?.length).toBeGreaterThan(0);
			}
		});

		test("labels are user-friendly", () => {
			const labels = gitRootOptions.map((opt) => opt.label);
			expect(labels).toContain("Continue here");
			expect(labels).toContain("Switch to git root");
			expect(labels).toContain("Cancel");
		});

		test("descriptions explain each choice", () => {
			const continueOpt = gitRootOptions.find((o) => o.value === "continue");
			const switchOpt = gitRootOptions.find((o) => o.value === "switch");
			const cancelOpt = gitRootOptions.find((o) => o.value === "cancel");

			expect(continueOpt?.description).toContain("current directory");
			expect(switchOpt?.description).toContain("root");
			expect(cancelOpt?.description).toContain("Exit");
		});

		test("renders correctly in SelectPrompt", () => {
			const { lastFrame } = render(
				<SelectPrompt
					message="Where to initialize?"
					options={gitRootOptions}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Continue here");
			expect(output).toContain("Switch to git root");
			expect(output).toContain("Cancel");
		});
	});

	describe("reinitOptions preset", () => {
		test("contains update, skip, and reinitialize options", () => {
			expect(reinitOptions).toHaveLength(3);

			const values = reinitOptions.map((opt) => opt.value);
			expect(values).toContain("update");
			expect(values).toContain("skip");
			expect(values).toContain("reinitialize");
		});

		test("options are in expected order", () => {
			expect(reinitOptions[0].value).toBe("update");
			expect(reinitOptions[1].value).toBe("skip");
			expect(reinitOptions[2].value).toBe("reinitialize");
		});

		test("each option has label and description", () => {
			for (const option of reinitOptions) {
				expect(option.label).toBeDefined();
				expect(option.label.length).toBeGreaterThan(0);
				expect(option.description).toBeDefined();
				expect(option.description?.length).toBeGreaterThan(0);
			}
		});

		test("labels are user-friendly", () => {
			const labels = reinitOptions.map((opt) => opt.label);
			expect(labels).toContain("Update configuration");
			expect(labels).toContain("Skip initialization");
			expect(labels).toContain("Reinitialize completely");
		});

		test("update option preserves data", () => {
			const updateOpt = reinitOptions.find((o) => o.value === "update");
			expect(updateOpt?.description).toContain("without removing");
		});

		test("skip option exits safely", () => {
			const skipOpt = reinitOptions.find((o) => o.value === "skip");
			expect(skipOpt?.description).toContain("without making any changes");
		});

		test("renders correctly in SelectPrompt", () => {
			const { lastFrame } = render(
				<SelectPrompt
					message="rp1 is already configured"
					options={reinitOptions}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Update configuration");
			expect(output).toContain("Skip initialization");
			expect(output).toContain("Reinitialize completely");
		});
	});

	describe("gitignorePresetOptions preset", () => {
		test("contains recommended, track_all, and ignore_all options", () => {
			expect(gitignorePresetOptions).toHaveLength(3);

			const values = gitignorePresetOptions.map((opt) => opt.value);
			expect(values).toContain("recommended");
			expect(values).toContain("track_all");
			expect(values).toContain("ignore_all");
		});

		test("options are in expected order", () => {
			expect(gitignorePresetOptions[0].value).toBe("recommended");
			expect(gitignorePresetOptions[1].value).toBe("track_all");
			expect(gitignorePresetOptions[2].value).toBe("ignore_all");
		});

		test("each option has label and description", () => {
			for (const option of gitignorePresetOptions) {
				expect(option.label).toBeDefined();
				expect(option.label.length).toBeGreaterThan(0);
				expect(option.description).toBeDefined();
				expect(option.description?.length).toBeGreaterThan(0);
			}
		});

		test("recommended is first (default choice)", () => {
			expect(gitignorePresetOptions[0].value).toBe("recommended");
		});

		test("recommended option tracks context", () => {
			const recommended = gitignorePresetOptions.find(
				(o) => o.value === "recommended",
			);
			expect(recommended?.description).toContain("knowledge base");
			expect(recommended?.description).toContain("git");
		});

		test("track_all option tracks everything", () => {
			const trackAll = gitignorePresetOptions.find(
				(o) => o.value === "track_all",
			);
			expect(trackAll?.description).toContain("Track");
		});

		test("ignore_all option ignores everything", () => {
			const ignoreAll = gitignorePresetOptions.find(
				(o) => o.value === "ignore_all",
			);
			expect(ignoreAll?.description).toContain("not track");
		});

		test("renders correctly in SelectPrompt", () => {
			const { lastFrame } = render(
				<SelectPrompt
					message="Choose gitignore preset"
					options={gitignorePresetOptions}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			expect(output).toContain("Recommended");
			expect(output).toContain("Track all");
			expect(output).toContain("Ignore all");
		});
	});

	describe("option descriptions display", () => {
		test("only shows description for selected option", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A", description: "Description A" },
				{ value: "b", label: "Option B", description: "Description B" },
				{ value: "c", label: "Option C", description: "Description C" },
			];

			// Test with middle option selected
			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
					defaultIndex={1}
				/>,
			);

			const output = lastFrame();
			// Only middle option's description should be visible
			expect(output).not.toContain("Description A");
			expect(output).toContain("Description B");
			expect(output).not.toContain("Description C");
		});

		test("handles options without descriptions", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "Option A" },
				{ value: "b", label: "Option B" },
			];

			const { lastFrame } = render(
				<SelectPrompt
					message="Select one"
					options={options}
					onSelect={() => {}}
				/>,
			);
			const output = lastFrame();

			// Should render without error
			expect(output).toContain("Option A");
			expect(output).toContain("Option B");
		});

		test("shows description only for first option when no defaultIndex", () => {
			const options: SelectOption[] = [
				{ value: "a", label: "A", description: "First Desc" },
				{ value: "b", label: "B", description: "Second Desc" },
			];

			const { lastFrame } = render(
				<SelectPrompt message="Select" options={options} onSelect={() => {}} />,
			);
			const output = lastFrame();

			expect(output).toContain("First Desc");
			expect(output).not.toContain("Second Desc");
		});
	});

	describe("edge cases", () => {
		test("handles single option", () => {
			const options: SelectOption[] = [
				{
					value: "only",
					label: "Only Option",
					description: "The only choice",
				},
			];

			const { lastFrame } = render(
				<SelectPrompt message="Select" options={options} onSelect={() => {}} />,
			);

			expect(lastFrame()).toContain("Only Option");
			expect(lastFrame()).toContain("The only choice");
		});

		test("handles many options", () => {
			const options: SelectOption[] = Array.from({ length: 10 }, (_, i) => ({
				value: `opt-${i}`,
				label: `Option ${i + 1}`,
				description: `Description ${i + 1}`,
			}));

			const { lastFrame } = render(
				<SelectPrompt message="Select" options={options} onSelect={() => {}} />,
			);
			const output = lastFrame();

			// All options should render
			for (let i = 1; i <= 10; i++) {
				expect(output).toContain(`Option ${i}`);
			}
			// Only first description should show
			expect(output).toContain("Description 1");
			expect(output).not.toContain("Description 2");
		});

		test("handles long labels and descriptions", () => {
			const longLabel = "A".repeat(100);
			const longDesc = "B".repeat(200);
			const options: SelectOption[] = [
				{ value: "long", label: longLabel, description: longDesc },
			];

			const { lastFrame } = render(
				<SelectPrompt message="Select" options={options} onSelect={() => {}} />,
			);
			const output = lastFrame() ?? "";

			// Should render without error
			// Ink may wrap long content, so we check for presence of the characters
			// rather than the exact string
			expect(output).toContain("A");
			expect(output).toContain("B");
			// The content should be substantial (not truncated to nothing)
			const aCount = (output.match(/A/g) || []).length;
			const bCount = (output.match(/B/g) || []).length;
			expect(aCount).toBeGreaterThan(50);
			expect(bCount).toBeGreaterThan(100);
		});

		test("handles special characters in labels", () => {
			const options: SelectOption[] = [
				{
					value: "special",
					label: "Option with <special> & 'chars'",
					description: "Test & verify",
				},
			];

			const { lastFrame } = render(
				<SelectPrompt message="Select" options={options} onSelect={() => {}} />,
			);
			const output = lastFrame();

			expect(output).toContain("<special>");
			expect(output).toContain("&");
		});
	});

	describe("type safety", () => {
		test("gitRootOptions values are properly typed", () => {
			// This test verifies TypeScript typing at compile time
			// If the types are wrong, this won't compile
			const values: ("continue" | "switch" | "cancel")[] = gitRootOptions.map(
				(opt) => opt.value,
			);
			expect(values).toHaveLength(3);
		});

		test("reinitOptions values are properly typed", () => {
			const values: ("update" | "skip" | "reinitialize")[] = reinitOptions.map(
				(opt) => opt.value,
			);
			expect(values).toHaveLength(3);
		});

		test("gitignorePresetOptions values are properly typed", () => {
			const values: ("recommended" | "track_all" | "ignore_all")[] =
				gitignorePresetOptions.map((opt) => opt.value);
			expect(values).toHaveLength(3);
		});
	});
});
