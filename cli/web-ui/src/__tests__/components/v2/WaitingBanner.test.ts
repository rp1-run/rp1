import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { WaitingBanner } from "../../../components/v2/WaitingBanner";

// Mock usePrefersReducedMotion to return true (skip animations in test)
mock.module("@/hooks/usePrefersReducedMotion", () => ({
	usePrefersReducedMotion: () => true,
}));

// Mock framer-motion to render plain elements instead of animated ones
mock.module("framer-motion", () => ({
	motion: new Proxy(
		{},
		{
			get(_target: object, prop: string) {
				return ({
					children,
					...props
				}: Record<string, unknown> & { children?: unknown }) => {
					// Strip framer-motion specific props, keep DOM-valid ones
					const domProps: Record<string, unknown> = {};
					const validProps = [
						"role",
						"aria-label",
						"className",
						"id",
						"style",
						"data-testid",
					];
					for (const key of validProps) {
						if (key in props) {
							domProps[key] = props[key];
						}
					}
					return createElement(
						prop as string,
						domProps,
						children as React.ReactNode,
					);
				};
			},
		},
	),
	AnimatePresence: ({ children }: { children?: unknown }) => children,
}));

describe("WaitingBanner", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	test("renders prompt text as visible content", () => {
		const prompt = "Should I proceed with the database migration?";
		render(createElement(WaitingBanner, { prompt }));

		expect(screen.getByText(prompt)).toBeTruthy();
	});

	test("has role='alert' for accessibility", () => {
		const prompt = "Approve schema change?";
		render(createElement(WaitingBanner, { prompt }));

		const alert = screen.getByRole("alert");
		expect(alert).toBeTruthy();
	});

	test("sets aria-label combining status label and prompt", () => {
		const prompt = "Please review the generated code before continuing.";
		render(createElement(WaitingBanner, { prompt }));

		const alert = screen.getByRole("alert");
		expect(alert.getAttribute("aria-label")).toBe(`Waiting: ${prompt}`);
	});

	test("renders context text when provided", () => {
		const prompt = "Approve schema change?";
		const context = "The migration adds a new index on the users table.";
		render(createElement(WaitingBanner, { prompt, context }));

		expect(screen.getByText(context)).toBeTruthy();
	});

	test("applies waiting-status styling classes", () => {
		const prompt = "Review needed";
		render(createElement(WaitingBanner, { prompt }));

		const alert = screen.getByRole("alert");
		const classes = alert.className;
		expect(classes).toContain("border-status-waiting");
		expect(classes).toContain("bg-status-waiting/15");
		expect(classes).toContain("border-l-4");
	});
});
