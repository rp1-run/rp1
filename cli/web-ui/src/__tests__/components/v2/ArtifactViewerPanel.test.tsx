import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Artifact, Step } from "@/types/runs";

let importVersion = 0;

const step: Step = {
	id: "build",
	name: "Build",
	status: "running",
	startedAt: "2026-04-12T00:00:00.000Z",
	completedAt: null,
	taskCount: 1,
	completedTaskCount: 0,
};

const artifact: Artifact = {
	docId: "doc-1",
	path: ".rp1/work/features/feature-1/tasks.md",
	absolutePath: "/repo/.rp1/work/features/feature-1/tasks.md",
	type: "markdown",
	updatedDuringRun: true,
	isNew: false,
	step: "build",
};

mock.module("@/providers/AnnotationProvider", () => ({
	AnnotationProvider: ({ children }: { children?: ReactNode }) => (
		<>{children}</>
	),
	useAnnotationContext: () => ({
		annotations: [],
		isLoading: false,
		error: null,
		filter: { status: "all", author: null, dateRange: "all" },
		selectedAnnotationId: null,
		docId: null,
		runId: null,
		setFilter: () => {},
		selectAnnotation: () => {},
		createAnnotation: async () => {
			throw new Error("createAnnotation is not used in this test");
		},
		resolveAnnotation: async () => {},
		reopenAnnotation: async () => {},
		deleteAnnotation: async () => {},
		addReply: async () => {},
		getAnnotationsForArtifact: () => [],
		refetch: async () => {},
	}),
	useAnnotationContextSafe: () => ({
		annotations: [],
		isLoading: false,
		error: null,
		filter: { status: "all", author: null, dateRange: "all" },
		selectedAnnotationId: null,
		docId: null,
		runId: null,
		setFilter: () => {},
		selectAnnotation: () => {},
		createAnnotation: async () => {
			throw new Error("createAnnotation is not used in this test");
		},
		resolveAnnotation: async () => {},
		reopenAnnotation: async () => {},
		deleteAnnotation: async () => {},
		addReply: async () => {},
		getAnnotationsForArtifact: () => [],
		refetch: async () => {},
	}),
}));

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => ({
		onFileChange: () => () => {},
	}),
}));

mock.module("@/components/MarkdownViewer/MermaidDiagram", () => ({
	MermaidDiagram: () => <div data-testid="mermaid-diagram" />,
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

mock.module("@/components/v2/AnnotationSidebar", () => ({
	AnnotationSidebar: () => <div data-testid="annotation-sidebar" />,
}));

mock.module("@/components/v2/AnnotationToggleBtn", () => ({
	AnnotationToggleBtn: () => <button type="button">Annotations</button>,
}));

mock.module("@/components/v2/TableOfContents", () => ({
	TableOfContents: () => <div data-testid="toc">ToC</div>,
}));

mock.module("@/components/v2/UnifiedContentRenderer", () => ({
	UnifiedContentRenderer: () => <div data-testid="unified-content-renderer" />,
	SaveStatusIndicator: () => null,
}));

mock.module("@/components/v2/ContentPanel", () => ({
	ContentPanel: ({
		content,
		error,
		isLoading,
	}: {
		content?: string | null;
		error?: string | null;
		isLoading?: boolean;
	}) => (
		<div
			data-testid="artifact-content-panel"
			data-loading={String(isLoading ?? false)}
			data-content={content ?? ""}
			data-error={error ?? ""}
		>
			{error ?? content ?? ""}
		</div>
	),
}));

async function renderPanel() {
	const { ArtifactViewerPanel } = await import(
		`../../../components/v2/ArtifactViewerPanel.tsx?artifact-viewer-panel-test=${++importVersion}`
	);

	return render(
		<ArtifactViewerPanel
			step={step}
			artifacts={[artifact]}
			selectedArtifact={artifact}
			runId="run-1"
		/>,
	);
}

describe("ArtifactViewerPanel", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ content: "# Hello" }),
		})) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("surfaces initial fetch failures as an error when no cached content exists", async () => {
		global.fetch = mock(async () => ({
			ok: false,
			statusText: "Internal Server Error",
			json: async () => ({
				error: "Failed to fetch artifact: Internal Server Error",
			}),
		})) as unknown as typeof fetch;

		await renderPanel();

		await waitFor(() => {
			expect(screen.getByTestId("artifact-content-panel").dataset.loading).toBe(
				"false",
			);
			expect(screen.getByTestId("artifact-content-panel").dataset.error).toBe(
				"Failed to fetch artifact: Internal Server Error",
			);
		});
	});
});
