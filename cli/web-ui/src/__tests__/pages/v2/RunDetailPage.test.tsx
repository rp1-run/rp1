import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ShortcutRegistryData } from "@/providers/ShortcutRegistryProvider";
import {
	ShortcutRegistryProvider,
	useShortcutRegistry,
} from "@/providers/ShortcutRegistryProvider";
import type { Run } from "@/types/runs";

let importVersion = 0;
let latestRegistry: ShortcutRegistryData | null = null;

const breadcrumbApi = {
	setActiveArtifact: mock(() => {}),
	setProject: mock(() => {}),
	setRunInfo: mock(() => {}),
};

const webSocketApi = {
	setProjectId: mock(() => {}),
};

const run: Run = {
	id: "run-1",
	projectId: "proj-1",
	projectName: "Project One",
	featureId: "feature-1",
	featureName: "Feature One",
	name: "Build One",
	command: "/build-fast",
	status: "running",
	harness: "codex",
	currentStep: "build",
	startedAt: "2026-04-12T00:00:00.000Z",
	completedAt: null,
	error: null,
	lastEventAt: null,
	steps: [
		{
			id: "build",
			name: "Build",
			status: "running",
			startedAt: "2026-04-12T00:00:00.000Z",
			completedAt: null,
			taskCount: 5,
			completedTaskCount: 2,
		},
	],
	artifacts: [
		{
			docId: "doc-1",
			path: ".rp1/work/features/feature-1/tasks.md",
			absolutePath: "/repo/.rp1/work/features/feature-1/tasks.md",
			type: "markdown",
			updatedDuringRun: true,
			isNew: false,
			step: "build",
		},
	],
	events: [],
	agentSteps: null,
	invocation: {
		workflowName: "build-fast",
		runPolicy: "resumable",
		decision: "matched_non_terminal_run",
		projectIdentity: "project-1",
		canonicalProjectRoot: "/repo",
		requestedProjectRoot: "/repo",
		isWorktree: false,
		workIdentity: "FEATURE_ID=feature-1",
		identityValues: { FEATURE_ID: "feature-1" },
		harness: "codex",
	},
};

mock.module("@/hooks/useRunDetail", () => ({
	useRunDetail: () => ({
		run,
		isLoading: false,
		error: null,
		refetch: mock(() => {}),
	}),
}));

mock.module("@/hooks/useWorkflowSteps", () => ({
	commandToWorkflowName: () => "build-fast",
	useWorkflowSteps: () => ({ isLoading: false }),
}));

mock.module("@/hooks/useBreadcrumbContext", () => ({
	useBreadcrumbContext: () => breadcrumbApi,
}));

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => webSocketApi,
}));

mock.module("@/components/ui/resizable", () => ({
	ResizablePanelGroup: ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	),
	ResizablePanel: ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	),
	ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

mock.module("@/components/v2/VerticalStepList", () => ({
	VerticalStepList: () => <div data-testid="step-list">Step list</div>,
}));

mock.module("@/components/v2/ArtifactViewerPanel", () => ({
	ArtifactViewerPanel: ({ showFrontmatter }: { showFrontmatter?: boolean }) => (
		<div data-testid="artifact-panel-frontmatter">
			{String(showFrontmatter ?? false)}
		</div>
	),
}));

function RegistryProbe() {
	latestRegistry = useShortcutRegistry();
	return null;
}

async function renderRunDetail() {
	const { RunDetailPage } = await import(
		`../../../pages/v2/RunDetailPage.tsx?run-detail-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={["/runs/run-1/step/build/artifact/doc-1"]}>
			<ShortcutRegistryProvider>
				<Routes>
					<Route
						path="/runs/:runId/step/:stepId/artifact/:docId"
						element={
							<>
								<RegistryProbe />
								<RunDetailPage />
							</>
						}
					/>
				</Routes>
			</ShortcutRegistryProvider>
		</MemoryRouter>,
	);
}

describe("RunDetailPage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		sessionStorage.clear();
		latestRegistry = null;
		breadcrumbApi.setActiveArtifact.mockClear();
		breadcrumbApi.setProject.mockClear();
		breadcrumbApi.setRunInfo.mockClear();
		webSocketApi.setProjectId.mockClear();
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("hides metadata and artifact frontmatter by default, then restores them from commands and session state", async () => {
		const firstRender = await renderRunDetail();

		expect(screen.queryByText("Invocation")).toBeNull();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.textContent).toBe("false");
		}

		await waitFor(() => {
			expect(latestRegistry?.contextualShortcuts?.commands.length).toBe(2);
		});

		const metadataCommand = latestRegistry?.contextualShortcuts?.commands.find(
			(command) => command.id === "toggle-run-metadata",
		);
		const frontmatterCommand =
			latestRegistry?.contextualShortcuts?.commands.find(
				(command) => command.id === "toggle-run-frontmatter",
			);

		expect(metadataCommand).toBeTruthy();
		expect(frontmatterCommand).toBeTruthy();

		act(() => {
			metadataCommand?.action();
			frontmatterCommand?.action();
		});

		expect(screen.getByText("Invocation")).toBeTruthy();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.textContent).toBe("true");
		}

		firstRender.unmount();
		latestRegistry = null;

		await renderRunDetail();

		expect(screen.getByText("Invocation")).toBeTruthy();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.textContent).toBe("true");
		}
	});
});
