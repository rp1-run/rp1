import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { createElement, forwardRef, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";
import type { Artifact, Run, RunsFilter, Step } from "@/types/runs";

let importVersion = 0;
let wideActivityLayout = false;
let feedLoading = false;
let feedSearchQueries: string[] = [];
let feedOptions: Array<Partial<RunsFilter> & { readonly search?: string }> = [];
let latestFilterBarFilters: RunsFilter | null = null;
let feedItems: {
	readonly id: string;
	readonly run: Run;
}[] = [];

function createFeedItem({
	id,
	name,
	projectId,
	projectName,
	status = "running",
}: {
	readonly id: string;
	readonly name: string;
	readonly projectId: string;
	readonly projectName: string;
	readonly status?: Run["status"];
}) {
	const step: Step = {
		id: "build",
		name: "Build",
		status,
		startedAt: "2026-04-12T00:00:00.000Z",
		completedAt: null,
		taskCount: 1,
		completedTaskCount: status === "completed" ? 1 : 0,
	};
	return {
		id,
		run: {
			id,
			projectId,
			projectName,
			featureId: "feature-1",
			featureName: "Feature One",
			name,
			command: "/build-fast",
			status,
			harness: "codex",
			currentStep: step.id,
			steps: [step],
			artifacts: [],
			events: [],
			startedAt: "2026-04-12T00:00:00.000Z",
			lastEventAt: "2026-04-12T00:05:00.000Z",
			completedAt: status === "completed" ? "2026-04-12T00:05:00.000Z" : null,
			error: null,
			statusMessage: null,
			agentSteps: null,
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
		status: source.status,
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
	return screen.getAllByTestId("run-detail-preview-body")[0]?.textContent;
}

function getActivityRow(name: string) {
	const row = screen.getByText(name).closest('[role="button"]');
	expect(row).not.toBeNull();
	return row as HTMLElement;
}

async function flushSearchDebounce() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 200));
	});
}

function installHomePageMocks() {
	mock.module("@/hooks/useFeed", () => ({
		useFeed: (options?: Partial<RunsFilter> & { readonly search?: string }) => {
			const search = options?.search?.trim().toLowerCase() ?? "";
			feedOptions.push(options ?? {});
			feedSearchQueries.push(search);
			const items = feedItems.filter((item) => {
				if (
					options?.status === "relevant" &&
					(item.run.status === "cancelled" || item.run.status === "abandoned")
				) {
					return false;
				}
				if (
					options?.status &&
					options.status !== "all" &&
					options.status !== "relevant" &&
					item.run.status !== options.status
				) {
					return false;
				}
				if (!search) return true;
				return [
					item.run.id,
					item.run.name,
					item.run.command,
					item.run.featureName,
					item.run.featureId,
					item.run.projectName,
					item.run.status,
					item.run.currentStep,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase()
					.includes(search);
			});
			return {
				items,
				total: items.length,
				isLoading: feedLoading,
			};
		},
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
		RunArtifactsPanel: ({
			runId,
			headerLabel,
			headerActions,
		}: {
			readonly runId?: string;
			readonly headerLabel?: ReactNode;
			readonly headerActions?: ReactNode;
		}) => (
			<div data-testid="run-detail-surface">
				{headerLabel && <span>{headerLabel}</span>}
				{headerActions}
				<span data-testid="run-detail-preview-body">Preview {runId}</span>
			</div>
		),
	}));

	mock.module("@/components/v2/FilterBar", () => ({
		FilterBar: ({ filters }: { readonly filters: RunsFilter }) => {
			latestFilterBarFilters = filters;
			return <div data-testid="filter-bar">{filters.status}</div>;
		},
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
		feedLoading = false;
		feedSearchQueries = [];
		feedOptions = [];
		latestFilterBarFilters = null;
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

	test("renders project names in activity rows without a project action", async () => {
		await renderHomePage();

		const row = getActivityRow("Build One");
		const projectName = within(row).getByText("Project One");
		const rowChildren = Array.from(row.children);

		expect(row.className).toContain(
			"grid-cols-[auto_3.75rem_minmax(0,1fr)_6.75rem]",
		);
		expect(row.title).toBe("");
		expect(rowChildren[1]?.className).toContain("tabular-nums");
		expect(rowChildren[1]?.className).toContain("whitespace-nowrap");
		expect(projectName.textContent).toBe("Project One");
		expect(projectName.classList.contains("truncate")).toBe(true);
		expect(
			within(row).queryByRole("button", { name: "Open project Project One" }),
		).toBeNull();
		expect(within(row).getByText("build").textContent).toBe("build");

		fireEvent.focus(row);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 300));
		});
		expect(screen.queryByRole("tooltip")).toBeNull();

		fireEvent.pointerEnter(row, { pointerType: "mouse" });

		await waitFor(() => {
			expect(screen.getByRole("tooltip").textContent).toBe(
				"/build-fast Build One",
			);
		});
	});

	test("uses the relevant activity view by default", async () => {
		feedItems = [
			createFeedItem({
				id: "run-running",
				name: "Running Build",
				projectId: "proj-1",
				projectName: "Project One",
				status: "running",
			}),
			createFeedItem({
				id: "run-completed",
				name: "Completed Build",
				projectId: "proj-1",
				projectName: "Project One",
				status: "completed",
			}),
			createFeedItem({
				id: "run-cancelled",
				name: "Cancelled Build",
				projectId: "proj-1",
				projectName: "Project One",
				status: "cancelled",
			}),
			createFeedItem({
				id: "run-abandoned",
				name: "Abandoned Build",
				projectId: "proj-1",
				projectName: "Project One",
				status: "abandoned",
			}),
		];

		await renderHomePage();

		expect(feedOptions.at(-1)?.status).toBe("relevant");
		expect(screen.getByText("Running Build")).toBeTruthy();
		expect(screen.getByText("Completed Build")).toBeTruthy();
		expect(screen.queryByText("Cancelled Build")).toBeNull();
		expect(screen.queryByText("Abandoned Build")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Show filters" }));

		expect(screen.getByTestId("filter-bar").textContent).toBe("relevant");
		expect(latestFilterBarFilters?.status).toBe("relevant");
	});

	test("filters activity rows from the search control", async () => {
		await renderHomePage();

		fireEvent.click(screen.getByRole("button", { name: "Show search" }));

		const input = screen.getByRole("searchbox", { name: "Search activity" });
		fireEvent.change(input, { target: { value: "Project Two" } });

		await flushSearchDebounce();
		expect(screen.queryByText("Build One")).toBeNull();
		expect(screen.getByText("Build Two")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

		expect(screen.getByText("Build One")).toBeTruthy();
		expect(screen.getByText("Build Two")).toBeTruthy();
	});

	test("debounces activity search requests while typing", async () => {
		await renderHomePage();

		fireEvent.click(screen.getByRole("button", { name: "Show search" }));

		const input = screen.getByRole("searchbox", { name: "Search activity" });
		fireEvent.change(input, { target: { value: "r" } });
		fireEvent.change(input, { target: { value: "re" } });
		fireEvent.change(input, { target: { value: "rep" } });
		fireEvent.change(input, { target: { value: "repl" } });

		await flushSearchDebounce();
		expect(feedSearchQueries).toContain("repl");

		expect(feedSearchQueries).not.toContain("r");
		expect(feedSearchQueries).not.toContain("re");
		expect(feedSearchQueries).not.toContain("rep");

		feedSearchQueries = [];
		fireEvent.change(input, { target: { value: "rep" } });
		fireEvent.change(input, { target: { value: "re" } });
		fireEvent.change(input, { target: { value: "r" } });
		fireEvent.change(input, { target: { value: "" } });

		await flushSearchDebounce();
		expect(feedSearchQueries).toContain("");

		expect(feedSearchQueries).not.toContain("r");
		expect(feedSearchQueries).not.toContain("re");
		expect(feedSearchQueries).not.toContain("rep");
	});

	test("uses the search input as the activity search progress indicator", async () => {
		feedLoading = true;
		await renderHomePage();

		fireEvent.click(screen.getByRole("button", { name: "Show search" }));

		const input = screen.getByRole("searchbox", { name: "Search activity" });
		fireEvent.change(input, { target: { value: "Project Two" } });

		await waitFor(() => {
			expect(input.getAttribute("aria-busy")).toBe("true");
			expect(screen.queryByText("Searching...")).toBeNull();
		});

		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

		await waitFor(() => {
			expect(input.getAttribute("aria-busy")).toBe("true");
			expect(screen.queryByText("Updating activity...")).toBeNull();
		});
	});

	test("previews a clicked feed entry inline on wide layouts without leaving Activity", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});
		await waitFor(() => {
			expect(screen.getByText("Current Step: Build")).toBeTruthy();
		});
		expect(screen.queryByText("Run Preview")).toBeNull();

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

	test("uses full-row highlight only for selected activity entries", async () => {
		wideActivityLayout = true;
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
				status: "waiting",
			}),
		];

		await renderHomePage();

		await waitFor(() => {
			expect(getActivityRow("Build One").getAttribute("aria-selected")).toBe(
				"true",
			);
		});

		const selectedRunningRow = getActivityRow("Build One");
		const waitingRow = getActivityRow("Build Two");
		expect(selectedRunningRow.classList.contains("bg-surface")).toBe(true);
		expect(selectedRunningRow.classList.contains("ring-1")).toBe(true);
		expect(selectedRunningRow.classList.contains("bg-accent-ghost")).toBe(
			false,
		);
		expect(waitingRow.getAttribute("aria-selected")).toBe("false");
		expect(waitingRow.classList.contains("bg-accent-ghost")).toBe(false);
		expect(waitingRow.classList.contains("bg-surface")).toBe(false);
		expect(waitingRow.classList.contains("ring-1")).toBe(false);
		expect(
			within(waitingRow)
				.getByLabelText("Waiting")
				.classList.contains("bg-accent-amber"),
		).toBe(true);
		expect(
			within(waitingRow)
				.getByText("waiting")
				.classList.contains("text-accent-amber"),
		).toBe(true);

		fireEvent.click(waitingRow);

		await waitFor(() => {
			expect(getActivityRow("Build Two").getAttribute("aria-selected")).toBe(
				"true",
			);
		});
		const selectedWaitingRow = getActivityRow("Build Two");
		expect(getActivityRow("Build One").getAttribute("aria-selected")).toBe(
			"false",
		);
		expect(selectedWaitingRow.classList.contains("bg-surface")).toBe(true);
		expect(selectedWaitingRow.classList.contains("ring-1")).toBe(true);
		expect(selectedWaitingRow.classList.contains("bg-accent-ghost")).toBe(
			false,
		);
		expect(
			within(selectedWaitingRow)
				.getByText("waiting")
				.classList.contains("text-accent-amber"),
		).toBe(true);
	});

	test("keeps the wide activity row project name static", async () => {
		wideActivityLayout = true;

		await renderHomePage();

		await waitFor(() => {
			expect(getPreviewText()).toBe("Preview run-1");
		});

		const row = getActivityRow("Build Two");

		expect(within(row).getByText("Project Two").textContent).toBe(
			"Project Two",
		);
		expect(
			within(row).queryByRole("button", { name: "Open project Project Two" }),
		).toBeNull();
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
