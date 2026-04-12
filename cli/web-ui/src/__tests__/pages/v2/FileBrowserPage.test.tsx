import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

const webSocketApi = {
	setProjectId: mock(() => {}),
	onTreeChange: () => () => {},
	onFileChange: () => () => {},
};

mock.module("@/hooks/useProjectFileTree", () => ({
	useProjectFileTree: () => ({
		tree: [],
		loading: false,
		error: null,
		refetch: async () => {},
	}),
}));

mock.module("@/hooks/useProjects", () => ({
	useProjects: () => ({
		projects: [
			{
				id: "proj-1",
				name: "Project One",
				path: "/repo",
			},
		],
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

mock.module("@/components/FileTree", () => ({
	FileTree: () => <div data-testid="file-tree">File tree</div>,
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

mock.module("@/components/v2/TableOfContents", () => ({
	TableOfContents: () => <div data-testid="toc">ToC</div>,
}));

mock.module("@/components/v2/ContentPanel", () => ({
	ContentPanel: ({ showFrontmatter }: { showFrontmatter?: boolean }) => (
		<div data-testid="file-panel-frontmatter">
			{String(showFrontmatter ?? false)}
		</div>
	),
}));

function RegistryProbe() {
	latestRegistry = useShortcutRegistry();
	return null;
}

async function renderFileBrowser() {
	const { FileBrowserPage } = await import(
		`../../../pages/v2/FileBrowserPage.tsx?file-browser-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={["/projects/proj-1/files/docs/test.md"]}>
			<ShortcutRegistryProvider>
				<Routes>
					<Route
						path="/projects/:projectId/files/*"
						element={
							<>
								<RegistryProbe />
								<FileBrowserPage />
							</>
						}
					/>
				</Routes>
			</ShortcutRegistryProvider>
		</MemoryRouter>,
	);
}

describe("FileBrowserPage", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		sessionStorage.clear();
		latestRegistry = null;
		breadcrumbApi.setProject.mockClear();
		webSocketApi.setProjectId.mockClear();
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({
				path: "docs/test.md",
				content: "---\ntitle: Test\n---\n# Hello",
				mimeType: "text/markdown",
				frontmatter: { title: "Test" },
			}),
		})) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("hides frontmatter by default, toggles it from contextual commands, and restores it from session state", async () => {
		const firstRender = await renderFileBrowser();

		await waitFor(() => {
			expect(latestRegistry?.contextualShortcuts?.commands.length).toBe(1);
		});

		expect(screen.getByTestId("file-panel-frontmatter").textContent).toBe(
			"false",
		);

		const command = latestRegistry?.contextualShortcuts?.commands[0];
		expect(command?.id).toBe("toggle-file-frontmatter");

		act(() => {
			command?.action();
		});

		expect(screen.getByTestId("file-panel-frontmatter").textContent).toBe(
			"true",
		);

		firstRender.unmount();
		latestRegistry = null;

		await renderFileBrowser();

		expect(screen.getByTestId("file-panel-frontmatter").textContent).toBe(
			"true",
		);
	});
});
