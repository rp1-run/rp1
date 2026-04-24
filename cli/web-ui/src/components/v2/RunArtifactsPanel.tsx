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

function countArtifacts(groups: readonly ArtifactGroup[]): number {
	return groups.reduce((total, group) => total + group.artifacts.length, 0);
}

function findGroupForArtifact(
	groups: readonly ArtifactGroup[],
	artifact: Artifact | null,
): ArtifactGroup | null {
	if (!artifact) return null;
	return (
		groups.find((group) =>
			group.artifacts.some((candidate) => candidate.docId === artifact.docId),
		) ?? null
	);
}

function findGroupForStep(
	groups: readonly ArtifactGroup[],
	step: Step | null,
): ArtifactGroup | null {
	if (!step) return null;
	return groups.find((group) => group.stepId === step.id) ?? null;
}

function groupCountLabel(group: ArtifactGroup): string {
	return `${group.artifacts.length}`;
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
	const artifactCount = countArtifacts(groups);

	if (artifactCount === 0) {
		return <ArtifactEmptyState />;
	}

	const selectedArtifactGroup = findGroupForArtifact(groups, selectedArtifact);
	const selectedStepGroup = findGroupForStep(groups, selectedStep);
	const activeGroup = selectedArtifactGroup ?? selectedStepGroup ?? groups[0];
	const singleArtifact =
		artifactCount === 1 ? (groups[0]?.artifacts[0] ?? null) : null;
	const effectiveSelectedArtifact = selectedArtifact ?? singleArtifact;
	const activeArtifacts = activeGroup?.artifacts ?? [];
	const showGroupSelector = groups.length > 1;
	const showArtifactTabs = artifactCount > 1 && activeArtifacts.length > 0;
	const panelTitle =
		artifactCount === 1 && singleArtifact
			? getFileName(singleArtifact.path)
			: "Artifacts";

	const renderGroupSelector = () => {
		if (!showGroupSelector) return null;

		return (
			<div
				role="tablist"
				aria-label="Artifact groups"
				className="mt-[10px] flex min-w-0 gap-xs overflow-x-auto whitespace-nowrap"
			>
				{groups.map((group) => {
					const isActive = activeGroup?.id === group.id;
					const firstArtifact = group.artifacts[0];
					return (
						<button
							key={group.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							onClick={() => {
								if (firstArtifact) onArtifactSelect?.(firstArtifact);
							}}
							className={cn(
								"inline-flex h-7 shrink-0 items-center gap-1 rounded-sm border px-2 type-secondary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
								isActive
									? "border-border bg-surface text-fg"
									: "border-transparent text-fg-ghost hover:bg-surface-base hover:text-fg",
							)}
						>
							<span className="max-w-[10rem] truncate">{group.label}</span>
							<span className="tabular-nums text-fg-ghost">
								{groupCountLabel(group)}
							</span>
						</button>
					);
				})}
			</div>
		);
	};

	const renderArtifactTabs = () => {
		if (!showArtifactTabs) return null;

		return (
			<div
				role="tablist"
				aria-label={`Artifacts in ${activeGroup.label}`}
				className="mt-[10px] flex min-w-0 gap-[2px] overflow-x-auto whitespace-nowrap border-b border-border"
			>
				{activeArtifacts.map((artifact) => {
					const fileName = getFileName(artifact.path);
					const isSelected =
						effectiveSelectedArtifact?.docId === artifact.docId;

					return (
						<button
							key={artifact.docId}
							type="button"
							role="tab"
							aria-selected={isSelected}
							title={artifact.absolutePath ?? artifact.path}
							onClick={() => onArtifactSelect?.(artifact)}
							className={cn(
								"relative -mb-px inline-flex h-8 max-w-[14rem] shrink-0 items-center gap-1 rounded-t-sm border px-2.5 type-secondary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
								isSelected
									? "border-border border-b-surface bg-surface text-fg font-medium"
									: "border-transparent text-fg-ghost hover:bg-surface-base hover:text-fg",
							)}
						>
							<FileText className="h-3 w-3 shrink-0" strokeWidth={1.5} />
							<span className="min-w-0 truncate">{fileName}</span>
						</button>
					);
				})}
			</div>
		);
	};

	const renderHeader = (controls: ArtifactContentSurfaceControls) => (
		<div className="shrink-0 border-b border-border bg-surface-void/70 px-4 pt-[20px] pb-[14px] md:px-[40px]">
			<div className="flex min-w-0 items-center justify-between gap-md">
				<h2 className="type-secondary min-w-0 truncate text-fg-muted">
					{panelTitle}
				</h2>
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

			{renderGroupSelector()}
			{renderArtifactTabs()}
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
