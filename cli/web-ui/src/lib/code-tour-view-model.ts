import type {
	CodeTourCodeLine,
	CodeTourConcept,
	CodeTourDocument,
	CodeTourEdge,
	CodeTourFragment,
	CodeTourSource,
	CodeTourStep,
} from "../../../shared/code-tour";

export interface CodeTourViewDomain {
	readonly id: string;
	readonly label: string;
	readonly color: string;
}

export interface CodeTourViewConcept {
	readonly id: string;
	readonly label: string;
	readonly domain: CodeTourViewDomain;
	readonly epicenter: boolean;
	readonly summary: string;
	readonly fragmentIds: readonly string[];
	readonly changeCount: number;
}

export interface CodeTourViewFragment {
	readonly id: string;
	readonly conceptId: string;
	readonly label: string;
	readonly path: string;
	readonly line: number | null;
	readonly lineEnd: number | null;
	readonly location: string;
	readonly tree: string | null;
	readonly url: string | null;
	readonly language: string | null;
	readonly code: readonly CodeTourCodeLine[];
	readonly highlightedLines: ReadonlySet<number>;
	readonly domain: CodeTourViewDomain;
	readonly changeCount: number;
}

export interface CodeTourViewEdge {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly label: string;
	readonly kind: string | null;
	readonly fromLabel: string;
	readonly toLabel: string;
}

export interface CodeTourViewStep {
	readonly index: number;
	readonly conceptId: string;
	readonly title: string;
	readonly sub: string;
	readonly reason: string;
}

export interface CodeTourViewModel {
	readonly title: string;
	readonly kind: string;
	readonly source: CodeTourSource;
	readonly sourceLabel: string;
	readonly sourceUrl: string | null;
	readonly domains: readonly CodeTourViewDomain[];
	readonly concepts: readonly CodeTourViewConcept[];
	readonly fragments: readonly CodeTourViewFragment[];
	readonly conceptEdges: readonly CodeTourViewEdge[];
	readonly fragmentEdges: readonly CodeTourViewEdge[];
	readonly steps: readonly CodeTourViewStep[];
	readonly conceptById: ReadonlyMap<string, CodeTourViewConcept>;
	readonly fragmentById: ReadonlyMap<string, CodeTourViewFragment>;
	readonly fragmentsByConceptId: ReadonlyMap<
		string,
		readonly CodeTourViewFragment[]
	>;
}

export const buildCodeTourViewModel = (
	document: CodeTourDocument,
): CodeTourViewModel => {
	const domains = Object.entries(document.domains).map(([id, domain]) => ({
		id,
		label: domain.label,
		color: domain.color,
	}));
	const domainById = new Map(domains.map((domain) => [domain.id, domain]));
	const fallbackDomain = domains[0] ?? {
		id: "unknown",
		label: "Unknown",
		color: "#7ad0ff",
	};
	const rawConceptById = new Map(
		document.concepts.map((concept) => [concept.id, concept]),
	);
	const conceptIdByFragmentId = conceptFragmentLookup(document.concepts);

	const fragments = document.fragments.map((fragment) => {
		const conceptId = conceptIdByFragmentId.get(fragment.id) ?? "";
		const concept = rawConceptById.get(conceptId);
		const domain = domainById.get(concept?.domain ?? "") ?? fallbackDomain;

		return buildFragmentView(document, fragment, conceptId, domain);
	});
	const fragmentById = new Map(
		fragments.map((fragment) => [fragment.id, fragment]),
	);
	const fragmentsByConceptId = groupFragmentsByConcept(fragments);

	const concepts = document.concepts.map((concept) =>
		buildConceptView(
			concept,
			domainById.get(concept.domain) ?? fallbackDomain,
			fragmentById,
		),
	);
	const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
	const steps = buildSteps(document.tour, concepts);

	return {
		title: document.title,
		kind: document.kind,
		source: document.source,
		sourceLabel: sourceLabelForCodeTour(document),
		sourceUrl: document.source.url ?? null,
		domains,
		concepts,
		fragments,
		conceptEdges: buildEdges(
			document.edges?.concept ?? [],
			conceptById,
			"concept",
		),
		fragmentEdges: buildEdges(
			document.edges?.fragment ?? [],
			fragmentById,
			"fragment",
		),
		steps,
		conceptById,
		fragmentById,
		fragmentsByConceptId,
	};
};

export const countChangedLines = (lines: readonly CodeTourCodeLine[]): number =>
	lines.filter((line) => line.type === "add" || line.type === "del").length;

export const codeLineText = (line: CodeTourCodeLine): string =>
	line.tokens.map(([, text]) => text).join("");

export const codeLinePrefix = (line: CodeTourCodeLine): "+" | "-" | " " => {
	if (line.type === "add") return "+";
	if (line.type === "del") return "-";
	return " ";
};

const buildConceptView = (
	concept: CodeTourConcept,
	domain: CodeTourViewDomain,
	fragmentById: ReadonlyMap<string, CodeTourViewFragment>,
): CodeTourViewConcept => {
	const fragments = concept.fragments
		.map((fragmentId) => fragmentById.get(fragmentId))
		.filter(
			(fragment): fragment is CodeTourViewFragment => fragment !== undefined,
		);

	return {
		id: concept.id,
		label: concept.label,
		domain,
		epicenter: concept.epicenter === true,
		summary: readableInlineText(concept.summary ?? ""),
		fragmentIds: fragments.map((fragment) => fragment.id),
		changeCount: fragments.reduce(
			(total, fragment) => total + fragment.changeCount,
			0,
		),
	};
};

const buildFragmentView = (
	document: CodeTourDocument,
	fragment: CodeTourFragment,
	conceptId: string,
	domain: CodeTourViewDomain,
): CodeTourViewFragment => ({
	id: fragment.id,
	conceptId,
	label: fragment.label,
	path: fragment.path,
	line: fragment.line ?? null,
	lineEnd: fragment.lineEnd ?? null,
	location: formatFragmentLocation(fragment),
	tree: fragment.tree ?? null,
	url: urlForCodeTourFragment(document, fragment),
	language: fragment.language ?? null,
	code: fragment.code,
	highlightedLines: new Set(fragment.highlight?.lines ?? []),
	domain,
	changeCount: countChangedLines(fragment.code),
});

const buildSteps = (
	steps: readonly CodeTourStep[] | undefined,
	concepts: readonly CodeTourViewConcept[],
): readonly CodeTourViewStep[] => {
	const conceptIds = new Set(concepts.map((concept) => concept.id));
	const explicitSteps =
		steps
			?.filter((step) => conceptIds.has(step.conceptId))
			.map((step, index) => ({
				index,
				conceptId: step.conceptId,
				title: step.title,
				sub: step.sub ?? "",
				reason: readableInlineText(step.reason ?? ""),
			})) ?? [];

	if (explicitSteps.length > 0) {
		return explicitSteps;
	}

	return concepts.map((concept, index) => ({
		index,
		conceptId: concept.id,
		title: concept.label,
		sub: concept.domain.label,
		reason: concept.summary,
	}));
};

const buildEdges = <T extends { readonly id: string; readonly label: string }>(
	edges: readonly CodeTourEdge[],
	lookup: ReadonlyMap<string, T>,
	scope: "concept" | "fragment",
): readonly CodeTourViewEdge[] =>
	edges
		.map((edge, index) => {
			const from = lookup.get(edge.from);
			const to = lookup.get(edge.to);
			if (!from || !to) return null;

			return {
				id: `${scope}:${edge.from}->${edge.to}:${index}`,
				from: edge.from,
				to: edge.to,
				label: edge.label?.trim() || relationshipFallbackLabel(edge.kind),
				kind: edge.kind ?? null,
				fromLabel: from.label,
				toLabel: to.label,
			};
		})
		.filter((edge): edge is CodeTourViewEdge => edge !== null);

const relationshipFallbackLabel = (kind: string | undefined): string => {
	if (!kind) return "related";
	return kind.replaceAll("-", " ");
};

const conceptFragmentLookup = (
	concepts: readonly CodeTourConcept[],
): ReadonlyMap<string, string> => {
	const conceptIdByFragmentId = new Map<string, string>();

	for (const concept of concepts) {
		for (const fragmentId of concept.fragments) {
			if (!conceptIdByFragmentId.has(fragmentId)) {
				conceptIdByFragmentId.set(fragmentId, concept.id);
			}
		}
	}

	return conceptIdByFragmentId;
};

const groupFragmentsByConcept = (
	fragments: readonly CodeTourViewFragment[],
): ReadonlyMap<string, readonly CodeTourViewFragment[]> => {
	const groups = new Map<string, CodeTourViewFragment[]>();

	for (const fragment of fragments) {
		const group = groups.get(fragment.conceptId) ?? [];
		group.push(fragment);
		groups.set(fragment.conceptId, group);
	}

	return groups;
};

const formatFragmentLocation = (fragment: CodeTourFragment): string => {
	const line = fragment.line;
	const lineEnd = fragment.lineEnd;
	if (line === undefined) return fragment.path;
	if (lineEnd !== undefined && lineEnd !== line) {
		return `${fragment.path}:${line}-${lineEnd}`;
	}
	return `${fragment.path}:${line}`;
};

const urlForCodeTourFragment = (
	document: CodeTourDocument,
	fragment: CodeTourFragment | undefined,
): string | null => {
	if (!fragment) return null;
	if (fragment.url) return fragment.url;

	const source = document.source;
	if (source.kind === "github-pr" && source.repo && source.id) {
		return `https://github.com/${source.repo}/pull/${source.id}/files#${fragment.id}`;
	}

	if (source.kind === "branch" && source.repo && source.ref) {
		return `https://github.com/${source.repo}/blob/${source.ref}/${fragment.path}#L${fragment.line ?? 1}`;
	}

	return null;
};

const sourceLabelForCodeTour = (document: CodeTourDocument): string => {
	const { source } = document;
	const repo = source.repo ?? "";

	if (source.kind === "github-pr" && source.id) {
		return repo ? `${repo} / PR #${source.id}` : `PR #${source.id}`;
	}
	if (source.kind === "gitlab-mr" && source.id) {
		return repo ? `${repo} / MR !${source.id}` : `MR !${source.id}`;
	}
	if (source.kind === "branch") {
		return repo
			? `${repo} / ${source.ref ?? "branch"}`
			: (source.ref ?? "branch");
	}
	if (document.kind === "feature-tour") {
		return repo ? `${repo} / Feature tour` : "Feature tour";
	}
	if (document.kind === "onboarding") {
		return repo ? `${repo} / Onboarding` : "Onboarding";
	}
	if (document.kind === "investigation") {
		return repo ? `${repo} / Investigation` : "Investigation";
	}
	if (document.kind === "architecture") {
		return repo ? `${repo} / Architecture` : "Architecture";
	}
	if (document.kind === "refactor-impact") {
		return repo ? `${repo} / Refactor impact` : "Refactor impact";
	}

	return repo || document.kind;
};

const readableInlineText = (value: string): string =>
	value.replaceAll(/<\/?(?:b|strong|em|i|code)>/g, "").trim();
