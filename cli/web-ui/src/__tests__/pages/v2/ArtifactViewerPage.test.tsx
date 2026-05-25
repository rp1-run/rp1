import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";
import type { ShortcutRegistryData } from "@/providers/ShortcutRegistryProvider";
import {
	ShortcutRegistryProvider,
	useShortcutRegistry,
} from "@/providers/ShortcutRegistryProvider";
import type { Artifact, Run } from "@/types/runs";

let importVersion = 0;
let latestRegistry: ShortcutRegistryData | null = null;
let latestAnnotationProvider: {
	artifactPath: string;
	docId?: string;
	runId?: string;
} | null = null;

const breadcrumbApi = {
	setActiveArtifact: mock(() => {}),
	setProject: mock(() => {}),
	setRunInfo: mock(() => {}),
};

const webSocketApi = {
	onFileChange: () => () => {},
	setProjectId: mock(() => {}),
};

const baseRun: Run = {
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
			taskCount: 1,
			completedTaskCount: 0,
		},
	],
	artifacts: [
		{
			docId: "doc-1",
			path: "docs/tasks.md",
			absolutePath: "/repo/docs/tasks.md",
			type: "markdown",
			updatedDuringRun: true,
			isNew: false,
			step: "build",
		},
	],
	events: [],
	agentSteps: null,
};

let run: Run = baseRun;

const codeTourArtifactPath =
	".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.json";
const codeTourSource = JSON.stringify({
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "Checkout Code Tour",
	source: {
		kind: "pull_request",
		repo: "example/repo",
		id: "42",
	},
	domains: {
		ui: {
			label: "Arcade UI",
			color: "#7ad0ff",
		},
	},
	concepts: [
		{
			id: "artifact-viewer",
			label: "Artifact Viewer",
			domain: "ui",
			epicenter: true,
			summary: "Routes Code Tour artifacts to the 3D reader.",
			fragments: ["artifact-viewer-page"],
		},
	],
	fragments: [
		{
			id: "artifact-viewer-page",
			label: "ArtifactViewerPage",
			path: "cli/web-ui/src/pages/v2/ArtifactViewerPage.tsx",
			line: 1,
			language: "tsx",
			code: [
				{
					tokens: [
						["kw", "export"],
						["", " function ArtifactViewerPage() {}"],
					],
				},
			],
		},
	],
	edges: {
		concept: [],
		fragment: [],
	},
	tour: [
		{
			conceptId: "artifact-viewer",
			title: "Open the 3D route",
			sub: "Artifact route",
			reason: "Valid Code Tour JSON should default to the 3D reader.",
		},
	],
});

mock.module("@/hooks/useRunDetail", () => ({
	useRunDetail: () => ({
		run,
		isLoading: false,
		error: null,
		refetch: mock(() => {}),
	}),
}));

mock.module("@/hooks/useBreadcrumbContext", () => ({
	useBreadcrumbContext: () => breadcrumbApi,
}));

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => webSocketApi,
}));

mock.module("@/hooks/useMediaQuery", () => ({
	useMediaQuery: () => false,
	useIsMobile: () => false,
}));

mock.module("@/hooks/useReconnectRecovery", () => ({
	useReconnectRecovery: () => {},
}));

mock.module("@/hooks/useAnnotations", () => ({
	useAnnotations: () => ({ count: 0 }),
}));

mock.module("@/hooks/useFollowMode", () => ({
	useFollowMode: () => ({
		followMode: false,
		hasNewUpdates: false,
		setFollowMode: () => {},
		scrollToNew: () => {},
		handleScroll: () => {},
	}),
}));

mock.module("@/providers/AnnotationProvider", () => ({
	AnnotationProvider: ({
		children,
		artifactPath,
		docId,
		runId,
	}: {
		children?: ReactNode;
		artifactPath: string;
		docId?: string;
		runId?: string;
	}) => {
		latestAnnotationProvider = { artifactPath, docId, runId };
		return <>{children}</>;
	},
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: {
		children?: ReactNode;
	} & ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/drawer", () => ({
	Drawer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

mock.module("@/components/ui/scroll-area", () => ({
	ScrollArea: ({
		children,
		className,
	}: {
		children?: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
	Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

mock.module("@/components/v2/ArtifactSidebar", () => ({
	ArtifactSidebar: ({
		artifacts,
		onSelect,
	}: {
		readonly artifacts: readonly Artifact[];
		readonly onSelect: (artifact: Artifact) => void;
	}) => (
		<div data-testid="artifact-sidebar">
			{artifacts.map((artifact) => (
				<button
					key={artifact.docId}
					type="button"
					onClick={() => onSelect(artifact)}
				>
					{artifact.label ?? artifact.path}
				</button>
			))}
		</div>
	),
}));

mock.module("@/components/v2/AnnotationSidebar", () => ({
	AnnotationSidebar: () => <div data-testid="annotation-sidebar" />,
}));

mock.module("@/components/v2/FollowModeToggle", () => ({
	FollowModeToggle: () => <div data-testid="follow-mode-toggle" />,
}));

mock.module("@/components/v2/KeyHints", () => ({
	KeyHints: () => <div data-testid="key-hints" />,
	VIEWER_HINTS: [],
}));

mock.module("@/components/v2/NewUpdatesChip", () => ({
	NewUpdatesChip: () => <div data-testid="new-updates-chip" />,
}));

mock.module("@/components/v2/TableOfContents", () => ({
	TableOfContents: () => <div data-testid="toc">ToC</div>,
}));

const unifiedContentRendererMock = {
	UnifiedContentRenderer: ({
		content,
		path,
	}: {
		content: string;
		path: string;
	}) => (
		<div data-testid="artifact-renderer">
			{path}:{content}
		</div>
	),
	SaveStatusIndicator: () => null,
};

mock.module(
	"@/components/v2/UnifiedContentRenderer",
	() => unifiedContentRendererMock,
);

mock.module(
	"@/components/v2/UnifiedContentRenderer.tsx",
	() => unifiedContentRendererMock,
);

const codeTourReaderMock = {
	CodeTour3DReader: ({
		tour,
		path,
		onSourceModeRequested,
		onRenderFailure,
	}: {
		readonly tour: { readonly title: string };
		readonly path: string;
		readonly onSourceModeRequested?: () => void;
		readonly onRenderFailure?: (message: string) => void;
	}) => (
		<div data-testid="code-tour-reader" data-path={path}>
			<span>{tour.title}</span>
			<button
				type="button"
				aria-label="Mock code tour source mode"
				onClick={onSourceModeRequested}
			>
				Source
			</button>
			<button
				type="button"
				aria-label="Mock code tour render failure"
				onClick={() =>
					onRenderFailure?.("Mock Code Tour render failed. Showing source.")
				}
			>
				Fail tour
			</button>
		</div>
	),
};

mock.module("@/components/v2/CodeTour3DReader", () => codeTourReaderMock);

mock.module("@/components/v2/CodeTour3DReader.tsx", () => codeTourReaderMock);

function RegistryProbe() {
	latestRegistry = useShortcutRegistry();
	return null;
}

function readStoredTabs() {
	const raw = localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
	return raw
		? (JSON.parse(raw) as {
				tabs: Array<{ title: string; subtitle: string | null }>;
			})
		: null;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

function contentResponse(content: string): Response {
	return {
		ok: true,
		statusText: "OK",
		json: async () => ({ content }),
	} as Response;
}

async function renderArtifactViewerPage(
	initialEntry = "/runs/run-1/artifacts/docs/tasks.md",
) {
	const { ArtifactViewerPage } = await import(
		`../../../pages/v2/ArtifactViewerPage.tsx?artifact-viewer-page-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<WorkspaceTabsProvider>
				<ShortcutRegistryProvider>
					<Routes>
						<Route
							path="/runs/:runId/artifacts/*"
							element={
								<>
									<RegistryProbe />
									<ArtifactViewerPage />
								</>
							}
						/>
					</Routes>
				</ShortcutRegistryProvider>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("ArtifactViewerPage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		localStorage.clear();
		sessionStorage.clear();
		latestRegistry = null;
		latestAnnotationProvider = null;
		run = {
			...baseRun,
			steps: [...baseRun.steps],
			artifacts: [...baseRun.artifacts],
			events: [...baseRun.events],
		};
		breadcrumbApi.setActiveArtifact.mockClear();
		breadcrumbApi.setProject.mockClear();
		breadcrumbApi.setRunInfo.mockClear();
		webSocketApi.setProjectId.mockClear();
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ content: "# Tasks" }),
		})) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("publishes workspace metadata and commands for the standalone artifact viewer route", async () => {
		await renderArtifactViewerPage();

		await waitFor(() => {
			expect(
				latestRegistry?.contextualShortcuts?.commands.some(
					(command) => command.id === "close-workspace",
				),
			).toBe(true);
		});

		await waitFor(() => {
			expect(readStoredTabs()?.tabs[0]).toMatchObject({
				title: "Build One",
				subtitle: "tasks.md",
			});
		});

		expect(breadcrumbApi.setProject).toHaveBeenCalledWith(
			"proj-1",
			"Project One",
		);
		expect(webSocketApi.setProjectId).toHaveBeenCalledWith("proj-1");
		expect(breadcrumbApi.setRunInfo).toHaveBeenCalled();
		expect(breadcrumbApi.setActiveArtifact).toHaveBeenCalledWith(
			"run-1",
			"docs/tasks.md",
		);
	});

	test("renders valid Code Tour artifacts in 3D mode and can switch to source", async () => {
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-code-tour",
					path: codeTourArtifactPath,
					absolutePath: `/repo/${codeTourArtifactPath}`,
					type: "other",
					updatedDuringRun: true,
					isNew: false,
					step: "pr-walkthrough",
				},
			],
		};
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ content: codeTourSource }),
		})) as unknown as typeof fetch;

		await renderArtifactViewerPage(
			`/runs/run-1/artifacts/${codeTourArtifactPath}`,
		);

		await waitFor(() => {
			expect(screen.getByTestId("code-tour-reader").dataset.path).toBe(
				codeTourArtifactPath,
			);
		});
		expect(screen.getByText("Checkout Code Tour")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "3D" }).getAttribute("aria-pressed"),
		).toBe("true");

		fireEvent.click(
			screen.getByRole("button", { name: "Mock code tour source mode" }),
		);

		await waitFor(() => {
			expect(screen.getByTestId("artifact-renderer").textContent).toContain(
				`${codeTourArtifactPath}:`,
			);
		});
		expect(
			screen
				.getByRole("button", { name: "Source" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	test("keeps Code Tour render failures on the source JSON path", async () => {
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-code-tour",
					path: codeTourArtifactPath,
					absolutePath: `/repo/${codeTourArtifactPath}`,
					type: "other",
					updatedDuringRun: true,
					isNew: false,
					step: "pr-walkthrough",
				},
			],
		};
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ content: codeTourSource }),
		})) as unknown as typeof fetch;

		await renderArtifactViewerPage(
			`/runs/run-1/artifacts/${codeTourArtifactPath}`,
		);

		await waitFor(() => {
			expect(screen.getByTestId("code-tour-reader")).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Mock code tour render failure" }),
		);

		await waitFor(() => {
			expect(
				screen.getByText("Mock Code Tour render failed. Showing source."),
			).toBeTruthy();
			expect(screen.getByTestId("artifact-renderer").textContent).toContain(
				`${codeTourArtifactPath}:`,
			);
		});
		expect(screen.queryByTestId("code-tour-reader")).toBeNull();
		expect(
			screen
				.getByRole("button", { name: "Source" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	test("shows diagnostic source fallback for unsupported Code Tour artifacts", async () => {
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-code-tour",
					path: codeTourArtifactPath,
					absolutePath: `/repo/${codeTourArtifactPath}`,
					type: "other",
					updatedDuringRun: true,
					isNew: false,
					step: "pr-walkthrough",
				},
			],
		};
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({
				content: codeTourSource.replace('"version":"1.0"', '"version":"9.9"'),
			}),
		})) as unknown as typeof fetch;

		await renderArtifactViewerPage(
			`/runs/run-1/artifacts/${codeTourArtifactPath}`,
		);

		await waitFor(() => {
			expect(
				screen.getByText(
					"This Code Tour artifact could not be rendered. Showing the source JSON instead.",
				),
			).toBeTruthy();
		});
		expect(screen.getByText(/Unsupported Code Tour version/)).toBeTruthy();
		expect(screen.getByTestId("artifact-renderer").textContent).toContain(
			`${codeTourArtifactPath}:`,
		);
		expect(screen.queryByTestId("code-tour-reader")).toBeNull();
		expect(screen.queryByRole("button", { name: "3D" })).toBeNull();
	});

	test("shows diagnostic source fallback for malformed Code Tour JSON", async () => {
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-code-tour",
					path: codeTourArtifactPath,
					absolutePath: `/repo/${codeTourArtifactPath}`,
					type: "other",
					updatedDuringRun: true,
					isNew: false,
					step: "pr-walkthrough",
				},
			],
		};
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ content: "{" }),
		})) as unknown as typeof fetch;

		await renderArtifactViewerPage(
			`/runs/run-1/artifacts/${codeTourArtifactPath}`,
		);

		await waitFor(() => {
			expect(screen.getByText(/Malformed JSON/)).toBeTruthy();
		});
		expect(screen.getByTestId("artifact-renderer").textContent).toBe(
			`${codeTourArtifactPath}:{`,
		);
		expect(screen.queryByTestId("code-tour-reader")).toBeNull();
	});

	test("keeps pr-review artifacts on the markdown path without specialized controls", async () => {
		const prReviewPath = ".rp1/work/pr-reviews/pr-42-review.md";
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-pr-review",
					path: prReviewPath,
					absolutePath: `/repo/${prReviewPath}`,
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "pr-review",
				},
			],
		};
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({
				content: "---\nrp1_contract: pr-review\n---\n# PR Review\n",
			}),
		})) as unknown as typeof fetch;

		await renderArtifactViewerPage(`/runs/run-1/artifacts/${prReviewPath}`);

		await waitFor(() => {
			expect(screen.getByTestId("artifact-renderer").textContent).toContain(
				`${prReviewPath}:`,
			);
		});

		expect(screen.queryByRole("button", { name: "3D" })).toBeNull();
	});

	test("ignores stale artifact content when artifact fetches resolve out of order", async () => {
		const firstArtifact: Artifact = {
			...baseRun.artifacts[0],
			docId: "doc-first",
			path: "docs/first.md",
			absolutePath: "/repo/docs/first.md",
			label: "First Artifact",
		};
		const secondArtifact: Artifact = {
			...baseRun.artifacts[0],
			docId: "doc-second",
			path: "docs/second.md",
			absolutePath: "/repo/docs/second.md",
			label: "Second Artifact",
		};
		const firstFetch = deferred<Response>();
		const secondFetch = deferred<Response>();
		run = {
			...baseRun,
			artifacts: [firstArtifact, secondArtifact],
		};
		global.fetch = mock((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(encodeURIComponent(firstArtifact.path))) {
				return firstFetch.promise;
			}
			if (url.includes(encodeURIComponent(secondArtifact.path))) {
				return secondFetch.promise;
			}
			return Promise.reject(new Error(`Unexpected artifact request: ${url}`));
		}) as unknown as typeof fetch;

		await renderArtifactViewerPage("/runs/run-1/artifacts/docs/first.md");

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole("button", { name: "Second Artifact" }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		secondFetch.resolve(contentResponse("# Second artifact"));
		await waitFor(() => {
			expect(screen.getByTestId("artifact-renderer").textContent).toBe(
				"docs/second.md:# Second artifact",
			);
		});

		firstFetch.resolve(contentResponse("# First artifact"));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(screen.getByTestId("artifact-renderer").textContent).toBe(
			"docs/second.md:# Second artifact",
		);
	});

	test("opens URL artifacts from the sidebar without replacing current file content", async () => {
		const openMock = mock(() => null);
		Object.defineProperty(window, "open", {
			configurable: true,
			value: openMock,
		});
		run = {
			...baseRun,
			artifacts: [
				...baseRun.artifacts,
				{
					docId: "link-reviewed-pr",
					locationKind: "url",
					path: "https://github.com/example/repo/pull/123",
					absolutePath: "https://github.com/example/repo/pull/123",
					type: "other",
					url: "https://github.com/example/repo/pull/123",
					label: "Reviewed PR",
					relationship: "reviewed_pr",
					sourceContext: "PR review input resolution",
					sourceArtifactPath: "pr-reviews/pr-123-review.md",
					updatedDuringRun: true,
					isNew: false,
					step: "build",
				},
			],
		};

		await renderArtifactViewerPage();

		await waitFor(() => {
			expect(screen.getByTestId("artifact-renderer").textContent).toBe(
				"docs/tasks.md:# Tasks",
			);
		});
		fireEvent.click(screen.getByRole("button", { name: "Reviewed PR" }));

		expect(openMock).toHaveBeenCalledWith(
			"https://github.com/example/repo/pull/123",
			"_blank",
			"noopener,noreferrer",
		);
		expect(screen.getByTestId("artifact-renderer").textContent).toBe(
			"docs/tasks.md:# Tasks",
		);
	});

	test("renders external links in a dedicated links panel", async () => {
		const openMock = mock(() => null);
		Object.defineProperty(window, "open", {
			configurable: true,
			value: openMock,
		});
		run = {
			...baseRun,
			artifacts: [
				...baseRun.artifacts,
				{
					docId: "link-reviewed-pr",
					locationKind: "url",
					path: "https://github.com/example/repo/pull/456",
					absolutePath: "https://github.com/example/repo/pull/456",
					type: "other",
					url: "https://github.com/example/repo/pull/456",
					label: "456",
					relationship: "reviewed_pr",
					sourceContext: "PR review input resolution",
					sourceArtifactPath: "pr-reviews/pr-456-review.md",
					updatedDuringRun: true,
					isNew: false,
					step: "build",
				},
			],
		};

		await renderArtifactViewerPage();

		await waitFor(() => {
			expect(screen.getByTestId("artifact-renderer").textContent).toBe(
				"docs/tasks.md:# Tasks",
			);
		});

		expect(screen.queryByLabelText("Links panel")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Open links panel" }));

		const linksPanel = screen.getByLabelText("Links panel");
		expect(within(linksPanel).getByText("Reviewed PR #456")).toBeTruthy();
		expect(within(linksPanel).getByText("1 link")).toBeTruthy();
		expect(linksPanel.querySelector(".lucide-link")).toBeTruthy();
		expect(screen.queryByTestId("annotation-sidebar")).toBeNull();

		fireEvent.click(
			within(linksPanel).getByRole("button", {
				name: "Open Reviewed PR #456",
			}),
		);

		expect(openMock).toHaveBeenCalledWith(
			"https://github.com/example/repo/pull/456",
			"_blank",
			"noopener,noreferrer",
		);
	});

	test("keeps direct URL artifact routes out of annotation surfaces", async () => {
		run = {
			...baseRun,
			artifacts: [
				{
					docId: "link-reviewed-pr",
					locationKind: "url",
					path: "https://github.com/example/repo/pull/123",
					absolutePath: "https://github.com/example/repo/pull/123",
					type: "other",
					url: "https://github.com/example/repo/pull/123",
					label: "Reviewed PR",
					relationship: "reviewed_pr",
					sourceContext: "PR review input resolution",
					sourceArtifactPath: "pr-reviews/pr-123-review.md",
					updatedDuringRun: true,
					isNew: false,
					step: "build",
				},
			],
		};

		await renderArtifactViewerPage(
			"/runs/run-1/artifacts/https://github.com/example/repo/pull/123",
		);

		await waitFor(() => {
			expect(screen.getByText("Open link")).toBeTruthy();
		});

		expect(global.fetch).not.toHaveBeenCalled();
		expect(screen.queryByTestId("annotation-sidebar")).toBeNull();
		expect(latestAnnotationProvider).toMatchObject({
			artifactPath: "",
			docId: undefined,
			runId: "run-1",
		});
	});
});
