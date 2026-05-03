import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { IconRail } from "../../../components/v2/IconRail";

mock.module("@/providers/ThemeProvider", () => ({
	useTheme: () => ({
		theme: "dark",
		toggleTheme: mock(() => {}),
	}),
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
	Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe("IconRail", () => {
	afterEach(() => {
		cleanup();
	});

	test("uses the current RP1 mark for navigation identity", () => {
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
