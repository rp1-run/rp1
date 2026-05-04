import { Check, ExternalLink, FileText, List } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AnnotationToggleBtn } from "@/components/v2/AnnotationToggleBtn";
import {
	ArtifactContentSurface,
	type ArtifactContentSurfaceControls,
} from "@/components/v2/ArtifactContentSurface";
import { ArtifactEmptyState } from "@/components/v2/ArtifactEmptyState";
import { SaveStatusIndicator } from "@/components/v2/UnifiedContentRenderer";
import type { ArtifactGroup } from "@/lib/artifact-groups";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/runs";

export interface RunArtifactsPanelProps {
	readonly artifactGroups: readonly ArtifactGroup[];
	readonly selectedArtifact: Artifact | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly runId?: string;
	readonly subflowDiagram?: string | null;
	readonly showFrontmatter?: boolean;
	readonly leadingControl?: ReactNode;
	readonly headerLabel?: ReactNode;
	readonly headerActions?: ReactNode;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function isUrlArtifact(artifact: Artifact): boolean {
	return artifact.locationKind === "url";
}

function getArtifactName(artifact: Artifact): string {
	if (isUrlArtifact(artifact)) {
		return artifact.label || artifact.url || artifact.path;
	}

	return getFileName(artifact.path);
}

function getArtifactTarget(artifact: Artifact): string {
	if (isUrlArtifact(artifact)) {
		return artifact.url || artifact.path;
	}

	return artifact.absolutePath ?? artifact.path;
}

function flattenArtifacts(
	groups: readonly ArtifactGroup[],
): readonly Artifact[] {
	return groups.flatMap((group) => group.artifacts);
}

export function RunArtifactsPanel({
	artifactGroups,
	selectedArtifact,
	onArtifactSelect,
	runId,
	showFrontmatter = false,
	leadingControl,
	headerLabel,
	headerActions,
}: RunArtifactsPanelProps) {
	const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null);

	const groups = artifactGroups.filter((group) => group.artifacts.length > 0);
	const artifacts = flattenArtifacts(groups);
	const firstFileArtifact =
		artifacts.find((artifact) => !isUrlArtifact(artifact)) ?? null;

	const renderLeadingControl = () =>
		leadingControl ? (
			<div className="flex h-7 shrink-0 items-center">{leadingControl}</div>
		) : null;

	const renderHeaderLabel = () =>
		headerLabel ? (
			<span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap type-secondary font-medium text-fg">
				{headerLabel}
			</span>
		) : null;

	const renderHeaderShell = (
		main: ReactNode,
		actions?: ReactNode,
		leading?: ReactNode,
	) => (
		<div className="shrink-0 border-b border-border/60 bg-surface-void/70 px-4 py-2">
			<div className="flex min-w-0 items-start gap-3">
				{leading}
				<div className="min-w-0 flex-1">{main}</div>
				{actions}
			</div>
		</div>
	);

	if (artifacts.length === 0) {
		if (!leadingControl && !headerLabel && !headerActions) {
			return <ArtifactEmptyState />;
		}

		return (
			<div className="flex h-full min-w-0 flex-col overflow-hidden">
				{renderHeaderShell(
					<div className="flex min-w-0 items-start gap-2">
						{renderHeaderLabel()}
					</div>,
					headerActions ? (
						<div className="flex h-7 shrink-0 items-center gap-2">
							{headerActions}
						</div>
					) : null,
					renderLeadingControl(),
				)}
				<ArtifactEmptyState className="min-h-0 flex-1" />
			</div>
		);
	}

	const effectiveSelectedArtifact =
		selectedArtifact && !isUrlArtifact(selectedArtifact)
			? selectedArtifact
			: firstFileArtifact;

	const handleCopyArtifact = (artifact: Artifact) => {
		const target = getArtifactTarget(artifact);
		void navigator.clipboard.writeText(target).then(() => {
			setCopiedArtifactId(artifact.docId);
			setTimeout(() => setCopiedArtifactId(null), 2000);
		});
	};

	const renderArtifactList = () => (
		<ul
			aria-label="Artifacts"
			className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1"
		>
			{artifacts.map((artifact) => {
				const artifactName = getArtifactName(artifact);
				const isSelected = effectiveSelectedArtifact?.docId === artifact.docId;
				const isCopied = copiedArtifactId === artifact.docId;
				const IconComponent = isCopied
					? Check
					: isUrlArtifact(artifact)
						? ExternalLink
						: FileText;
				const artifactTarget = getArtifactTarget(artifact);
				const copyLabel = isUrlArtifact(artifact) ? "Copy URL" : "Copy path";

				return (
					<li key={artifact.docId} className="max-w-full shrink-0">
						<span
							className={cn(
								"inline-flex h-7 max-w-[14rem] items-center gap-1 rounded-sm px-2 type-secondary font-medium transition-colors duration-150",
								isSelected
									? "text-fg"
									: "text-fg-ghost hover:bg-surface-base/70 hover:text-fg",
							)}
						>
							<button
								type="button"
								title={artifactTarget}
								aria-label={`${copyLabel} for ${artifactName}`}
								onClick={(e) => {
									e.stopPropagation();
									handleCopyArtifact(artifact);
								}}
								className="shrink-0 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
							>
								<IconComponent className="h-3 w-3 shrink-0" strokeWidth={1.5} />
							</button>
							<button
								type="button"
								aria-current={isSelected ? "page" : undefined}
								title={artifactTarget}
								onClick={() => onArtifactSelect?.(artifact)}
								className="min-w-0 truncate transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
							>
								{artifactName}
							</button>
						</span>
					</li>
				);
			})}
		</ul>
	);

	const renderHeader = (controls: ArtifactContentSurfaceControls) =>
		renderHeaderShell(
			<div className="flex min-w-0 items-start gap-2">
				{renderHeaderLabel()}
				{renderArtifactList()}
			</div>,
			<div className="flex h-7 shrink-0 items-center gap-3">
				<SaveStatusIndicator status={controls.saveStatus} />
				{controls.showTableOfContentsToggle && (
					<button
						type="button"
						onClick={controls.toggleTableOfContents}
						className="text-fg-ghost transition-colors duration-150 hover:text-fg"
						aria-label="Open table of contents"
					>
						<List className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				)}
				{controls.showAnnotationToggle && controls.selectedArtifact && (
					<AnnotationToggleBtn
						artifactPath={controls.selectedArtifact.path}
						onClick={controls.toggleAnnotations}
						variant="inline"
					/>
				)}
				{headerActions}
			</div>,
			renderLeadingControl(),
		);

	return (
		<ArtifactContentSurface
			selectedArtifact={effectiveSelectedArtifact}
			runId={runId}
			showFrontmatter={showFrontmatter}
			emptyMessage="Select an artifact to view."
			renderHeader={renderHeader}
		/>
	);
}
