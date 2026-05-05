import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
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
	}: {
		children?: ReactNode;
		onClick?: () => void;
	}) => (
		<button type="button" onClick={onClick}>
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

	test("renders external links after file content as secondary information", async () => {
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

		const renderer = screen.getByTestId("artifact-renderer");
		const externalLinks = screen.getByRole("region", {
			name: "External links",
		});
		expect(
			Boolean(
				renderer.compareDocumentPosition(externalLinks) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);
		expect(within(externalLinks).getByText("Reviewed PR #456")).toBeTruthy();
		expect(externalLinks.querySelector(".lucide-link")).toBeTruthy();

		fireEvent.click(
			within(externalLinks).getByRole("button", {
				name: /Reviewed PR #456/,
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
