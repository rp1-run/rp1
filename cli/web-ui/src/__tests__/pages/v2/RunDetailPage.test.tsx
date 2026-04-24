import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { WorkspaceTabsProvider } from "@/hooks/useWorkspaceTabs";
import type { ShortcutRegistryData } from "@/providers/ShortcutRegistryProvider";
import {
	ShortcutRegistryProvider,
	useShortcutRegistry,
} from "@/providers/ShortcutRegistryProvider";
import type { Artifact, Run, Step } from "@/types/runs";

let importVersion = 0;
let latestRegistry: ShortcutRegistryData | null = null;
let latestPath: string | null = null;
const refetchMock = mock(() => {});
let fetchMock: ReturnType<typeof mock>;
let latestRunArtifactsPanelProps: RunArtifactsPanelMockProps[] = [];

let headerRightContent: ReactNode = null;

const breadcrumbApi = {
	setActiveArtifact: mock(() => {}),
	setProject: mock(() => {}),
	setRunInfo: mock(() => {}),
	headerLeft: null as ReactNode,
	headerRight: null as ReactNode,
	setHeaderLeft: mock(() => {}),
	setHeaderRight: mock((node: ReactNode) => {
		headerRightContent = node;
		breadcrumbApi.headerRight = node;
	}),
};

const webSocketApi = {
	setProjectId: mock(() => {}),
};

interface RunArtifactsPanelMockProps {
	readonly artifactGroups: readonly {
		readonly artifacts: readonly Artifact[];
	}[];
	readonly selectedArtifact: Artifact | null;
	readonly selectedStep: Step | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly showFrontmatter?: boolean;
}

let run: Run = {
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

function applyRunDetailMocks() {
	mock.module("@/hooks/useRunDetail", () => ({
		useRunDetail: () => ({
			run,
			isLoading: false,
			error: null,
			refetch: refetchMock,
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

	mock.module("@/components/v2/RunArtifactsPanel", () => ({
		RunArtifactsPanel: ({
			artifactGroups,
			selectedArtifact,
			selectedStep,
			onArtifactSelect,
			showFrontmatter,
		}: RunArtifactsPanelMockProps) => {
			const artifacts = artifactGroups.flatMap((group) => group.artifacts);
			latestRunArtifactsPanelProps.push({
				artifactGroups,
				selectedArtifact,
				selectedStep,
				onArtifactSelect,
				showFrontmatter,
			});

			return (
				<div
					data-testid="artifact-panel-frontmatter"
					data-artifact-count={String(artifacts.length)}
					data-frontmatter={String(showFrontmatter ?? false)}
					data-selected-artifact={selectedArtifact?.docId ?? ""}
					data-selected-step={selectedStep?.id ?? ""}
				>
					{artifacts.map((artifact) => (
						<button
							key={artifact.docId}
							type="button"
							onClick={() => onArtifactSelect?.(artifact)}
						>
							{artifact.docId}
						</button>
					))}
				</div>
			);
		},
	}));
}

function RegistryProbe() {
	latestRegistry = useShortcutRegistry();
	return null;
}

function LocationProbe() {
	latestPath = useLocation().pathname;
	return null;
}

async function renderRunDetail(
	initialEntry = "/runs/run-1/step/build/artifact/doc-1",
) {
	const { RunDetailPage } = await import(
		`../../../pages/v2/RunDetailPage.tsx?run-detail-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<WorkspaceTabsProvider>
				<ShortcutRegistryProvider>
					<Routes>
						<Route
							path="/runs/:runId"
							element={
								<>
									<LocationProbe />
									<RegistryProbe />
									<RunDetailPage />
								</>
							}
						/>
						<Route
							path="/runs/:runId/step/:stepId"
							element={
								<>
									<LocationProbe />
									<RegistryProbe />
									<RunDetailPage />
								</>
							}
						/>
						<Route
							path="/runs/:runId/step/:stepId/artifact/:docId"
							element={
								<>
									<LocationProbe />
									<RegistryProbe />
									<RunDetailPage />
								</>
							}
						/>
						<Route
							path="/runs/:runId/artifact/:docId"
							element={
								<>
									<LocationProbe />
									<RegistryProbe />
									<RunDetailPage />
								</>
							}
						/>
					</Routes>
				</ShortcutRegistryProvider>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("RunDetailPage", () => {
	beforeEach(() => {
		mock.restore();
		applyRunDetailMocks();
		document.body.innerHTML = "";
		sessionStorage.clear();
		latestRegistry = null;
		latestPath = null;
		latestRunArtifactsPanelProps = [];
		fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ runStatus: "cancelled" }),
			}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		breadcrumbApi.setActiveArtifact.mockClear();
		breadcrumbApi.setProject.mockClear();
		breadcrumbApi.setRunInfo.mockClear();
		breadcrumbApi.setHeaderLeft.mockClear();
		breadcrumbApi.setHeaderRight.mockClear();
		headerRightContent = null;
		webSocketApi.setProjectId.mockClear();
		refetchMock.mockClear();
		run = {
			...run,
			status: "running",
			statusMessage: null,
		};
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("hides metadata and artifact frontmatter by default, then restores them from commands and session state", async () => {
		const firstRender = await renderRunDetail();

		expect(screen.queryByText("Invocation")).toBeNull();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.dataset.frontmatter).toBe("false");
		}

		await waitFor(() => {
			expect(
				latestRegistry?.contextualShortcuts?.commands.some(
					(command) => command.id === "toggle-run-metadata",
				),
			).toBe(true);
			expect(
				latestRegistry?.contextualShortcuts?.commands.some(
					(command) => command.id === "toggle-run-frontmatter",
				),
			).toBe(true);
			expect(
				latestRegistry?.contextualShortcuts?.commands.some(
					(command) => command.id === "close-workspace",
				),
			).toBe(true);
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
		expect(
			latestRegistry?.contextualShortcuts?.commands.some(
				(command) => command.id === "close-workspace",
			),
		).toBe(true);

		act(() => {
			metadataCommand?.action();
			frontmatterCommand?.action();
		});

		expect(screen.getByText("Invocation")).toBeTruthy();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.dataset.frontmatter).toBe("true");
		}

		firstRender.unmount();
		latestRegistry = null;

		await renderRunDetail();

		expect(screen.getByText("Invocation")).toBeTruthy();
		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.dataset.frontmatter).toBe("true");
		}
	});

	test("posts explicit end-run actions from the detail header", async () => {
		await renderRunDetail();

		await waitFor(() => {
			expect(breadcrumbApi.setHeaderRight).toHaveBeenCalled();
		});

		const headerRight = headerRightContent;
		expect(headerRight).toBeTruthy();

		const headerContainer = render(headerRight).container;
		const cancelButton = headerContainer.querySelector(
			"[aria-label='Cancel Run']",
		);
		expect(cancelButton).toBeTruthy();
		fireEvent.click(cancelButton!);

		const confirmButton = await waitFor(() => {
			const buttons = Array.from(document.body.querySelectorAll("button"));
			const match = buttons.find((b) => b.textContent?.trim() === "Confirm") as
				| HTMLButtonElement
				| undefined;
			expect(match).toBeTruthy();
			return match!;
		});
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/v2/runs/run-1/end", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ outcome: "cancelled" }),
			});
		});
		expect(refetchMock).toHaveBeenCalledTimes(1);
	});

	test("passes all run artifacts into the aggregate right panel", async () => {
		run = {
			...run,
			artifacts: [
				...run.artifacts,
				{
					docId: "doc-run",
					path: ".rp1/work/brief.md",
					absolutePath: "/repo/.rp1/work/brief.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: null,
				},
			],
		};

		await renderRunDetail("/runs/run-1/step/build/artifact/doc-1");

		for (const panel of screen.getAllByTestId("artifact-panel-frontmatter")) {
			expect(panel.dataset.artifactCount).toBe("2");
			expect(panel.dataset.selectedArtifact).toBe("doc-1");
		}
	});

	test("selects the current step artifact when landing on the run root", async () => {
		run = {
			...run,
			status: "waiting",
			currentStep: "review",
			steps: [
				{
					id: "build",
					name: "Build",
					status: "completed",
					startedAt: "2026-04-12T00:00:00.000Z",
					completedAt: "2026-04-12T00:10:00.000Z",
					taskCount: 5,
					completedTaskCount: 5,
				},
				{
					id: "review",
					name: "Review",
					status: "waiting",
					startedAt: "2026-04-12T00:10:00.000Z",
					completedAt: null,
					taskCount: null,
					completedTaskCount: null,
				},
			],
			artifacts: [
				{
					docId: "doc-build",
					path: ".rp1/work/features/feature-1/design.md",
					absolutePath: "/repo/.rp1/work/features/feature-1/design.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "build",
				},
				{
					docId: "doc-review",
					path: ".rp1/work/features/feature-1/review.md",
					absolutePath: "/repo/.rp1/work/features/feature-1/review.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "review",
				},
			],
		};

		await renderRunDetail("/runs/run-1");

		await waitFor(() => {
			expect(latestPath).toBe("/runs/run-1/step/review/artifact/doc-review");
		});
	});

	test("falls back to the first run artifact when the current step has no artifact", async () => {
		run = {
			...run,
			status: "waiting",
			currentStep: "review",
			steps: [
				{
					id: "build",
					name: "Build",
					status: "completed",
					startedAt: "2026-04-12T00:00:00.000Z",
					completedAt: "2026-04-12T00:10:00.000Z",
					taskCount: 5,
					completedTaskCount: 5,
				},
				{
					id: "review",
					name: "Review",
					status: "waiting",
					startedAt: "2026-04-12T00:10:00.000Z",
					completedAt: null,
					taskCount: null,
					completedTaskCount: null,
				},
			],
			artifacts: [
				{
					docId: "doc-build",
					path: ".rp1/work/features/feature-1/design.md",
					absolutePath: "/repo/.rp1/work/features/feature-1/design.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "build",
				},
			],
		};

		await renderRunDetail("/runs/run-1");

		await waitFor(() => {
			expect(latestPath).toBe("/runs/run-1/step/build/artifact/doc-build");
		});
	});

	test("uses artifact-origin navigation from the aggregate panel", async () => {
		run = {
			...run,
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
				{
					docId: "doc-review",
					path: ".rp1/work/features/feature-1/review.md",
					absolutePath: "/repo/.rp1/work/features/feature-1/review.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "review",
				},
			],
		};

		await renderRunDetail("/runs/run-1/step/build/artifact/doc-1");

		await waitFor(() => {
			expect(screen.getAllByText("doc-review").length).toBeGreaterThan(0);
		});
		fireEvent.click(screen.getAllByText("doc-review")[0]);

		await waitFor(() => {
			expect(latestPath).toBe("/runs/run-1/step/review/artifact/doc-review");
		});
	});
});
