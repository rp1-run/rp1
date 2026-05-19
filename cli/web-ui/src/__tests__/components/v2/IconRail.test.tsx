import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

mock.module("@/providers/ThemeProvider", () => ({
	useTheme: () => ({
		theme: "dark",
		toggleTheme: mock(() => {}),
	}),
}));

describe("IconRail", () => {
	afterEach(() => {
		cleanup();
	});

	test("uses the current RP1 mark for navigation identity", async () => {
		const { IconRail } = await import(
			"../../../components/v2/IconRail.tsx?icon-rail-test"
		);

		render(
			<MemoryRouter>
				<IconRail />
			</MemoryRouter>,
		);

		const homeLink = screen.getByRole("link", { name: "RP1 home" });
		const mark = homeLink.querySelector("img");

		expect(mark?.getAttribute("src")).toBe("/rp1-mark-only-light.svg");
		expect(homeLink.textContent).not.toContain("rp1");
	});
});
