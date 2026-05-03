import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FilterBar } from "@/components/v2/FilterBar";
import type { RunsFilter } from "@/types/runs";

describe("FilterBar", () => {
	beforeEach(() => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ projects: [] }),
			}),
		) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("renders compact view tabs and named filter dropdowns", async () => {
		const filters: RunsFilter = {
			view: "relevant",
			status: "all",
			projectId: null,
			dateRange: "all",
		};

		render(<FilterBar filters={filters} onFiltersChange={mock(() => {})} />);

		expect(screen.getByRole("tab", { name: "Relevant" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
		expect(screen.queryByRole("tab", { name: "Running" })).toBeNull();
		expect(screen.queryByRole("tab", { name: "Cancelled" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Filter by status" }).textContent,
		).toContain("Status");
		expect(
			screen.getByRole("button", { name: "Filter by project" }).textContent,
		).toContain("Project");
		expect(
			screen.getByRole("button", { name: "Filter by time" }).textContent,
		).toContain("Time");
		await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
	});
});
