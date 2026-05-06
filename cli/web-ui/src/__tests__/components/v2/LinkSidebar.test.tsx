import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LinkSidebar } from "@/components/v2/LinkSidebar";
import type { Artifact } from "@/types/runs";

function linkArtifact(): Artifact {
	const url =
		"https://github.com/rp1-run/rp1/pull/377/files/cli/web-ui/src/components/v2/LinkSidebar.tsx?discussion_r=1234567890#diff-very-long-anchor";

	return {
		docId: "link-reviewed-pr",
		locationKind: "url",
		path: url,
		absolutePath: url,
		type: "other",
		url,
		label:
			"Reviewed PR #377 with a deliberately long label that should wrap inside the links panel",
		relationship: "reviewed_pr",
		sourceContext:
			"Generated from the quick-build implementation summary and should remain fully visible in the row.",
		sourceArtifactPath: "quick-builds/2026-05-05-links-panel-copy-tweaks-1.md",
		updatedDuringRun: false,
		isNew: false,
		step: "build",
	};
}

function expectWrappingText(element: HTMLElement): void {
	expect(element.classList.contains("truncate")).toBe(false);
	expect(element.classList.contains("whitespace-normal")).toBe(true);
	expect(element.classList.contains("break-words")).toBe(true);
}

describe("LinkSidebar", () => {
	afterEach(() => {
		cleanup();
	});

	test("keeps the header icon but renders link rows without repeated link icons or truncated text", () => {
		const artifact = linkArtifact();

		render(
			<LinkSidebar
				artifacts={[artifact]}
				onClose={mock(() => {})}
				onOpenLink={mock(() => {})}
			/>,
		);

		const panel = screen.getByLabelText("Links panel");
		const header = panel.querySelector("header");
		expect(header?.querySelector(".lucide-link")).toBeTruthy();

		const openButton = within(panel).getByRole("button", {
			name: `Open ${artifact.label}`,
		});
		expect(openButton.querySelector(".lucide-link")).toBeNull();
		expect(openButton.querySelector(".lucide-external-link")).toBeTruthy();

		expectWrappingText(within(openButton).getByText(artifact.label ?? ""));
		expectWrappingText(within(openButton).getByText(artifact.url ?? ""));
		expectWrappingText(
			within(openButton).getByText(artifact.sourceContext ?? ""),
		);
	});
});
