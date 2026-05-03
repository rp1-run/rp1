import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let importVersion = 0;

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

async function loadComponent() {
	return await import(
		`../../../components/v2/V2Header.tsx?v2-header-test=${++importVersion}`
	);
}

describe("V2Header", () => {
	afterEach(() => {
		cleanup();
	});

	test("renders branded identity separately from connection status", async () => {
		const { V2Header } = await loadComponent();

		render(<V2Header wsStatus="connected" />);

		const brand = screen.getByRole("img", { name: "RP1 Arcade" });
		const status = screen.getByRole("status", {
			name: "Connection status: connected",
		});

		expect(brand.getAttribute("src")).toBe("/rp1-mark-only-light.svg");
		expect(status.getAttribute("title")).toBe("Live updates active");
		expect(status.textContent).not.toContain("rp1");
		expect(
			screen.queryByLabelText("rp1 - Connection status: connected"),
		).toBeNull();
	});
});
