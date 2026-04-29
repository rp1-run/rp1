import { Check, FileText, List } from "lucide-react";
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
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
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
}: RunArtifactsPanelProps) {
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	const groups = artifactGroups.filter((group) => group.artifacts.length > 0);
	const artifacts = flattenArtifacts(groups);

	const renderLeadingControl = () =>
		leadingControl ? (
			<div className="flex shrink-0 items-center">{leadingControl}</div>
		) : null;

	const renderHeaderShell = (children: ReactNode) => (
		<div className="shrink-0 bg-surface-void/70 px-4 py-3 md:px-[40px]">
			<div className="flex min-w-0 items-center justify-between gap-md">
				{children}
			</div>
		</div>
	);

	if (artifacts.length === 0) {
		if (!leadingControl) {
			return <ArtifactEmptyState />;
		}

		return (
			<div className="flex h-full min-w-0 flex-col overflow-hidden">
				{renderHeaderShell(renderLeadingControl())}
				<ArtifactEmptyState className="min-h-0 flex-1" />
			</div>
		);
	}

	const effectiveSelectedArtifact = selectedArtifact ?? artifacts[0] ?? null;

	const handleCopyPath = (artifact: Artifact) => {
		const absPath = artifact.absolutePath ?? artifact.path;
		void navigator.clipboard.writeText(absPath).then(() => {
			setCopiedPath(artifact.path);
			setTimeout(() => setCopiedPath(null), 2000);
		});
	};

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
					const isCopied = copiedPath === artifact.path;
					const IconComponent = isCopied ? Check : FileText;
					const tooltipPath = artifact.absolutePath ?? artifact.path;

					return (
						<li key={artifact.docId} className="shrink-0">
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
									title={tooltipPath}
									aria-label={`Copy path for ${fileName}`}
									onClick={(e) => {
										e.stopPropagation();
										handleCopyPath(artifact);
									}}
									className="shrink-0 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
								>
									<IconComponent
										className="h-3 w-3 shrink-0"
										strokeWidth={1.5}
									/>
								</button>
								<button
									type="button"
									aria-current={isSelected ? "page" : undefined}
									title={tooltipPath}
									onClick={() => onArtifactSelect?.(artifact)}
									className="min-w-0 truncate transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
								>
									{fileName}
								</button>
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);

	const renderHeader = (controls: ArtifactContentSurfaceControls) =>
		renderHeaderShell(
			<>
				{renderLeadingControl()}
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
			</>,
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
