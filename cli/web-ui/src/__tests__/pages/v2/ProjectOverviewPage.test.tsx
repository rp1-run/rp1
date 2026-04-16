import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";
import { liveRunIndex } from "@/lib/live-run-index";
import type { ShortcutRegistryData } from "@/providers/ShortcutRegistryProvider";
import {
	ShortcutRegistryProvider,
	useShortcutRegistry,
} from "@/providers/ShortcutRegistryProvider";

let importVersion = 0;
let latestRegistry: ShortcutRegistryData | null = null;

const breadcrumbApi = {
	setProject: mock(() => {}),
};

mock.module("@/hooks/useBreadcrumbContext", () => ({
	useBreadcrumbContext: () => breadcrumbApi,
}));

mock.module("@/hooks/useReconnectRecovery", () => ({
	useReconnectRecovery: () => {},
}));

mock.module("@/hooks/useLiveRunIndex", () => ({
	useLiveRunIndexBridge: () => {},
	useLiveRunIndexSnapshot: () =>
		useSyncExternalStore(
			liveRunIndex.subscribe,
			liveRunIndex.getSnapshot,
			liveRunIndex.getSnapshot,
		),
}));

mock.module("@/components/v2/RunCard", () => ({
	RunCard: ({
		children,
		onClick,
	}: {
		children?: ReactNode;
		onClick?: () => void;
	}) => (
		<button type="button" onClick={onClick}>
			{children ?? "Run"}
		</button>
	),
}));

function RegistryProbe() {
	latestRegistry = useShortcutRegistry();
	return null;
}

function LocationProbe() {
	const location = useLocation();
	return <span data-testid="location-probe">{location.pathname}</span>;
}

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	localStorage.setItem(
		WORKSPACE_TABS_STORAGE_KEY,
		JSON.stringify({ tabs: state.tabs }),
	);
	sessionStorage.setItem(
		"rp1-workspace-session:v1",
		JSON.stringify({
			activeKey: state.activeKey,
			lastDurableRoute: state.lastDurableRoute,
		}),
	);
}

async function renderProjectOverview(
	initialEntries: readonly string[] = ["/projects/proj-1"],
) {
	const { ProjectOverviewPage } = await import(
		`../../../pages/v2/ProjectOverviewPage.tsx?project-overview-test=${++importVersion}`
	);

	return renderProjectOverviewWithComponent(
		ProjectOverviewPage,
		initialEntries,
	);
}

function renderProjectOverviewWithComponent(
	ProjectOverviewPage: ComponentType,
	initialEntries: readonly string[] = ["/projects/proj-1"],
) {
	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<WorkspaceTabsProvider>
				<ShortcutRegistryProvider>
					<Routes>
						<Route
							path="/projects/:projectId"
							element={
								<>
									<RegistryProbe />
									<LocationProbe />
									<ProjectOverviewPage />
								</>
							}
						/>
						<Route
							path="/projects/:projectId/files/*"
							element={<LocationProbe />}
						/>
						<Route path="/runs/:runId/*" element={<LocationProbe />} />
					</Routes>
				</ShortcutRegistryProvider>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("ProjectOverviewPage", () => {
	beforeEach(() => {
		mock.restore();
		liveRunIndex.clear();
		document.body.innerHTML = "";
		localStorage.clear();
		sessionStorage.clear();
		latestRegistry = null;
		breadcrumbApi.setProject.mockClear();
		global.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/v2/projects/proj-1") && !url.includes("runs?")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "proj-1",
						name: "Project One",
						path: "/repo/project-one",
						available: true,
						runCount: 3,
						lastActivityAt: "2026-04-12T00:00:00.000Z",
					}),
				} satisfies Partial<Response>;
			}

			return {
				ok: true,
				status: 200,
				json: async () => ({
					runs: [],
					total: 0,
				}),
			} satisfies Partial<Response>;
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		liveRunIndex.clear();
		mock.restore();
	});

	test("publishes workspace metadata and registers workspace commands", async () => {
		await renderProjectOverview();

		expect(
			await screen.findByRole("heading", { name: "Project One" }),
		).toBeTruthy();
		expect(screen.getByText("/repo/project-one")).toBeTruthy();
		expect(breadcrumbApi.setProject).toHaveBeenCalledWith(
			"proj-1",
			"Project One",
		);
		expect(latestRegistry?.contextualShortcuts?.viewId).toBe(
			"project-overview",
		);
	});

	test("reopens an existing run workspace from recent runs", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1/step/build",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
			],
			activeKey: null,
			lastDurableRoute: "/projects",
		});
		global.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/v2/projects/proj-1") && !url.includes("runs?")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "proj-1",
						name: "Project One",
						path: "/repo/project-one",
						available: true,
						runCount: 3,
						lastActivityAt: "2026-04-12T00:00:00.000Z",
					}),
				} satisfies Partial<Response>;
			}

			return {
				ok: true,
				status: 200,
				json: async () => ({
					runs: [
						{
							id: "run-1",
							projectId: "proj-1",
							projectName: "Project One",
							featureId: "feat-1",
							featureName: "Feature One",
							name: "Run one",
							command: "/build",
							status: "running",
							harness: "codex",
							currentStep: null,
							steps: [],
							artifacts: [],
							events: [],
							startedAt: "2026-04-12T00:00:00.000Z",
							lastEventAt: "2026-04-12T00:00:00.000Z",
							completedAt: null,
							error: null,
							agentSteps: null,
						},
					],
					total: 1,
				}),
			} satisfies Partial<Response>;
		}) as unknown as typeof fetch;

		await renderProjectOverview();

		fireEvent.click(await screen.findByRole("button", { name: "Run" }));

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1/step/build",
			);
		});
	});

	test("reopens an existing files workspace from the browse files action", async () => {
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

		await renderProjectOverview();

		fireEvent.click(
			await screen.findByRole("button", { name: "Browse files" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1/files/src/index.ts",
			);
		});
	});

	test("reuses cached project data when the workspace remounts", async () => {
		const { ProjectOverviewPage } = await import(
			`../../../pages/v2/ProjectOverviewPage.tsx?project-overview-cache-test=${++importVersion}`
		);

		const firstRender = renderProjectOverviewWithComponent(ProjectOverviewPage);
		expect(
			await screen.findByRole("heading", { name: "Project One" }),
		).toBeTruthy();

		firstRender.unmount();

		global.fetch = mock(
			() => new Promise<Response>(() => {}),
		) as unknown as typeof fetch;

		renderProjectOverviewWithComponent(ProjectOverviewPage);

		expect(screen.getByRole("heading", { name: "Project One" })).toBeTruthy();
		expect(screen.queryByText("...")).toBeNull();
	});

	test("merges newly active project runs into the recent list without refetching", async () => {
		global.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/v2/projects/proj-1") && !url.includes("runs?")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "proj-1",
						name: "Project One",
						path: "/repo/project-one",
						available: true,
						runCount: 3,
						lastActivityAt: "2026-04-12T00:00:00.000Z",
					}),
				} satisfies Partial<Response>;
			}

			return {
				ok: true,
				status: 200,
				json: async () => ({
					runs: [
						{
							id: "run-1",
							projectId: "proj-1",
							projectName: "Project One",
							featureId: "feat-1",
							featureName: "Feature One",
							name: "Initial Run",
							command: "/build",
							status: "running",
							harness: "codex",
							currentStep: null,
							steps: [],
							artifacts: [],
							events: [],
							startedAt: "2026-04-12T00:00:00.000Z",
							lastEventAt: "2026-04-12T00:00:00.000Z",
							completedAt: null,
							error: null,
							agentSteps: null,
						},
					],
					total: 1,
				}),
			} satisfies Partial<Response>;
		}) as unknown as typeof fetch;

		const { ProjectOverviewPage } = await import(
			`../../../pages/v2/ProjectOverviewPage.tsx?project-overview-live-test=${++importVersion}`
		);
		renderProjectOverviewWithComponent(ProjectOverviewPage);

		expect(
			await screen.findByRole("heading", { name: "Project One" }),
		).toBeTruthy();
		expect(global.fetch).toHaveBeenCalledTimes(2);

		liveRunIndex.upsertRun({
			id: "run-2",
			projectId: "proj-1",
			projectName: "Project One",
			featureId: "feat-1",
			featureName: "Feature One",
			name: "Live Run",
			command: "/build",
			status: "running",
			harness: "codex",
			currentStep: null,
			steps: [],
			artifacts: [],
			events: [],
			startedAt: "2026-04-12T00:05:00.000Z",
			lastEventAt: "2026-04-12T00:05:00.000Z",
			completedAt: null,
			error: null,
			agentSteps: null,
		});

		await waitFor(() => {
			expect(screen.getByText("4 runs")).toBeTruthy();
		});
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("counts newly discovered older runs without replacing the project activity timestamp", async () => {
		global.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/v2/projects/proj-1") && !url.includes("runs?")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "proj-1",
						name: "Project One",
						path: "/repo/project-one",
						available: true,
						runCount: 3,
						lastActivityAt: "2026-04-12T00:00:00.000Z",
					}),
				} satisfies Partial<Response>;
			}

			return {
				ok: true,
				status: 200,
				json: async () => ({
					runs: [
						{
							id: "run-1",
							projectId: "proj-1",
							projectName: "Project One",
							featureId: "feat-1",
							featureName: "Feature One",
							name: "Initial Run",
							command: "/build",
							status: "running",
							harness: "codex",
							currentStep: null,
							steps: [],
							artifacts: [],
							events: [],
							startedAt: "2026-04-12T00:00:00.000Z",
							lastEventAt: "2026-04-12T00:00:00.000Z",
							completedAt: null,
							error: null,
							agentSteps: null,
						},
					],
					total: 1,
				}),
			} satisfies Partial<Response>;
		}) as unknown as typeof fetch;

		const { ProjectOverviewPage } = await import(
			`../../../pages/v2/ProjectOverviewPage.tsx?project-overview-older-run-test=${++importVersion}`
		);
		renderProjectOverviewWithComponent(ProjectOverviewPage);

		expect(
			await screen.findByRole("heading", { name: "Project One" }),
		).toBeTruthy();
		expect(global.fetch).toHaveBeenCalledTimes(2);

		liveRunIndex.upsertRun({
			id: "run-older",
			projectId: "proj-1",
			projectName: "Project One",
			featureId: "feat-1",
			featureName: "Feature One",
			name: "Older Run",
			command: "/build",
			status: "completed",
			harness: "codex",
			currentStep: null,
			steps: [],
			artifacts: [],
			events: [],
			startedAt: "2026-04-11T00:00:00.000Z",
			lastEventAt: "2026-04-11T00:05:00.000Z",
			completedAt: "2026-04-11T00:05:00.000Z",
			error: null,
			agentSteps: null,
		});

		await waitFor(() => {
			expect(screen.getByText("4 runs")).toBeTruthy();
		});
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});
});
