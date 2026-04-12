import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	BreadcrumbProvider,
	useBreadcrumbContext,
} from "@/hooks/useBreadcrumbContext";
import { useWorkspaceDescriptor } from "@/hooks/useWorkspaceDescriptor";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";

mock.module("@/components/v2/HarnessIcon", () => ({
	HarnessIcon: () => <span data-testid="harness-icon" />,
}));

let importVersion = 0;

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(state));
}

function LocationProbe() {
	const location = useLocation();
	return <span data-testid="location-probe">{location.pathname}</span>;
}

function RunWorkspace() {
	const { setProject, setRunInfo } = useBreadcrumbContext();

	useWorkspaceDescriptor({
		title: "Build One",
		subtitle: "Project One",
		projectId: "proj-1",
	});

	useEffect(() => {
		setProject("proj-1", "Project One");
		setRunInfo({
			startedAt: "2026-04-12T00:00:00.000Z",
			harness: "codex",
			command: "/build-fast",
			displayName: "Build One",
			projectName: "Project One",
			projectId: "proj-1",
		});

		return () => {
			setRunInfo(null);
			setProject(null, null);
		};
	}, [setProject, setRunInfo]);

	return <LocationProbe />;
}

function ProjectWorkspace() {
	const { setProject, setRunInfo } = useBreadcrumbContext();

	useWorkspaceDescriptor({
		title: "Project One",
		subtitle: "/repo/project-one",
		projectId: "proj-1",
	});

	useEffect(() => {
		setRunInfo(null);
		setProject("proj-1", "Project One");

		return () => {
			setProject(null, null);
		};
	}, [setProject, setRunInfo]);

	return <LocationProbe />;
}

async function renderShell(initialEntries: readonly string[]) {
	const { TerminalBreadcrumb } = await import(
		`../../../components/v2/TerminalBreadcrumb.tsx?workspace-shell-test=${++importVersion}`
	);
	const { WorkspaceTabStrip } = await import(
		`../../../components/v2/WorkspaceTabStrip.tsx?workspace-shell-test=${importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<BreadcrumbProvider>
				<WorkspaceTabsProvider>
					<TerminalBreadcrumb />
					<WorkspaceTabStrip />
					<Routes>
						<Route path="/runs/:runId/*" element={<RunWorkspace />} />
						<Route path="/projects/:projectId" element={<ProjectWorkspace />} />
						<Route path="/projects" element={<LocationProbe />} />
					</Routes>
				</WorkspaceTabsProvider>
			</BreadcrumbProvider>
		</MemoryRouter>,
	);
}

describe("workspace shell integration", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		sessionStorage.clear();
	});

	test("keeps breadcrumb chrome synchronized with the active workspace tab", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Build One",
					subtitle: "Project One",
					projectId: "proj-1",
					lastVisitedAt: 1,
				},
				{
					key: "project:proj-1",
					kind: "project",
					currentPath: "/projects/proj-1",
					rootPath: "/projects/proj-1",
					title: "Project One",
					subtitle: "/repo/project-one",
					projectId: "proj-1",
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		await renderShell(["/runs/run-1"]);

		await waitFor(() => {
			expect(screen.getByRole("navigation", { name: "Run info" })).toBeTruthy();
		});
		expect(screen.getByTestId("location-probe").textContent).toBe(
			"/runs/run-1",
		);
		expect(screen.getByText("/build-fast")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Build One, Project One" }),
		).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Project One, /repo/project-one" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1",
			);
		});
		expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
		expect(screen.getByRole("link", { name: /Project One/i })).toBeTruthy();
		expect(screen.queryByRole("navigation", { name: "Run info" })).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: "Build One, Project One" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1",
			);
		});
		expect(screen.getByRole("navigation", { name: "Run info" })).toBeTruthy();
		expect(screen.getByText("/build-fast")).toBeTruthy();
	});
});
