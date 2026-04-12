import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { V2Project } from "@/hooks/useProjects";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";

let importVersion = 0;

const projects: readonly V2Project[] = [
	{
		id: "proj-1",
		name: "Project One",
		path: "/repo/project-one",
		available: true,
		runCount: 3,
		lastActivityAt: "2026-04-12T00:00:00.000Z",
	},
];

mock.module("@/hooks/useProjects", () => ({
	useProjects: () => ({
		projects,
		isLoading: false,
		error: null,
		refetch: () => {},
	}),
}));

mock.module("@/hooks/useRuns", () => ({
	useRuns: () => ({
		runs: [],
	}),
}));

function LocationProbe() {
	const location = useLocation();
	return <span data-testid="location-probe">{location.pathname}</span>;
}

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(state));
}

async function renderProjectsPage(
	initialEntries: readonly string[] = ["/projects"],
) {
	const { ProjectsPage } = await import(
		`../../../pages/v2/ProjectsPage.tsx?projects-page-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<WorkspaceTabsProvider>
				<Routes>
					<Route
						path="/projects"
						element={
							<>
								<LocationProbe />
								<ProjectsPage />
							</>
						}
					/>
					<Route path="/projects/:projectId" element={<LocationProbe />} />
					<Route
						path="/projects/:projectId/files/*"
						element={<LocationProbe />}
					/>
					<Route path="/" element={<LocationProbe />} />
				</Routes>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("ProjectsPage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		mock.restore();
		sessionStorage.clear();
	});

	test("opens the selected project overview from the project row", async () => {
		await renderProjectsPage();

		fireEvent.click(screen.getByText("Project One").closest("button")!);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1",
			);
		});
	});

	test("reopens an existing files workspace from the files action", async () => {
		setStoredState({
			tabs: [
				{
					key: "files:proj-1",
					kind: "files",
					currentPath: "/projects/proj-1/files/src/index.ts",
					rootPath: "/projects/proj-1/files",
					title: "Project One files",
					subtitle: "index.ts",
					projectId: "proj-1",
					lastVisitedAt: 1,
				},
			],
			activeKey: null,
			lastDurableRoute: "/projects",
		});

		await renderProjectsPage();

		fireEvent.click(
			screen.getByRole("button", { name: "Files for Project One" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1/files/src/index.ts",
			);
		});
	});
});
