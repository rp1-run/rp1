import { Link as LinkArtifactIcon, type LucideIcon } from "lucide-react";
import type { Artifact } from "@/types/runs";
import type { ArcadeHostMode } from "@/types/runtime";

export const NATIVE_OPEN_EXTERNAL_MESSAGE = "rp1:open-external-url";

export interface LinkArtifactConfig {
	readonly icon: LucideIcon;
	readonly label: string;
}

export interface ArtifactPartition {
	readonly fileArtifacts: readonly Artifact[];
	readonly linkArtifacts: readonly Artifact[];
}

interface NativeOpenExternalBridge {
	readonly postMessage: (message: string) => void;
}

export interface OpenExternalUrlOptions {
	readonly hostMode?: ArcadeHostMode;
	readonly nativeBridge?: NativeOpenExternalBridge | null;
	readonly openWindow?: Window["open"];
}

declare global {
	interface Window {
		readonly __electrobunBunBridge__?: NativeOpenExternalBridge;
		readonly __electrobunBunBridge?: NativeOpenExternalBridge;
	}
}

const RELATIONSHIP_LABELS: Readonly<Record<string, string>> = {
	reviewed_pr: "Reviewed PR",
	pull_request: "Pull request",
	pr: "PR",
	source: "Source",
	reference: "Reference",
	related: "Related link",
};

const OPAQUE_ID_PATTERN =
	/^(?:[0-9]+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

export const LINK_ARTIFACT_CONFIG: LinkArtifactConfig = {
	icon: LinkArtifactIcon,
	label: "Link",
};

export function isLinkArtifact(artifact: Artifact | null | undefined): boolean {
	return artifact?.locationKind === "url";
}

export function getLinkArtifactTarget(artifact: Artifact): string {
	return (artifact.url?.trim() || artifact.path.trim()) ?? artifact.path;
}

function titleCaseRelationship(value: string): string {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => (part.toLowerCase() === "pr" ? "PR" : titleCase(part)))
		.join(" ");
}

function titleCase(value: string): string {
	return value.length === 0
		? value
		: `${value[0]?.toUpperCase() ?? ""}${value.slice(1).toLowerCase()}`;
}

function relationshipLabel(
	relationship: string | null | undefined,
): string | null {
	const normalized = relationship?.trim();
	if (!normalized) return null;
	return RELATIONSHIP_LABELS[normalized] ?? titleCaseRelationship(normalized);
}

function parseUrl(target: string): URL | null {
	try {
		return new URL(target);
	} catch {
		return null;
	}
}

function githubLabel(parsed: URL): string | null {
	if (!/(^|\.)github\.com$/i.test(parsed.hostname)) {
		return null;
	}

	const parts = parsed.pathname.split("/").filter(Boolean);
	const pullIndex = parts.indexOf("pull");
	if (pullIndex >= 0) {
		const number = parts[pullIndex + 1];
		if (number && /^[0-9]+$/.test(number)) {
			return `GitHub PR #${number}`;
		}
	}

	const issueIndex = parts.indexOf("issues");
	if (issueIndex >= 0) {
		const number = parts[issueIndex + 1];
		if (number && /^[0-9]+$/.test(number)) {
			return `GitHub issue #${number}`;
		}
	}

	return null;
}

function pullRequestNumber(target: string): string | null {
	const parsed = parseUrl(target);
	if (!parsed) return null;
	const parts = parsed.pathname.split("/").filter(Boolean);
	const pullIndex = parts.indexOf("pull");
	if (pullIndex < 0) return null;
	const number = parts[pullIndex + 1];
	return number && /^[0-9]+$/.test(number) ? number : null;
}

function urlFallbackLabel(target: string): string {
	const parsed = parseUrl(target);
	if (!parsed) return "External link";

	const gitHubLabel = githubLabel(parsed);
	if (gitHubLabel) return gitHubLabel;

	const host = parsed.hostname.replace(/^www\./, "");
	const finalSegment = parsed.pathname
		.split("/")
		.filter(Boolean)
		.at(-1)
		?.trim();

	if (finalSegment && !OPAQUE_ID_PATTERN.test(finalSegment)) {
		return `${host}: ${decodeURIComponent(finalSegment).replace(/[-_]+/g, " ")}`;
	}

	return `${host} link`;
}

function isMeaningfulLabel(
	label: string | null | undefined,
	artifact: Artifact,
	target: string,
): label is string {
	const trimmed = label?.trim();
	if (!trimmed) return false;
	if (
		trimmed === target ||
		trimmed === artifact.path ||
		trimmed === artifact.url
	) {
		return false;
	}
	if (trimmed === artifact.docId || OPAQUE_ID_PATTERN.test(trimmed)) {
		return false;
	}
	return true;
}

export function getLinkArtifactLabel(artifact: Artifact): string {
	const target = getLinkArtifactTarget(artifact);
	if (isMeaningfulLabel(artifact.label, artifact, target)) {
		return artifact.label.trim();
	}

	const relatedLabel = relationshipLabel(artifact.relationship);
	if (relatedLabel) {
		const prNumber = pullRequestNumber(target);
		return prNumber && /\b(?:pr|pull request)\b/i.test(relatedLabel)
			? `${relatedLabel} #${prNumber}`
			: relatedLabel;
	}

	return urlFallbackLabel(target);
}

export function getLinkArtifactContext(artifact: Artifact): string {
	return getLinkArtifactTarget(artifact);
}

export function partitionArtifactsByLinkKind(
	artifacts: readonly Artifact[],
): ArtifactPartition {
	const fileArtifacts: Artifact[] = [];
	const linkArtifacts: Artifact[] = [];

	for (const artifact of artifacts) {
		if (isLinkArtifact(artifact)) {
			linkArtifacts.push(artifact);
		} else {
			fileArtifacts.push(artifact);
		}
	}

	return { fileArtifacts, linkArtifacts };
}

export function orderArtifactsWithLinksLast(
	artifacts: readonly Artifact[],
): readonly Artifact[] {
	const { fileArtifacts, linkArtifacts } =
		partitionArtifactsByLinkKind(artifacts);
	return [...fileArtifacts, ...linkArtifacts];
}

function readHostModeFromLocation(): ArcadeHostMode | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const hostMode = params.get("hostMode") ?? params.get("host-mode");
	if (hostMode === "native" || hostMode === "browser") return hostMode;
	return null;
}

function resolveNativeBridge(
	options: OpenExternalUrlOptions,
): NativeOpenExternalBridge | null {
	if (options.nativeBridge !== undefined) return options.nativeBridge;
	if (typeof window === "undefined") return null;
	return window.__electrobunBunBridge ?? window.__electrobunBunBridge__ ?? null;
}

export function openExternalUrl(
	url: string,
	options: OpenExternalUrlOptions = {},
): void {
	if (typeof window === "undefined") return;

	const hostMode = options.hostMode ?? readHostModeFromLocation();
	const bridge = resolveNativeBridge(options);
	if (bridge && (hostMode === "native" || hostMode === null)) {
		try {
			bridge.postMessage(
				JSON.stringify({
					type: "message",
					id: NATIVE_OPEN_EXTERNAL_MESSAGE,
					payload: { url },
				}),
			);
			return;
		} catch {}
	}

	const openWindow = options.openWindow ?? window.open.bind(window);
	openWindow(url, "_blank", "noopener,noreferrer");
}

export function openLinkArtifact(
	artifact: Artifact,
	options?: OpenExternalUrlOptions,
): void {
	openExternalUrl(getLinkArtifactTarget(artifact), options);
}
