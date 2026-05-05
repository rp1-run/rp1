import { describe, expect, mock, test } from "bun:test";
import {
	getLinkArtifactContext,
	getLinkArtifactLabel,
	openExternalUrl,
	orderArtifactsWithLinksLast,
} from "../../lib/link-artifacts";
import type { Artifact } from "../../types/runs";

function fileArtifact(docId: string, path = `${docId}.md`): Artifact {
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

function linkArtifact(overrides: Partial<Artifact> = {}): Artifact {
	return {
		docId: "link-reviewed-pr",
		locationKind: "url",
		path: "https://github.com/example/repo/pull/376",
		absolutePath: "https://github.com/example/repo/pull/376",
		type: "other",
		url: "https://github.com/example/repo/pull/376",
		label: "Reviewed PR",
		relationship: "reviewed_pr",
		sourceContext: null,
		sourceArtifactPath: null,
		updatedDuringRun: false,
		isNew: false,
		step: "build",
		...overrides,
	};
}

describe("link artifacts", () => {
	test("derives meaningful labels when persisted labels are opaque", () => {
		expect(getLinkArtifactLabel(linkArtifact({ label: "376" }))).toBe(
			"Reviewed PR #376",
		);
		expect(
			getLinkArtifactLabel(
				linkArtifact({
					label: "https://github.com/example/repo/pull/376",
					relationship: null,
				}),
			),
		).toBe("GitHub PR #376");
	});

	test("keeps the target URL as secondary context", () => {
		const artifact = linkArtifact();

		expect(getLinkArtifactLabel(artifact)).toBe("Reviewed PR");
		expect(getLinkArtifactContext(artifact)).toBe(
			"https://github.com/example/repo/pull/376",
		);
	});

	test("orders external links after file artifacts", () => {
		const link = linkArtifact();
		const firstFile = fileArtifact("first");
		const secondFile = fileArtifact("second");

		expect(orderArtifactsWithLinksLast([link, firstFile, secondFile])).toEqual([
			firstFile,
			secondFile,
			link,
		]);
	});

	test("opens browser-mode links in a new tab", () => {
		const openWindow = mock(() => null);

		openExternalUrl("https://github.com/example/repo/pull/376", {
			hostMode: "browser",
			openWindow,
		});

		expect(openWindow).toHaveBeenCalledWith(
			"https://github.com/example/repo/pull/376",
			"_blank",
			"noopener,noreferrer",
		);
	});

	test("sends native-mode links to the native default-browser bridge", () => {
		const openWindow = mock(() => null);
		const postMessage = mock((_message: string) => {});

		openExternalUrl("https://github.com/example/repo/pull/376", {
			hostMode: "native",
			nativeBridge: { postMessage },
			openWindow,
		});

		expect(openWindow).not.toHaveBeenCalled();
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(postMessage.mock.calls[0]?.[0]))).toEqual({
			type: "message",
			id: "rp1:open-external-url",
			payload: { url: "https://github.com/example/repo/pull/376" },
		});
	});
});
