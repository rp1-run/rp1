import { stripFrontmatter } from "@/lib/frontmatter";

export const WALKTHROUGH_SLIDE_CONTRACT = "pr-walkthrough-slide-source";
export const SUPPORTED_WALKTHROUGH_SLIDE_CONTRACT_VERSIONS = ["1.0.0"] as const;

const HORIZONTAL_SLIDE_MARKER = "<!-- rp1-slide: horizontal -->";
const VERTICAL_SLIDE_MARKER = "<!-- rp1-slide: vertical -->";
const NOTES_MARKER = "<!-- rp1-notes -->";
const SLIDE_META_OPEN = "<!-- rp1-slide-meta";
const SLIDE_META_CLOSE = "-->";
const DEFAULT_TITLE = "PR Walkthrough";

type SlideMarkerKind = "horizontal" | "vertical";

export type WalkthroughSlideSourceFallbackReason =
	| "non-file-artifact"
	| "unsupported-artifact-type"
	| "missing-frontmatter"
	| "unsupported-contract"
	| "unsupported-contract-version"
	| "invalid-slide-marker"
	| "missing-horizontal-slide"
	| "vertical-without-horizontal"
	| "missing-slide-metadata"
	| "invalid-slide-metadata"
	| "invalid-slide-depth";

export interface WalkthroughSlideSourceArtifact {
	readonly path: string;
	readonly type: string;
	readonly locationKind?: string | null;
}

export interface WalkthroughSlideSourceInput {
	readonly artifact: WalkthroughSlideSourceArtifact | null;
	readonly markdown: string;
}

export interface WalkthroughDeck {
	readonly title: string;
	readonly reviewId: string | null;
	readonly slides: readonly WalkthroughSlideGroup[];
	readonly evidenceIds: readonly string[];
}

export interface WalkthroughSlideGroup {
	readonly horizontal: WalkthroughSlide;
	readonly vertical: readonly WalkthroughSlide[];
}

export interface WalkthroughSlide {
	readonly id: string;
	readonly role: string | null;
	readonly depth: number;
	readonly evidenceIds: readonly string[];
	readonly markdown: string;
	readonly notesMarkdown: string | null;
}

export interface WalkthroughSlideSourceDeckResult {
	readonly kind: "deck";
	readonly deck: WalkthroughDeck;
	readonly sourceMarkdown: string;
}

export interface WalkthroughSlideSourceFallbackResult {
	readonly kind: "fallback";
	readonly reason: WalkthroughSlideSourceFallbackReason;
	readonly message: string;
	readonly sourceMarkdown: string;
}

export type WalkthroughSlideSourceResult =
	| WalkthroughSlideSourceDeckResult
	| WalkthroughSlideSourceFallbackResult;

interface SlideMarker {
	readonly kind: SlideMarkerKind;
	readonly lineIndex: number;
}

interface ParsedSlideMetadata {
	readonly id: string;
	readonly role: string | null;
	readonly depth: number;
	readonly evidenceIds: readonly string[];
}

interface FenceState {
	readonly marker: "`" | "~";
	readonly length: number;
}

type ParsedFields = Readonly<Record<string, unknown>>;

export function parseWalkthroughSlideSource({
	artifact,
	markdown,
}: WalkthroughSlideSourceInput): WalkthroughSlideSourceResult {
	const artifactFallback = validateArtifact(artifact, markdown);
	if (artifactFallback) return artifactFallback;

	const { body, frontmatter } = stripFrontmatter(markdown);
	if (!frontmatter) {
		return fallback(
			"missing-frontmatter",
			"Artifact has no frontmatter.",
			markdown,
		);
	}

	const frontmatterFields = parseDelimitedFields(frontmatter);
	if (asString(frontmatterFields.rp1_contract) !== WALKTHROUGH_SLIDE_CONTRACT) {
		return fallback(
			"unsupported-contract",
			"Artifact does not declare the PR walkthrough slide contract.",
			markdown,
		);
	}

	const contractVersion = asString(frontmatterFields.rp1_contract_version);
	if (
		!contractVersion ||
		!SUPPORTED_WALKTHROUGH_SLIDE_CONTRACT_VERSIONS.includes(
			contractVersion as (typeof SUPPORTED_WALKTHROUGH_SLIDE_CONTRACT_VERSIONS)[number],
		)
	) {
		return fallback(
			"unsupported-contract-version",
			"Artifact declares an unsupported PR walkthrough slide contract version.",
			markdown,
		);
	}

	const lines = body.split(/\r?\n/);
	const markerResult = collectSlideMarkers(lines);
	if (markerResult.kind === "fallback") {
		return fallback(markerResult.reason, markerResult.message, markdown);
	}

	if (markerResult.markers[0]?.kind === "vertical") {
		return fallback(
			"vertical-without-horizontal",
			"Vertical walkthrough slides must follow a horizontal parent slide.",
			markdown,
		);
	}

	if (!markerResult.markers.some((marker) => marker.kind === "horizontal")) {
		return fallback(
			"missing-horizontal-slide",
			"Artifact contains no horizontal walkthrough slide marker.",
			markdown,
		);
	}

	const buildResult = buildDeck({
		lines,
		markers: markerResult.markers,
		frontmatterFields,
		markdown,
	});
	if (buildResult.kind === "fallback") return buildResult;

	return {
		kind: "deck",
		deck: buildResult.deck,
		sourceMarkdown: markdown,
	};
}

export function isWalkthroughSlideDeckResult(
	result: WalkthroughSlideSourceResult,
): result is WalkthroughSlideSourceDeckResult {
	return result.kind === "deck";
}

function validateArtifact(
	artifact: WalkthroughSlideSourceArtifact | null,
	markdown: string,
): WalkthroughSlideSourceFallbackResult | null {
	if (!artifact || artifact.locationKind === "url") {
		return fallback(
			"non-file-artifact",
			"Only file-backed markdown artifacts can be opened as walkthrough slides.",
			markdown,
		);
	}

	const isMarkdownType = artifact.type === "markdown";
	const isMarkdownPath = /\.(md|mdx)$/i.test(artifact.path);
	if (!isMarkdownType && !isMarkdownPath) {
		return fallback(
			"unsupported-artifact-type",
			"Only markdown artifacts can be opened as walkthrough slides.",
			markdown,
		);
	}

	return null;
}

function fallback(
	reason: WalkthroughSlideSourceFallbackReason,
	message: string,
	sourceMarkdown: string,
): WalkthroughSlideSourceFallbackResult {
	return { kind: "fallback", reason, message, sourceMarkdown };
}

function buildDeck({
	lines,
	markers,
	frontmatterFields,
	markdown,
}: {
	readonly lines: readonly string[];
	readonly markers: readonly SlideMarker[];
	readonly frontmatterFields: ParsedFields;
	readonly markdown: string;
}): WalkthroughSlideSourceResult {
	const groups: WalkthroughSlideGroup[] = [];
	const evidenceIds = new Set<string>(
		asStringArray(frontmatterFields.rp1_evidence_ids),
	);
	const slideIds = new Set<string>();

	for (const [markerIndex, marker] of markers.entries()) {
		if (marker.kind === "vertical" && groups.length === 0) {
			return fallback(
				"vertical-without-horizontal",
				"Vertical walkthrough slides must follow a horizontal parent slide.",
				markdown,
			);
		}

		const nextMarker = markers[markerIndex + 1];
		const slideEndLine = nextMarker?.lineIndex ?? lines.length;
		const metadataResult = parseSlideMetadata(lines, marker, slideEndLine);
		if (metadataResult.kind === "fallback") {
			return fallback(metadataResult.reason, metadataResult.message, markdown);
		}

		const metadata = metadataResult.metadata;
		const depthError = validateSlideDepth(marker, metadata);
		if (depthError)
			return fallback(depthError.reason, depthError.message, markdown);
		if (slideIds.has(metadata.id)) {
			return fallback(
				"invalid-slide-metadata",
				"Walkthrough slide metadata must use unique slide IDs.",
				markdown,
			);
		}
		slideIds.add(metadata.id);

		for (const evidenceId of metadata.evidenceIds) {
			evidenceIds.add(evidenceId);
		}

		const { markdown: slideMarkdown, notesMarkdown } = splitSlideContent(
			lines.slice(metadataResult.contentStartLine, slideEndLine),
		);
		const slide: WalkthroughSlide = {
			id: metadata.id,
			role: metadata.role,
			depth: metadata.depth,
			evidenceIds: metadata.evidenceIds,
			markdown: slideMarkdown,
			notesMarkdown,
		};

		if (marker.kind === "horizontal") {
			groups.push({ horizontal: slide, vertical: [] });
		} else {
			const lastGroup = groups[groups.length - 1];
			groups[groups.length - 1] = {
				horizontal: lastGroup.horizontal,
				vertical: [...lastGroup.vertical, slide],
			};
		}
	}

	return {
		kind: "deck",
		deck: {
			title: extractTitle(lines),
			reviewId: asString(frontmatterFields.rp1_review_id),
			slides: groups,
			evidenceIds: [...evidenceIds],
		},
		sourceMarkdown: markdown,
	};
}

function validateSlideDepth(
	marker: SlideMarker,
	metadata: ParsedSlideMetadata,
): { readonly reason: "invalid-slide-depth"; readonly message: string } | null {
	if (marker.kind === "horizontal" && metadata.depth !== 0) {
		return {
			reason: "invalid-slide-depth",
			message: "Horizontal walkthrough slides must use depth 0.",
		};
	}

	if (marker.kind === "vertical" && metadata.depth < 1) {
		return {
			reason: "invalid-slide-depth",
			message: "Vertical walkthrough slides must use depth 1 or greater.",
		};
	}

	return null;
}

function collectSlideMarkers(lines: readonly string[]):
	| { readonly kind: "markers"; readonly markers: readonly SlideMarker[] }
	| {
			readonly kind: "fallback";
			readonly reason: "invalid-slide-marker";
			readonly message: string;
	  } {
	const markers: SlideMarker[] = [];
	let fenceState: FenceState | null = null;

	for (const [lineIndex, line] of lines.entries()) {
		const trimmed = line.trim();
		fenceState = nextFenceState(trimmed, fenceState);
		if (fenceState) continue;

		if (trimmed === HORIZONTAL_SLIDE_MARKER) {
			markers.push({ kind: "horizontal", lineIndex });
			continue;
		}

		if (trimmed === VERTICAL_SLIDE_MARKER) {
			markers.push({ kind: "vertical", lineIndex });
			continue;
		}

		if (/^<!--\s*rp1-slide:/.test(trimmed)) {
			return {
				kind: "fallback",
				reason: "invalid-slide-marker",
				message:
					"Artifact contains a walkthrough slide marker with an unsupported direction.",
			};
		}
	}

	return { kind: "markers", markers };
}

function parseSlideMetadata(
	lines: readonly string[],
	marker: SlideMarker,
	slideEndLine: number,
):
	| {
			readonly kind: "metadata";
			readonly metadata: ParsedSlideMetadata;
			readonly contentStartLine: number;
	  }
	| {
			readonly kind: "fallback";
			readonly reason: "missing-slide-metadata" | "invalid-slide-metadata";
			readonly message: string;
	  } {
	const metaOpenLine = marker.lineIndex + 1;
	if (
		metaOpenLine >= slideEndLine ||
		lines[metaOpenLine]?.trim() !== SLIDE_META_OPEN
	) {
		return {
			kind: "fallback",
			reason: "missing-slide-metadata",
			message:
				"Each walkthrough slide marker must be followed by slide metadata.",
		};
	}

	let metaCloseLine = -1;
	for (
		let lineIndex = metaOpenLine + 1;
		lineIndex < slideEndLine;
		lineIndex += 1
	) {
		if (lines[lineIndex]?.trim() === SLIDE_META_CLOSE) {
			metaCloseLine = lineIndex;
			break;
		}
	}

	if (metaCloseLine === -1) {
		return {
			kind: "fallback",
			reason: "invalid-slide-metadata",
			message: "Walkthrough slide metadata is missing its closing marker.",
		};
	}

	const metadata = fieldsToSlideMetadata(
		parseFields(lines.slice(metaOpenLine + 1, metaCloseLine).join("\n")),
	);
	if (!metadata) {
		return {
			kind: "fallback",
			reason: "invalid-slide-metadata",
			message:
				"Walkthrough slide metadata must include id, depth, and evidence fields.",
		};
	}

	return {
		kind: "metadata",
		metadata,
		contentStartLine: metaCloseLine + 1,
	};
}

function fieldsToSlideMetadata(
	fields: ParsedFields,
): ParsedSlideMetadata | null {
	const id = asString(fields.id);
	const role = asString(fields.role);
	const depth = asNumber(fields.depth);
	const evidenceIds = asStringArray(fields.evidence);

	if (!id || depth === null || !Array.isArray(fields.evidence)) return null;
	if (!Number.isInteger(depth) || depth < 0) return null;

	return {
		id,
		role,
		depth,
		evidenceIds,
	};
}

function splitSlideContent(lines: readonly string[]): {
	readonly markdown: string;
	readonly notesMarkdown: string | null;
} {
	const notesIndex = findNotesMarkerIndex(lines);
	if (notesIndex === -1) {
		return {
			markdown: trimMarkdown(lines.join("\n")),
			notesMarkdown: null,
		};
	}

	const notesMarkdown = trimMarkdown(lines.slice(notesIndex + 1).join("\n"));
	return {
		markdown: trimMarkdown(lines.slice(0, notesIndex).join("\n")),
		notesMarkdown: notesMarkdown.length > 0 ? notesMarkdown : null,
	};
}

function findNotesMarkerIndex(lines: readonly string[]): number {
	let fenceState: FenceState | null = null;

	for (const [lineIndex, line] of lines.entries()) {
		const trimmed = line.trim();
		fenceState = nextFenceState(trimmed, fenceState);
		if (!fenceState && trimmed === NOTES_MARKER) return lineIndex;
	}

	return -1;
}

function extractTitle(lines: readonly string[]): string {
	let fenceState: FenceState | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		fenceState = nextFenceState(trimmed, fenceState);
		if (fenceState) continue;

		const match = line.match(/^#\s+(.+?)\s*$/);
		if (match?.[1]) return match[1].trim();
	}

	return DEFAULT_TITLE;
}

function trimMarkdown(markdown: string): string {
	return markdown.replace(/^\s*\n/, "").replace(/\s+$/, "");
}

function nextFenceState(
	trimmedLine: string,
	current: FenceState | null,
): FenceState | null {
	const boundary = parseFenceBoundary(trimmedLine);
	if (!boundary) return current;
	if (!current) return boundary;

	return boundary.marker === current.marker && boundary.length >= current.length
		? null
		: current;
}

function parseFenceBoundary(trimmedLine: string): FenceState | null {
	const match = trimmedLine.match(/^(`{3,}|~{3,})/);
	if (!match?.[1]) return null;

	const token = match[1];
	return {
		marker: token[0] as "`" | "~",
		length: token.length,
	};
}

function parseDelimitedFields(frontmatter: string): ParsedFields {
	const lines = frontmatter.split(/\r?\n/);
	const contentLines = lines.slice(1, lines[lines.length - 1] === "" ? -2 : -1);
	return parseFields(contentLines.join("\n"));
}

function parseFields(input: string): ParsedFields {
	const lines = input.split(/\r?\n/);
	const fields: Record<string, unknown> = {};

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex] ?? "";
		if (!line.trim() || /^\s/.test(line)) continue;

		const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
		if (!match?.[1]) continue;

		const key = match[1];
		const value = match[2] ?? "";
		if (value.length > 0) {
			fields[key] = parseScalar(value);
			continue;
		}

		const blockArray = readBlockArray(lines, lineIndex);
		if (blockArray) {
			fields[key] = blockArray.values;
			lineIndex = blockArray.endLineIndex;
		}
	}

	return fields;
}

function readBlockArray(
	lines: readonly string[],
	startLineIndex: number,
): {
	readonly values: readonly string[];
	readonly endLineIndex: number;
} | null {
	const values: string[] = [];
	let endLineIndex = startLineIndex;

	for (
		let lineIndex = startLineIndex + 1;
		lineIndex < lines.length;
		lineIndex += 1
	) {
		const line = lines[lineIndex] ?? "";
		if (!/^\s+/.test(line)) break;

		const item = line.trim().match(/^-\s+(.+)$/)?.[1];
		if (item) values.push(asString(parseScalar(item)) ?? item.trim());
		endLineIndex = lineIndex;
	}

	return values.length > 0 ? { values, endLineIndex } : null;
}

function parseScalar(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return "";

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		const inner = trimmed.slice(1, -1).trim();
		if (!inner) return [];
		return inner.split(",").map((item) => asString(parseScalar(item)) ?? "");
	}

	if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);

	const quoted = trimmed.match(/^(['"])([\s\S]*)\1$/);
	return quoted?.[2] ?? trimmed;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value
				.map((item) => asString(item))
				.filter((item): item is string => item !== null)
		: [];
}
