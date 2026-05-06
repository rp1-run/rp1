import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import type {
	ArtifactContentSurfaceControls,
	ArtifactContentSurfaceProps,
} from "@/components/v2/ArtifactContentSurface";
import type { ArtifactContentMode } from "@/components/v2/ContentPanel";
import type { SaveStatus } from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import type { WalkthroughDeck } from "@/lib/walkthrough-slide-source";
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

const walkthroughArtifact: Artifact = {
	docId: "doc-walkthrough",
	path: ".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.md",
	absolutePath: "/repo/.rp1/work/pr-walkthroughs/pr-42-walkthrough-001.md",
	type: "markdown",
	updatedDuringRun: true,
	isNew: false,
	step: "pr-walkthrough",
};

const prReviewArtifact: Artifact = {
	docId: "doc-pr-review",
	path: ".rp1/work/pr-reviews/pr-42-review.md",
	absolutePath: "/repo/.rp1/work/pr-reviews/pr-42-review.md",
	type: "markdown",
	updatedDuringRun: true,
	isNew: false,
	step: "pr-review",
};

const walkthroughSlideSource = `---
rp1_contract: pr-walkthrough-slide-source
rp1_contract_version: "1.0.0"
rp1_review_id: pr-42
rp1_evidence_ids:
  - E-PR-001
---
# PR Walkthrough: Checkout Reader

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 0
evidence: [E-PR-001]
-->
## At A Glance

Review the checkout reader. E-PR-001

<!-- rp1-notes -->
Speaker notes preserve E-PR-001.
`;

const invalidWalkthroughSlideSource = `---
rp1_contract: pr-walkthrough-slide-source
rp1_contract_version: "1.0.0"
---
# PR Walkthrough: Invalid

<!-- rp1-slide: diagonal -->
`;

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
		json: async () => ({ content }),
	} as Response;
}

function artifactNotFoundResponse(path: string): Response {
	return {
		ok: false,
		statusText: "Not Found",
		json: async () => ({ error: `Artifact not found: ${path}` }),
	} as Response;
}

interface MockContentPanelProps {
	readonly content?: string | null;
	readonly error?: string | null;
	readonly isLoading?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	readonly onSaveStatusChange?: (status: SaveStatus) => void;
	readonly contentMode?: ArtifactContentMode;
	readonly walkthroughDeck?: WalkthroughDeck | null;
	readonly walkthroughFallbackMessage?: string | null;
	readonly onContentModeChange?: (mode: ArtifactContentMode) => void;
	readonly onWalkthroughRenderFailure?: (message: string) => void;
}

function MockContentPanel({
	content,
	error,
	isLoading,
	onHeadingsExtracted,
	onSaveStatusChange,
	contentMode = "markdown",
	walkthroughDeck = null,
	walkthroughFallbackMessage = null,
	onWalkthroughRenderFailure,
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
			data-content-mode={contentMode}
			data-deck-title={walkthroughDeck?.title ?? ""}
			data-fallback-message={walkthroughFallbackMessage ?? ""}
		>
			{walkthroughDeck ? (
				<button
					type="button"
					aria-label="Mock reader render failure"
					onClick={() =>
						onWalkthroughRenderFailure?.(
							"Mock reader failed. Showing markdown.",
						)
					}
				>
					Fail reader
				</button>
			) : null}
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
			{controls.slideModeAvailable &&
				controls.contentMode &&
				controls.setContentMode && (
					<fieldset aria-label="Artifact viewing mode">
						<button
							type="button"
							aria-pressed={controls.contentMode === "slides"}
							onClick={() => controls.setContentMode?.("slides")}
						>
							Slides
						</button>
						<button
							type="button"
							aria-pressed={controls.contentMode === "markdown"}
							onClick={() => controls.setContentMode?.("markdown")}
						>
							Markdown
						</button>
					</fieldset>
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

	test("ignores stale artifact fetch errors after the selected artifact changes", async () => {
		const firstFetch = deferred<Response>();
		const secondFetch = deferred<Response>();
		global.fetch = mock((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(encodeURIComponent(firstArtifact.path))) {
				return firstFetch.promise;
			}
			if (url.includes(encodeURIComponent(secondArtifact.path))) {
				return secondFetch.promise;
			}
			return Promise.resolve(artifactNotFoundResponse(".rp1/work/unknown.md"));
		}) as unknown as typeof fetch;

		const { ArtifactContentSurface } = await importSurface();

		const view = render(
			<ArtifactContentSurface {...surfaceProps(firstArtifact)} />,
		);

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		view.rerender(<ArtifactContentSurface {...surfaceProps(secondArtifact)} />);

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});
		secondFetch.resolve(contentResponse("# Second artifact"));

		await waitFor(() => {
			const panel = screen.getByTestId("artifact-content-panel");
			expect(panel.dataset.content).toBe("# Second artifact");
			expect(panel.dataset.error).toBe("");
		});

		firstFetch.resolve(artifactNotFoundResponse(firstArtifact.path));
		await new Promise((resolve) => setTimeout(resolve, 0));

		const panel = screen.getByTestId("artifact-content-panel");
		expect(panel.dataset.content).toBe("# Second artifact");
		expect(panel.dataset.error).toBe("");
	});

	test("opens supported walkthrough artifacts in slide mode and allows markdown selection", async () => {
		global.fetch = mock(async () =>
			contentResponse(walkthroughSlideSource),
		) as unknown as typeof fetch;
		const { ArtifactContentSurface } = await importSurface();

		render(<ArtifactContentSurface {...surfaceProps(walkthroughArtifact)} />);

		await waitFor(() => {
			const panel = screen.getByTestId("artifact-content-panel");
			expect(panel.dataset.contentMode).toBe("slides");
			expect(panel.dataset.deckTitle).toBe("PR Walkthrough: Checkout Reader");
		});

		expect(
			screen.getByRole("group", { name: "Artifact viewing mode" }),
		).toBeTruthy();
		expect(
			screen
				.getByRole("button", { name: "Slides" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		fireEvent.click(screen.getByRole("button", { name: "Markdown" }));

		await waitFor(() => {
			expect(
				screen.getByTestId("artifact-content-panel").dataset.contentMode,
			).toBe("markdown");
		});
		expect(
			screen
				.getByRole("button", { name: "Markdown" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	test("falls back to markdown when the walkthrough contract is invalid", async () => {
		global.fetch = mock(async () =>
			contentResponse(invalidWalkthroughSlideSource),
		) as unknown as typeof fetch;
		const { ArtifactContentSurface } = await importSurface();

		render(<ArtifactContentSurface {...surfaceProps(walkthroughArtifact)} />);

		await waitFor(() => {
			const panel = screen.getByTestId("artifact-content-panel");
			expect(panel.dataset.contentMode).toBe("markdown");
			expect(panel.dataset.deckTitle).toBe("");
			expect(panel.dataset.fallbackMessage).toContain("unsupported direction");
		});

		expect(screen.queryByRole("button", { name: "Slides" })).toBeNull();
	});

	test("does not infer walkthrough support from ordinary pr-review artifacts", async () => {
		global.fetch = mock(async () =>
			contentResponse("---\nrp1_contract: pr-review\n---\n# PR Review\n"),
		) as unknown as typeof fetch;
		const { ArtifactContentSurface } = await importSurface();

		render(<ArtifactContentSurface {...surfaceProps(prReviewArtifact)} />);

		await waitFor(() => {
			const panel = screen.getByTestId("artifact-content-panel");
			expect(panel.dataset.contentMode).toBe("markdown");
			expect(panel.dataset.deckTitle).toBe("");
			expect(panel.dataset.content).toContain("# PR Review");
		});
		expect(screen.queryByRole("button", { name: "Slides" })).toBeNull();
	});

	test("switches to markdown with a reviewer-facing message after reader failure", async () => {
		global.fetch = mock(async () =>
			contentResponse(walkthroughSlideSource),
		) as unknown as typeof fetch;
		const { ArtifactContentSurface } = await importSurface();

		render(<ArtifactContentSurface {...surfaceProps(walkthroughArtifact)} />);

		await waitFor(() => {
			expect(
				screen.getByTestId("artifact-content-panel").dataset.contentMode,
			).toBe("slides");
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Mock reader render failure" }),
		);

		await waitFor(() => {
			const panel = screen.getByTestId("artifact-content-panel");
			expect(panel.dataset.contentMode).toBe("markdown");
			expect(panel.dataset.fallbackMessage).toBe(
				"Mock reader failed. Showing markdown.",
			);
		});
	});
});
