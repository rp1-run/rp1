import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import type {
	ArtifactContentSurfaceControls,
	ArtifactContentSurfaceProps,
} from "@/components/v2/ArtifactContentSurface";
import type { SaveStatus } from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import type { Artifact } from "@/types/runs";

let importVersion = 0;

const firstArtifact: Artifact = {
	docId: "doc-1",
	path: ".rp1/work/features/feature-1/tasks.md",
	absolutePath: "/repo/.rp1/work/features/feature-1/tasks.md",
	type: "markdown",
	updatedDuringRun: true,
	isNew: false,
	step: "build",
};

const secondArtifact: Artifact = {
	docId: "doc-2",
	path: ".rp1/work/features/feature-1/report.md",
	absolutePath: "/repo/.rp1/work/features/feature-1/report.md",
	type: "markdown",
	updatedDuringRun: true,
	isNew: false,
	step: "review",
};

interface MockContentPanelProps {
	readonly content?: string | null;
	readonly error?: string | null;
	readonly isLoading?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	readonly onSaveStatusChange?: (status: SaveStatus) => void;
}

function MockContentPanel({
	content,
	error,
	isLoading,
	onHeadingsExtracted,
	onSaveStatusChange,
}: MockContentPanelProps) {
	useEffect(() => {
		if (content !== null && content !== undefined) {
			onHeadingsExtracted?.([{ id: "intro", text: "Intro", level: 1 }]);
		}
		onSaveStatusChange?.("saved");
	}, [content, onHeadingsExtracted, onSaveStatusChange]);

	return (
		<div
			data-testid="artifact-content-panel"
			data-loading={String(isLoading ?? false)}
			data-content={content ?? ""}
			data-error={error ?? ""}
		>
			{error ?? content ?? ""}
		</div>
	);
}

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
	AnnotationSidebar: ({ artifactPath }: { artifactPath: string }) => (
		<div data-testid="annotation-sidebar" data-artifact-path={artifactPath} />
	),
}));

mock.module("@/components/v2/TableOfContents", () => ({
	TableOfContents: ({ headings }: { headings: readonly HeadingEntry[] }) => (
		<div data-testid="toc">{headings.length}</div>
	),
}));

mock.module("@/components/v2/ContentPanel", () => ({
	ContentPanel: MockContentPanel,
}));

async function importSurface() {
	return import(
		`../../../components/v2/ArtifactContentSurface.tsx?artifact-content-surface-test=${++importVersion}`
	);
}

function renderHeader(controls: ArtifactContentSurfaceControls) {
	return (
		<div>
			<span data-testid="save-status">{controls.saveStatus}</span>
			{controls.showTableOfContentsToggle && (
				<button
					type="button"
					aria-label="Open table of contents"
					onClick={controls.toggleTableOfContents}
				/>
			)}
			{controls.showAnnotationToggle && (
				<button
					type="button"
					aria-label="Toggle annotations"
					onClick={controls.toggleAnnotations}
				/>
			)}
		</div>
	);
}

function surfaceProps(selectedArtifact: Artifact): ArtifactContentSurfaceProps {
	return {
		selectedArtifact,
		runId: "run-content-surface",
		showFrontmatter: true,
		renderHeader,
	};
}

describe("ArtifactContentSurface", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		global.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input);
			const content = url.includes(encodeURIComponent(secondArtifact.path))
				? "# Second artifact"
				: "# First artifact";

			return {
				ok: true,
				json: async () => ({ content }),
			};
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("refreshes content when the selected artifact changes without dropping viewer controls", async () => {
		const { ArtifactContentSurface } = await importSurface();

		const view = render(
			<ArtifactContentSurface {...surfaceProps(firstArtifact)} />,
		);

		await waitFor(() => {
			expect(screen.getByTestId("artifact-content-panel").dataset.content).toBe(
				"# First artifact",
			);
			expect(screen.getByTestId("save-status").textContent).toBe("saved");
			expect(screen.getByLabelText("Open table of contents")).toBeTruthy();
			expect(screen.getByLabelText("Toggle annotations")).toBeTruthy();
		});

		view.rerender(<ArtifactContentSurface {...surfaceProps(secondArtifact)} />);

		await waitFor(() => {
			expect(screen.getByTestId("artifact-content-panel").dataset.content).toBe(
				"# Second artifact",
			);
			expect(screen.getByTestId("save-status").textContent).toBe("saved");
			expect(screen.getByLabelText("Open table of contents")).toBeTruthy();
			expect(screen.getByLabelText("Toggle annotations")).toBeTruthy();
		});
	});
});
