import { Check, FileText, GitBranch, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MermaidDiagram } from "@/components/MarkdownViewer/MermaidDiagram";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnnotationToggleBtn } from "@/components/v2/AnnotationToggleBtn";
import {
	ArtifactContentSurface,
	type ArtifactContentSurfaceControls,
} from "@/components/v2/ArtifactContentSurface";
import { SaveStatusIndicator } from "@/components/v2/UnifiedContentRenderer";
import { cn } from "@/lib/utils";
import type { Artifact, Step } from "@/types/runs";

export interface ArtifactViewerPanelProps {
	readonly step: Step | null;
	readonly artifacts: readonly Artifact[];
	readonly selectedArtifact: Artifact | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly runId?: string;
	readonly subflowDiagram?: string | null;
	readonly showFrontmatter?: boolean;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function ArtifactViewerInner({
	step,
	artifacts,
	selectedArtifact,
	onArtifactSelect,
	runId,
	subflowDiagram,
	showFrontmatter = false,
}: ArtifactViewerPanelProps) {
	const [copiedPath, setCopiedPath] = useState<string | null>(null);
	const hasSubflow =
		typeof subflowDiagram === "string" && subflowDiagram.length > 0;
	const [showSubflow, setShowSubflow] = useState(false);
	const shouldShowSubflow = useMemo(
		() => hasSubflow && !selectedArtifact,
		[hasSubflow, selectedArtifact],
	);

	useEffect(() => {
		setShowSubflow(shouldShowSubflow);
	}, [shouldShowSubflow]);

	if (!step) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="type-secondary text-fg-ghost">Select a step.</span>
			</div>
		);
	}

	const stepArtifacts = artifacts.filter((a) => a.step === step.id);
	const emptyMessage = hasSubflow
		? "Select an artifact to view, or switch to Execution Flow."
		: stepArtifacts.length > 0
			? "Select an artifact to view."
			: "No artifacts for this step.";

	const renderHeader = (controls?: ArtifactContentSurfaceControls) => (
		<div className="shrink-0 px-4 md:px-[40px] pt-[24px] pb-[16px]">
			<div className="flex items-center justify-between">
				<h2 className="type-secondary text-fg-muted">{step.name}</h2>
				<div className="flex items-center gap-3">
					{controls && <SaveStatusIndicator status={controls.saveStatus} />}
					{controls?.showTableOfContentsToggle && (
						<button
							type="button"
							onClick={controls.toggleTableOfContents}
							className="text-fg-ghost transition-colors duration-150 hover:text-fg"
							aria-label="Open table of contents"
						>
							<List className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					)}
					{controls?.showAnnotationToggle && controls.selectedArtifact && (
						<AnnotationToggleBtn
							artifactPath={controls.selectedArtifact.path}
							onClick={controls.toggleAnnotations}
							variant="inline"
						/>
					)}
				</div>
			</div>

			{(hasSubflow || stepArtifacts.length > 0) && (
				<nav className="mt-[8px] flex flex-wrap gap-x-[16px] gap-y-[4px]">
					{hasSubflow && (
						<span
							className={cn(
								"type-secondary inline-flex items-center gap-1",
								showSubflow ? "text-fg font-medium" : "text-fg-ghost",
							)}
						>
							<GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.5} />
							<button
								type="button"
								onClick={() => setShowSubflow(true)}
								className="transition-colors duration-150 hover:opacity-80"
							>
								Execution Flow
							</button>
						</span>
					)}
					{stepArtifacts.map((artifact) => {
						const isSelected =
							!showSubflow && selectedArtifact?.path === artifact.path;
						const isCopied = copiedPath === artifact.path;
						const IconComponent = isCopied ? Check : FileText;
						return (
							<span
								key={artifact.path}
								className={cn(
									"type-secondary inline-flex items-center gap-1",
									isSelected ? "text-fg font-medium" : "text-fg-ghost",
								)}
							>
								<button
									type="button"
									title={artifact.absolutePath ?? artifact.path}
									onClick={(e) => {
										e.stopPropagation();
										const absPath = artifact.absolutePath ?? artifact.path;
										navigator.clipboard.writeText(absPath).then(() => {
											setCopiedPath(artifact.path);
											setTimeout(() => setCopiedPath(null), 2000);
										});
									}}
									className="shrink-0 transition-colors duration-150 hover:text-fg"
									aria-label={`Copy path for ${getFileName(artifact.path)}`}
								>
									<IconComponent className="h-3 w-3" strokeWidth={1.5} />
								</button>
								<button
									type="button"
									onClick={() => {
										setShowSubflow(false);
										onArtifactSelect?.(artifact);
									}}
									className="transition-colors duration-150 hover:opacity-80"
								>
									{getFileName(artifact.path)}
								</button>
							</span>
						);
					})}
				</nav>
			)}
		</div>
	);

	if (showSubflow && hasSubflow) {
		return (
			<div className="flex h-full flex-col overflow-hidden min-w-0">
				{renderHeader()}
				<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
					<ScrollArea className="flex-1 min-h-0 min-w-0">
						<div className="px-4 md:px-[40px] py-4">
							<MermaidDiagram
								code={subflowDiagram as string}
								title="Execution Flow"
							/>
						</div>
					</ScrollArea>
				</div>
			</div>
		);
	}

	return (
		<ArtifactContentSurface
			selectedArtifact={selectedArtifact}
			runId={runId}
			showFrontmatter={showFrontmatter}
			emptyMessage={emptyMessage}
			renderHeader={renderHeader}
		/>
	);
}

export function ArtifactViewerPanel(props: ArtifactViewerPanelProps) {
	return <ArtifactViewerInner {...props} />;
}
