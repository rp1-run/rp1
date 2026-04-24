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

	test("renders a single horizontal file list for a single artifact", async () => {
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

		expect(screen.queryByRole("heading", { name: "Artifacts" })).toBeNull();
		expect(screen.getByTestId("artifact-content-surface").dataset.docId).toBe(
			"doc-1",
		);
		const fileList = screen.getByRole("list", { name: "Artifacts" });
		const fileButton = within(fileList).getByRole("button", {
			name: /tasks\.md/,
		});
		expect(fileButton.getAttribute("aria-current")).toBe("page");
		expect(screen.queryByRole("tab")).toBeNull();
		expect(screen.getByLabelText("Toggle annotations")).toBeTruthy();
	});

	test("shows one file list for one multi-artifact group", async () => {
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

		expect(screen.queryByRole("tab")).toBeNull();

		const fileList = screen.getByRole("list", { name: "Artifacts" });
		expect(
			within(fileList)
				.getByRole("button", { name: /summary\.md/ })
				.getAttribute("aria-current"),
		).toBe("page");

		fireEvent.click(
			within(fileList).getByRole("button", { name: /report\.md/ }),
		);

		expect(onArtifactSelect).toHaveBeenCalledTimes(1);
		expect(selectedArtifacts).toEqual([secondArtifact]);
	});

	test("uses the first listed artifact when no selection is provided", async () => {
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

		await renderPanel({
			artifactGroups: [
				group("step:build", "Build", "build", [firstArtifact, secondArtifact]),
			],
			selectedArtifact: null,
			selectedStep: step("build", "Build"),
		});

		const fileList = screen.getByRole("list", { name: "Artifacts" });
		expect(
			within(fileList)
				.getByRole("button", { name: /summary\.md/ })
				.getAttribute("aria-current"),
		).toBe("page");
		expect(screen.getByTestId("artifact-content-surface").dataset.docId).toBe(
			"doc-1",
		);
	});

	test("flattens multiple groups into one ordered file list", async () => {
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

		expect(screen.queryByRole("tab")).toBeNull();

		const fileList = screen.getByRole("list", { name: "Artifacts" });
		const fileButtons = within(fileList).getAllByRole("button");
		expect(fileButtons.map((button) => button.textContent)).toEqual([
			"summary.md",
			"report.md",
			"requirements.md",
			"tasks.md",
		]);
		expect(
			within(fileList)
				.getByRole("button", { name: /report\.md/ })
				.getAttribute("aria-current"),
		).toBe("page");

		fireEvent.click(
			within(fileList).getByRole("button", { name: /requirements\.md/ }),
		);

		expect(onArtifactSelect).toHaveBeenCalledTimes(1);
		expect(selectedArtifacts).toEqual([planArtifact]);
	});

	test("orders the selected step group first when no artifact is selected", async () => {
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

		await renderPanel({
			artifactGroups: [
				group("step:plan", "Plan", "plan", [planArtifact]),
				group("step:build", "Build", "build", [buildSummary, buildReport]),
			],
			selectedArtifact: null,
			selectedStep: step("build", "Build"),
		});

		const fileList = screen.getByRole("list", { name: "Artifacts" });
		const fileButtons = within(fileList).getAllByRole("button");
		expect(fileButtons.map((button) => button.textContent)).toEqual([
			"summary.md",
			"report.md",
			"requirements.md",
		]);
		expect(fileButtons[0].getAttribute("aria-current")).toBe("page");
		expect(screen.getByTestId("artifact-content-surface").dataset.docId).toBe(
			"doc-build-summary",
		);
	});

	test("keeps the file list accessible and connected to content", async () => {
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

		const fileList = screen.getByRole("list", { name: "Artifacts" });
		const firstArtifactButton = within(fileList).getByRole("button", {
			name: /build-summary-with-a-long-name\.md/,
		});
		const selectedArtifactButton = within(fileList).getByRole("button", {
			name: /build-report-with-a-long-name\.md/,
		});
		const runArtifactButton = within(fileList).getByRole("button", {
			name: /run-summary-with-a-long-name\.md/,
		});

		expect(firstArtifactButton.hasAttribute("aria-current")).toBe(false);
		expect(runArtifactButton.hasAttribute("aria-current")).toBe(false);
		expect(selectedArtifactButton.getAttribute("aria-current")).toBe("page");
		expect(selectedArtifactButton.getAttribute("title")).toBe(
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
