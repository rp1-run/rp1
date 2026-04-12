import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkspaceTabsProvider } from "@/hooks/useWorkspaceTabs";
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

async function renderProjectOverview() {
	const { ProjectOverviewPage } = await import(
		`../../../pages/v2/ProjectOverviewPage.tsx?project-overview-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={["/projects/proj-1"]}>
			<WorkspaceTabsProvider>
				<ShortcutRegistryProvider>
					<Routes>
						<Route
							path="/projects/:projectId"
							element={
								<>
									<RegistryProbe />
									<ProjectOverviewPage />
								</>
							}
						/>
					</Routes>
				</ShortcutRegistryProvider>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("ProjectOverviewPage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
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
});
