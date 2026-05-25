import {
	buildCodeTourViewModel,
	type CodeTourViewModel,
} from "@/lib/code-tour-view-model";
import type { Artifact } from "@/types/runs";
import {
	formatCodeTourValidationIssues,
	parseCodeTourDocument,
} from "../../../shared/code-tour";

export type CodeTourSourceResult =
	| {
			readonly kind: "tour";
			readonly tour: CodeTourViewModel;
	  }
	| {
			readonly kind: "diagnostic";
			readonly message: string;
			readonly detail: string;
	  };

export const isCodeTourJsonArtifactCandidate = (path: string): boolean => {
	const normalizedPath = path.replace(/^\.rp1\/work\//, "");
	const lowerPath = normalizedPath.toLowerCase();

	return (
		lowerPath.endsWith(".json") &&
		(lowerPath.startsWith("pr-walkthroughs/") ||
			lowerPath.includes("/pr-walkthroughs/"))
	);
};

export const parseCodeTourSource = ({
	artifact,
	path,
	content,
}: {
	readonly artifact?: Pick<Artifact, "locationKind" | "path"> | null;
	readonly path?: string | null;
	readonly content: string;
}): CodeTourSourceResult | null => {
	if (artifact?.locationKind === "url") return null;

	const artifactPath = artifact?.path ?? path ?? "";
	const isJsonArtifact = artifactPath.toLowerCase().endsWith(".json");
	const isCodeTourCandidate = isCodeTourJsonArtifactCandidate(artifactPath);
	if (!isJsonArtifact && !isCodeTourCandidate) return null;

	const parsed = parseCodeTourDocument(content);
	if (parsed.ok) {
		return {
			kind: "tour",
			tour: buildCodeTourViewModel(parsed.document),
		};
	}

	if (!isCodeTourCandidate) return null;

	return {
		kind: "diagnostic",
		message:
			"This Code Tour artifact could not be rendered. Showing the source JSON instead.",
		detail: formatCodeTourValidationIssues(parsed.issues),
	};
};
