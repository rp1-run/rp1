import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
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
import type { Run } from "@/types/runs";

let importVersion = 0;
let latestRegistry: ShortcutRegistryData | null = null;

const breadcrumbApi = {
	setActiveArtifact: mock(() => {}),
	setProject: mock(() => {}),
	setRunInfo: mock(() => {}),
};

const webSocketApi = {
	onFileChange: () => () => {},
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
	AnnotationProvider: ({ children }: { children?: ReactNode }) => (
		<>{children}</>
	),
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
	ArtifactSidebar: () => <div data-testid="artifact-sidebar" />,
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

async function renderArtifactViewerPage() {
	const { ArtifactViewerPage } = await import(
		`../../../pages/v2/ArtifactViewerPage.tsx?artifact-viewer-page-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={["/runs/run-1/artifacts/docs/tasks.md"]}>
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
});
