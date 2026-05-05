import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ArtifactSidebar } from "@/components/v2/ArtifactSidebar";
import type { Artifact } from "@/types/runs";

function fileArtifact(docId: string, path: string): Artifact {
	return {
		docId,
		path,
		absolutePath: `/repo/${path}`,
		type: "markdown",
		updatedDuringRun: false,
		isNew: false,
		step: "build",
	};
}

function linkArtifact(): Artifact {
	return {
		docId: "link-reviewed-pr",
		locationKind: "url",
		path: "https://github.com/example/repo/pull/376",
		absolutePath: "https://github.com/example/repo/pull/376",
		type: "other",
		url: "https://github.com/example/repo/pull/376",
		label: "376",
		relationship: "reviewed_pr",
		sourceContext: null,
		sourceArtifactPath: null,
		updatedDuringRun: false,
		isNew: false,
		step: "build",
	};
}

describe("ArtifactSidebar", () => {
	afterEach(() => {
		cleanup();
	});

	test("renders link artifacts with meaningful labels, Link icons, and file-first order", () => {
		const firstFile = fileArtifact("doc-a", "reports/summary.md");
		const secondFile = fileArtifact("doc-b", "reports/details.md");
		const link = linkArtifact();
		const onSelect = mock(() => {});

		render(
			<ArtifactSidebar
				artifacts={[link, firstFile, secondFile]}
				selectedPath={firstFile.path}
				onSelect={onSelect}
			/>,
		);

		const options = screen.getAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual([
			"summary.mdreports",
			"details.mdreports",
			"Reviewed PR #376https://github.com/example/repo/pull/376",
		]);
		expect(options[2]?.querySelector(".lucide-link")).toBeTruthy();
		expect(options[2]?.querySelector(".lucide-external-link")).toBeNull();

		fireEvent.click(options[2] as HTMLElement);

		expect(onSelect).toHaveBeenCalledWith(link);
	});
});
