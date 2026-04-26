import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement, forwardRef, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";
import type { Artifact, Run, Step } from "@/types/runs";

let importVersion = 0;
let wideActivityLayout = false;
let feedItems: {
	readonly id: string;
	readonly run: {
		readonly id: string;
		readonly name: string;
		readonly command: string;
		readonly status: string;
		readonly harness: string;
		readonly startedAt: string;
		readonly lastEventAt: string;
		readonly projectId: string;
		readonly projectName: string;
	};
}[] = [];

function createFeedItem({
	id,
	name,
	projectId,
	projectName,
}: {
	readonly id: string;
	readonly name: string;
	readonly projectId: string;
	readonly projectName: string;
}) {
	return {
		id,
		run: {
			id,
			name,
			command: "/build-fast",
			status: "running",
			harness: "codex",
			startedAt: "2026-04-12T00:00:00.000Z",
			lastEventAt: "2026-04-12T00:05:00.000Z",
			projectId,
			projectName,
		},
	};
}

function createRunDetail(runId: string | undefined): Run | null {
	const source = feedItems.find((item) => item.id === runId)?.run;
	if (!source) return null;

	const step: Step = {
		id: "build",
		name: "Build",
		status: "running",
		startedAt: source.startedAt,
		completedAt: null,
		taskCount: 1,
		completedTaskCount: 0,
	};
	const artifact: Artifact = {
		docId: `${source.id}-doc`,
		path: `.rp1/work/features/${source.id}/tasks.md`,
		absolutePath: `/repo/.rp1/work/features/${source.id}/tasks.md`,
		type: "markdown",
		updatedDuringRun: true,
		isNew: false,
		step: step.id,
	};

	return {
		id: source.id,
		projectId: source.projectId,
		projectName: source.projectName,
		featureId: "feature-1",
		featureName: "Feature One",
		name: source.name,
		command: source.command,
		status: "running",
		harness: source.harness,
		currentStep: step.id,
		steps: [step],
		artifacts: [artifact],
		events: [],
		startedAt: source.startedAt,
		lastEventAt: source.lastEventAt,
		completedAt: null,
		error: null,
		agentSteps: null,
	};
}

function getPreviewText() {
	return screen.getAllByTestId("run-detail-surface")[0]?.textContent;
}

function installHomePageMocks() {
	mock.module("@/hooks/useFeed", () => ({
		useFeed: () => ({
			items: feedItems,
			total: feedItems.length,
			isLoading: false,
		}),
	}));

	mock.module("@/hooks/useMediaQuery", () => ({
		useMediaQuery: () => wideActivityLayout,
	}));

	mock.module("@/hooks/usePrefersReducedMotion", () => ({
		usePrefersReducedMotion: () => true,
	}));

	mock.module("@/hooks/useRunDetail", () => ({
		useRunDetail: (runId: string | undefined) => ({
			run: createRunDetail(runId),
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
		useBreadcrumbContext: () => ({
			setActiveArtifact: mock(() => {}),
			setProject: mock(() => {}),
			setRunInfo: mock(() => {}),
			setHeaderLeft: mock(() => {}),
			setHeaderRight: mock(() => {}),
		}),
	}));

	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
			setProjectId: mock(() => {}),
		}),
	}));

	mock.module("@/components/ui/resizable", () => ({
		ResizablePanelGroup: ({ children }: { readonly children?: ReactNode }) => (
			<div>{children}</div>
		),
		ResizablePanel: ({ children }: { readonly children?: ReactNode }) => (
			<div>{children}</div>
		),
		ResizableHandle: () => <div data-testid="resizable-handle" />,
	}));

	mock.module("@/components/v2/VerticalStepList", () => ({
		VerticalStepList: () => <div data-testid="step-list" />,
	}));

	mock.module("@/components/v2/RunArtifactsPanel", () => ({
		RunArtifactsPanel: ({ runId }: { readonly runId?: string }) => (
			<div data-testid="run-detail-surface">Preview {runId}</div>
		),
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
					const MotionComponent = forwardRef<
						HTMLElement,
						{ readonly children?: ReactNode; readonly [key: string]: unknown }
					>(({ children, ...props }, ref) =>
						createElement(prop, { ...props, ref }, children as ReactNode),
					);
					MotionComponent.displayName = `MockMotion.${prop}`;
					return MotionComponent;
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
		sessionStorage.clear();
		wideActivityLayout = false;
		feedItems = [
			createFeedItem({
				id: "run-1",
				name: "Build One",
				projectId: "proj-1",
				projectName: "Project One",
			}),
			createFeedItem({
				id: "run-2",
				name: "Build Two",
				projectId: "proj-2",
				projectName: "Project Two",
			}),
		];
	});

	afterEach(() => {
		cleanup();
		mock.restore();
		localStorage.clear();
		sessionStorage.clear();
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

	test("previews a clicked feed entry inline on wide layouts without leaving Activity", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		fireEvent.click(screen.getByText("Build Two").closest('[role="button"]')!);

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-2");
		});
		expect(screen.getByTestId("location-probe").textContent).toBe("/");
		expect(
			screen
				.getByText("Build Two")
				.closest('[role="button"]')
				?.getAttribute("aria-selected"),
		).toBe("true");
	});

	test("opens the project from the dedicated project area in the wide activity row", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Open project Project Two" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-2",
			);
		});
	});

	test("expands the selected run by focusing its existing workspace tab", async () => {
		wideActivityLayout = true;
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

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Expand selected run" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1/step/build/artifact/doc-1",
			);
		});

		const storedTabs = JSON.parse(
			localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY) ?? "{}",
		) as { readonly tabs?: readonly WorkspaceTab[] };
		expect(storedTabs.tabs?.map((tab) => tab.key)).toEqual(["run:run-1"]);
	});

	test("uses activity keyboard navigation to update the wide inline preview", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		fireEvent.keyDown(document, { key: "j" });

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-2");
		});
		expect(
			screen
				.getByText("Build Two")
				.closest('[role="button"]')
				?.getAttribute("aria-selected"),
		).toBe("true");

		fireEvent.keyDown(document, { key: "ArrowDown" });

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-2");
		});

		fireEvent.keyDown(document, { key: "k" });

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		fireEvent.keyDown(document, { key: "ArrowUp" });

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});
	});

	test("does not use activity keyboard navigation on narrow layouts", async () => {
		await renderHomePage();

		fireEvent.keyDown(document, { key: "j" });

		expect(screen.getByTestId("location-probe").textContent).toBe("/");
	});

	test("does not intercept editor or text-entry navigation keys", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		const editor = document.createElement("div");
		editor.className = "ProseMirror";
		editor.contentEditable = "true";
		editor.tabIndex = 0;
		document.body.appendChild(editor);
		editor.focus();

		fireEvent.keyDown(editor, { key: "j" });

		expect(getPreviewText()).toBe("Preview run-1");

		const input = document.createElement("input");
		input.type = "text";
		document.body.appendChild(input);
		input.focus();

		fireEvent.keyDown(input, { key: "ArrowDown" });

		expect(getPreviewText()).toBe("Preview run-1");
	});

	test("does not intercept navigation keys while shortcut guards have precedence", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		const button = document.createElement("button");
		document.body.appendChild(button);
		button.focus();

		fireEvent.keyDown(button, { key: "j", metaKey: true });
		expect(getPreviewText()).toBe("Preview run-1");

		document.body.dataset.chordPending = "g";
		fireEvent.keyDown(button, { key: "j" });
		delete document.body.dataset.chordPending;
		expect(getPreviewText()).toBe("Preview run-1");

		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		dialog.dataset.state = "open";
		document.body.appendChild(dialog);

		fireEvent.keyDown(button, { key: "j" });

		expect(getPreviewText()).toBe("Preview run-1");
	});
});
