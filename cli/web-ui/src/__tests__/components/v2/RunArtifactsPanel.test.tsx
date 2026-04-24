import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import type { ArtifactContentSurfaceControls } from "@/components/v2/ArtifactContentSurface";
import type { ArtifactGroup } from "@/lib/artifact-groups";
import type { Artifact, Step } from "@/types/runs";

let importVersion = 0;

interface MockArtifactContentSurfaceProps {
	readonly selectedArtifact: Artifact | null;
	readonly runId?: string;
	readonly showFrontmatter?: boolean;
	readonly emptyMessage?: string;
	readonly renderHeader?: (
		controls: ArtifactContentSurfaceControls,
	) => ReactNode;
}

mock.module("@/components/v2/ArtifactContentSurface", () => ({
	ArtifactContentSurface: ({
		selectedArtifact,
		runId,
		showFrontmatter,
		emptyMessage,
		renderHeader,
	}: MockArtifactContentSurfaceProps) => (
		<section
			data-testid="artifact-content-surface"
			data-doc-id={selectedArtifact?.docId ?? ""}
			data-run-id={runId ?? ""}
			data-show-frontmatter={String(showFrontmatter ?? false)}
		>
			{renderHeader?.({
				selectedArtifact,
				saveStatus: "idle",
				showTableOfContentsToggle: true,
				toggleTableOfContents: () => {},
				showAnnotationToggle: selectedArtifact !== null,
				toggleAnnotations: () => {},
			})}
			<div data-testid="surface-body">
				{selectedArtifact?.path ?? emptyMessage ?? ""}
			</div>
		</section>
	),
}));

mock.module("@/components/v2/AnnotationToggleBtn", () => ({
	AnnotationToggleBtn: ({
		artifactPath,
	}: {
		readonly artifactPath: string;
	}) => (
		<button
			type="button"
			aria-label="Toggle annotations"
			data-artifact-path={artifactPath}
		>
			Annotations
		</button>
	),
}));

mock.module("@/components/v2/ArtifactEmptyState", () => ({
	ArtifactEmptyState: () => (
		<output aria-label="Waiting for artifacts" data-testid="empty-state" />
	),
}));

async function importPanel() {
	return import(
		`../../../components/v2/RunArtifactsPanel.tsx?run-artifacts-panel-test=${++importVersion}`
	);
}

function step(id: string, name: string): Step {
	return {
		id,
		name,
		status: "running",
		startedAt: null,
		completedAt: null,
		taskCount: null,
		completedTaskCount: null,
	};
}

function artifact(
	docId: string,
	stepId: string | null,
	path: string,
): Artifact {
	return {
		docId,
		path,
		absolutePath: `/repo/${path}`,
		type: "markdown",
		updatedDuringRun: true,
		isNew: true,
		step: stepId,
	};
}

function group(
	id: string,
	label: string,
	stepId: string | null,
	artifacts: readonly Artifact[],
): ArtifactGroup {
	return {
		id,
		label,
		stepId,
		artifacts,
	};
}

async function renderPanel({
	artifactGroups,
	selectedArtifact,
	selectedStep = null,
	onArtifactSelect,
}: {
	readonly artifactGroups: readonly ArtifactGroup[];
	readonly selectedArtifact: Artifact | null;
	readonly selectedStep?: Step | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
}) {
	const { RunArtifactsPanel } = await importPanel();

	return render(
		<RunArtifactsPanel
			artifactGroups={artifactGroups}
			selectedArtifact={selectedArtifact}
			selectedStep={selectedStep}
			onArtifactSelect={onArtifactSelect}
			runId="run-1"
			subflowDiagram={null}
			showFrontmatter={true}
		/>,
	);
}

describe("RunArtifactsPanel", () => {
	afterEach(() => {
		cleanup();
		document.body.innerHTML = "";
	});

	test("renders the empty state when no run artifacts exist", async () => {
		await renderPanel({
			artifactGroups: [],
			selectedArtifact: null,
		});

		expect(
			screen.getByRole("status", { name: "Waiting for artifacts" }),
		).toBeTruthy();
		expect(screen.queryByTestId("artifact-content-surface")).toBeNull();
	});

	test("omits group and artifact chrome for a single artifact", async () => {
		const onlyArtifact = artifact(
			"doc-1",
			"build",
			".rp1/work/features/example/tasks.md",
		);

		await renderPanel({
			artifactGroups: [group("step:build", "Build", "build", [onlyArtifact])],
			selectedArtifact: onlyArtifact,
			selectedStep: step("build", "Build"),
		});

		expect(screen.getByRole("heading", { name: "tasks.md" })).toBeTruthy();
		expect(screen.getByTestId("artifact-content-surface").dataset.docId).toBe(
			"doc-1",
		);
		expect(
			screen.queryByRole("tablist", { name: "Artifact groups" }),
		).toBeNull();
		expect(screen.queryByRole("tab")).toBeNull();
		expect(screen.getByLabelText("Toggle annotations")).toBeTruthy();
	});

	test("shows artifact tabs without a group selector for one multi-artifact group", async () => {
		const firstArtifact = artifact(
			"doc-1",
			"build",
			".rp1/work/features/example/summary.md",
		);
		const secondArtifact = artifact(
			"doc-2",
			"build",
			".rp1/work/features/example/report.md",
		);
		const selectedArtifacts: Artifact[] = [];
		const onArtifactSelect = mock((selected: Artifact) => {
			selectedArtifacts.push(selected);
		});

		await renderPanel({
			artifactGroups: [
				group("step:build", "Build", "build", [firstArtifact, secondArtifact]),
			],
			selectedArtifact: firstArtifact,
			selectedStep: step("build", "Build"),
			onArtifactSelect,
		});

		expect(
			screen.queryByRole("tablist", { name: "Artifact groups" }),
		).toBeNull();

		const tabs = screen.getByRole("tablist", { name: "Artifacts in Build" });
		expect(
			within(tabs)
				.getByRole("tab", { name: /summary\.md/ })
				.getAttribute("aria-selected"),
		).toBe("true");

		fireEvent.click(within(tabs).getByRole("tab", { name: /report\.md/ }));

		expect(onArtifactSelect).toHaveBeenCalledTimes(1);
		expect(selectedArtifacts).toEqual([secondArtifact]);
	});

	test("shows group selector and scoped tabs for multiple groups", async () => {
		const planArtifact = artifact(
			"doc-plan",
			"plan",
			".rp1/work/features/example/requirements.md",
		);
		const buildSummary = artifact(
			"doc-build-summary",
			"build",
			".rp1/work/features/example/summary.md",
		);
		const buildReport = artifact(
			"doc-build-report",
			"build",
			".rp1/work/features/example/report.md",
		);
		const runArtifact = artifact(
			"doc-run",
			null,
			".rp1/work/features/example/tasks.md",
		);
		const selectedArtifacts: Artifact[] = [];
		const onArtifactSelect = mock((selected: Artifact) => {
			selectedArtifacts.push(selected);
		});

		await renderPanel({
			artifactGroups: [
				group("step:plan", "Plan", "plan", [planArtifact]),
				group("step:build", "Build", "build", [buildSummary, buildReport]),
				group("run", "Run artifacts", null, [runArtifact]),
			],
			selectedArtifact: buildReport,
			selectedStep: step("build", "Build"),
			onArtifactSelect,
		});

		const groups = screen.getByRole("tablist", { name: "Artifact groups" });
		expect(
			within(groups)
				.getByRole("tab", { name: /Build/ })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(within(groups).getByRole("tab", { name: /Plan/ })).toBeTruthy();
		expect(
			within(groups).getByRole("tab", { name: /Run artifacts/ }),
		).toBeTruthy();

		const buildTabs = screen.getByRole("tablist", {
			name: "Artifacts in Build",
		});
		expect(
			within(buildTabs).getByRole("tab", { name: /summary\.md/ }),
		).toBeTruthy();
		expect(
			within(buildTabs)
				.getByRole("tab", { name: /report\.md/ })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(screen.queryByRole("tab", { name: /requirements\.md/ })).toBeNull();

		fireEvent.click(within(groups).getByRole("tab", { name: /Plan/ }));

		expect(onArtifactSelect).toHaveBeenCalledTimes(1);
		expect(selectedArtifacts).toEqual([planArtifact]);
	});

	test("keeps grouped tab rows accessible and connected to content", async () => {
		const firstArtifact = artifact(
			"doc-build-summary",
			"build",
			".rp1/work/features/example/build-summary-with-a-long-name.md",
		);
		const secondArtifact = artifact(
			"doc-build-report",
			"build",
			".rp1/work/features/example/build-report-with-a-long-name.md",
		);
		const runArtifact = artifact(
			"doc-run",
			null,
			".rp1/work/features/example/run-summary-with-a-long-name.md",
		);

		await renderPanel({
			artifactGroups: [
				group("step:build", "Build Outputs", "build", [
					firstArtifact,
					secondArtifact,
				]),
				group("run", "Run artifacts", null, [runArtifact]),
			],
			selectedArtifact: secondArtifact,
			selectedStep: step("build", "Build Outputs"),
		});

		const groupTabs = screen.getByRole("tablist", {
			name: "Artifact groups",
		});
		const artifactTabs = screen.getByRole("tablist", {
			name: "Artifacts in Build Outputs",
		});
		const selectedGroupTab = within(groupTabs).getByRole("tab", {
			name: /Build Outputs/,
		});
		const runGroupTab = within(groupTabs).getByRole("tab", {
			name: /Run artifacts/,
		});
		const firstArtifactTab = within(artifactTabs).getByRole("tab", {
			name: /build-summary-with-a-long-name\.md/,
		});
		const selectedArtifactTab = within(artifactTabs).getByRole("tab", {
			name: /build-report-with-a-long-name\.md/,
		});

		expect(selectedGroupTab.getAttribute("aria-selected")).toBe("true");
		expect(runGroupTab.getAttribute("aria-selected")).toBe("false");
		expect(firstArtifactTab.getAttribute("aria-selected")).toBe("false");
		expect(selectedArtifactTab.getAttribute("aria-selected")).toBe("true");
		expect(selectedArtifactTab.getAttribute("title")).toBe(
			secondArtifact.absolutePath,
		);
		expect(screen.getByTestId("artifact-content-surface").dataset.docId).toBe(
			"doc-build-report",
		);
		expect(screen.getByTestId("surface-body").textContent).toBe(
			secondArtifact.path,
		);
	});
});
