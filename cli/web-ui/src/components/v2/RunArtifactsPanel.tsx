import { FileText, List } from "lucide-react";
import { AnnotationToggleBtn } from "@/components/v2/AnnotationToggleBtn";
import {
	ArtifactContentSurface,
	type ArtifactContentSurfaceControls,
} from "@/components/v2/ArtifactContentSurface";
import { ArtifactEmptyState } from "@/components/v2/ArtifactEmptyState";
import { SaveStatusIndicator } from "@/components/v2/UnifiedContentRenderer";
import type { ArtifactGroup } from "@/lib/artifact-groups";
import { cn } from "@/lib/utils";
import type { Artifact, Step } from "@/types/runs";

export interface RunArtifactsPanelProps {
	readonly artifactGroups: readonly ArtifactGroup[];
	readonly selectedArtifact: Artifact | null;
	readonly selectedStep: Step | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly runId?: string;
	readonly subflowDiagram?: string | null;
	readonly showFrontmatter?: boolean;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function flattenArtifacts(
	groups: readonly ArtifactGroup[],
): readonly Artifact[] {
	return groups.flatMap((group) => group.artifacts);
}

function orderGroupsByActiveContext(
	groups: readonly ArtifactGroup[],
	artifact: Artifact | null,
	step: Step | null,
): readonly ArtifactGroup[] {
	const activeIndex = artifact
		? groups.findIndex((group) =>
				group.artifacts.some((candidate) => candidate.docId === artifact.docId),
			)
		: step
			? groups.findIndex((group) => group.stepId === step.id)
			: -1;

	if (activeIndex <= 0) {
		return groups;
	}

	return [
		groups[activeIndex],
		...groups.slice(0, activeIndex),
		...groups.slice(activeIndex + 1),
	];
}

export function RunArtifactsPanel({
	artifactGroups,
	selectedArtifact,
	selectedStep,
	onArtifactSelect,
	runId,
	showFrontmatter = false,
}: RunArtifactsPanelProps) {
	const groups = artifactGroups.filter((group) => group.artifacts.length > 0);
	const orderedGroups = orderGroupsByActiveContext(
		groups,
		selectedArtifact,
		selectedStep,
	);
	const artifacts = flattenArtifacts(orderedGroups);

	if (artifacts.length === 0) {
		return <ArtifactEmptyState />;
	}

	const effectiveSelectedArtifact = selectedArtifact ?? artifacts[0] ?? null;

	const renderArtifactList = () => (
		<div className="min-w-0 flex-1 overflow-x-auto">
			<ul
				aria-label="Artifacts"
				className="flex min-w-0 items-center gap-1 whitespace-nowrap"
			>
				{artifacts.map((artifact) => {
					const fileName = getFileName(artifact.path);
					const isSelected =
						effectiveSelectedArtifact?.docId === artifact.docId;

					return (
						<li key={artifact.docId} className="shrink-0">
							<button
								type="button"
								aria-current={isSelected ? "page" : undefined}
								title={artifact.absolutePath ?? artifact.path}
								onClick={() => onArtifactSelect?.(artifact)}
								className={cn(
									"inline-flex h-7 max-w-[14rem] items-center gap-1 rounded-sm px-2 type-secondary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
									isSelected
										? "text-fg font-medium"
										: "text-fg-ghost hover:bg-surface-base/70 hover:text-fg",
								)}
							>
								<FileText className="h-3 w-3 shrink-0" strokeWidth={1.5} />
								<span className="min-w-0 truncate">{fileName}</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);

	const renderHeader = (controls: ArtifactContentSurfaceControls) => (
		<div className="shrink-0 bg-surface-void/70 px-4 py-3 md:px-[40px]">
			<div className="flex min-w-0 items-center justify-between gap-md">
				{renderArtifactList()}
				<div className="flex shrink-0 items-center gap-3">
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
				</div>
			</div>
		</div>
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
