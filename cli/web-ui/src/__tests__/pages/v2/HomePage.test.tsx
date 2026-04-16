import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";

let importVersion = 0;

function installHomePageMocks() {
	mock.module("@/hooks/useFeed", () => ({
		useFeed: () => ({
			items: [
				{
					id: "run-1",
					run: {
						id: "run-1",
						name: "Build One",
						command: "/build-fast",
						status: "running",
						harness: "codex",
						startedAt: "2026-04-12T00:00:00.000Z",
						lastEventAt: "2026-04-12T00:05:00.000Z",
						projectId: "proj-1",
						projectName: "Project One",
					},
				},
			],
			total: 1,
			isLoading: false,
		}),
	}));

	mock.module("@/hooks/usePrefersReducedMotion", () => ({
		usePrefersReducedMotion: () => true,
	}));

	mock.module("@/components/v2/FilterBar", () => ({
		FilterBar: () => <div data-testid="filter-bar" />,
	}));

	mock.module("@/components/v2/HarnessIcon", () => ({
		HarnessIcon: () => <span data-testid="harness-icon" />,
	}));

	mock.module("framer-motion", () => ({
		motion: new Proxy(
			{},
			{
				get(_target: object, prop: string) {
					return ({
						children,
						...props
					}: Record<string, unknown> & { children?: ReactNode }) =>
						createElement(prop, props, children);
				},
			},
		),
		AnimatePresence: ({ children }: { children?: ReactNode }) => children,
	}));
}

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	localStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(state));
}

function LocationProbe() {
	const location = useLocation();
	return (
		<span data-testid="location-probe">
			{location.pathname}
			{location.search}
		</span>
	);
}

async function renderHomePage() {
	installHomePageMocks();

	const { HomePage } = await import(
		`../../../pages/v2/HomePage.tsx?home-page-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={["/"]}>
			<WorkspaceTabsProvider>
				<Routes>
					<Route
						path="/"
						element={
							<>
								<LocationProbe />
								<HomePage />
							</>
						}
					/>
					<Route path="/runs/:runId/*" element={<LocationProbe />} />
					<Route path="/projects/:projectId" element={<LocationProbe />} />
				</Routes>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("HomePage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		mock.restore();
		localStorage.clear();
	});

	test("reopens an existing run workspace from the activity feed entry", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1/step/build/artifact/doc-1",
					rootPath: "/runs/run-1",
					title: "Build One",
					subtitle: "Project One",
					projectId: "proj-1",
					lastVisitedAt: 1,
				},
			],
			activeKey: null,
			lastDurableRoute: "/",
		});

		await renderHomePage();

		fireEvent.click(screen.getByText("Build One").closest('[role="button"]')!);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1/step/build/artifact/doc-1",
			);
		});
	});

	test("reopens an existing project workspace from the feed project action", async () => {
		setStoredState({
			tabs: [
				{
					key: "project:proj-1",
					kind: "project",
					currentPath: "/projects/proj-1?view=summary",
					rootPath: "/projects/proj-1",
					title: "Project One",
					subtitle: null,
					projectId: "proj-1",
					lastVisitedAt: 1,
				},
			],
			activeKey: null,
			lastDurableRoute: "/",
		});

		await renderHomePage();

		fireEvent.click(
			screen.getByRole("button", { name: "Open project Project One" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1?view=summary",
			);
		});
	});
});
