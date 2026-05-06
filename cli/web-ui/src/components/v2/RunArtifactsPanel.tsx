import { Check, FileText, List, Presentation } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { AnnotationToggleBtn } from "@/components/v2/AnnotationToggleBtn";
import {
	ArtifactContentSurface,
	type ArtifactContentSurfaceControls,
} from "@/components/v2/ArtifactContentSurface";
import { ArtifactEmptyState } from "@/components/v2/ArtifactEmptyState";
import { LinkSidebar } from "@/components/v2/LinkSidebar";
import { SaveStatusIndicator } from "@/components/v2/UnifiedContentRenderer";
import { useIsMobile } from "@/hooks/useMediaQuery";
import type { ArtifactGroup } from "@/lib/artifact-groups";
import {
	getLinkArtifactLabel,
	getLinkArtifactTarget,
	isLinkArtifact,
	LINK_ARTIFACT_CONFIG,
	openLinkArtifact,
	partitionArtifactsByLinkKind,
} from "@/lib/link-artifacts";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/runs";
import { PanelHeaderIconButton } from "./PanelHeader";

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

function getArtifactName(artifact: Artifact): string {
	if (isLinkArtifact(artifact)) {
		return getLinkArtifactLabel(artifact);
	}

	return getFileName(artifact.path);
}

function getArtifactTarget(artifact: Artifact): string {
	if (isLinkArtifact(artifact)) {
		return getLinkArtifactTarget(artifact);
	}

	return artifact.absolutePath ?? artifact.path;
}

function flattenArtifacts(
	groups: readonly ArtifactGroup[],
): readonly Artifact[] {
	return groups.flatMap((group) => group.artifacts);
}

function ArtifactContentModeControl({
	controls,
}: {
	readonly controls: ArtifactContentSurfaceControls;
}) {
	if (
		!controls.slideModeAvailable ||
		!controls.contentMode ||
		!controls.setContentMode
	) {
		return null;
	}

	const modes = [
		{ value: "slides", label: "Slides", icon: Presentation },
		{ value: "markdown", label: "Markdown", icon: FileText },
	] as const;

	return (
		<fieldset className="inline-flex h-7 shrink-0 items-center rounded border border-border bg-background p-0.5">
			<legend className="sr-only">Artifact viewing mode</legend>
			{modes.map(({ value, label, icon: Icon }) => {
				const selected = controls.contentMode === value;
				return (
					<button
						key={value}
						type="button"
						aria-pressed={selected}
						onClick={() => controls.setContentMode?.(value)}
						className={cn(
							"inline-flex h-6 items-center gap-1 rounded-sm px-2 type-secondary transition-colors duration-150",
							selected
								? "bg-surface-base text-fg"
								: "text-fg-ghost hover:text-fg",
						)}
					>
						<Icon className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
						<span>{label}</span>
					</button>
				);
			})}
		</fieldset>
	);
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
	const [linksPanelOpen, setLinksPanelOpen] = useState(false);
	const isMobile = useIsMobile();

	const groups = artifactGroups.filter((group) => group.artifacts.length > 0);
	const artifacts = flattenArtifacts(groups);
	const { fileArtifacts, linkArtifacts } =
		partitionArtifactsByLinkKind(artifacts);
	const firstFileArtifact =
		fileArtifacts.find((artifact) => artifact.docId) ?? null;

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
		selectedArtifact && !isLinkArtifact(selectedArtifact)
			? selectedArtifact
			: firstFileArtifact;

	const handleCopyArtifact = (artifact: Artifact) => {
		const target = getArtifactTarget(artifact);
		void navigator.clipboard.writeText(target).then(() => {
			setCopiedArtifactId(artifact.docId);
			setTimeout(() => setCopiedArtifactId(null), 2000);
		});
	};

	const handleOpenLinkArtifact = (artifact: Artifact) => {
		if (onArtifactSelect) {
			onArtifactSelect(artifact);
		} else {
			openLinkArtifact(artifact);
		}
		if (isMobile) {
			setLinksPanelOpen(false);
		}
	};

	const renderArtifactList = () =>
		fileArtifacts.length > 0 ? (
			<ul
				aria-label="Artifacts"
				className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1"
			>
				{fileArtifacts.map((artifact) => {
					const artifactName = getArtifactName(artifact);
					const isSelected =
						effectiveSelectedArtifact?.docId === artifact.docId;
					const isCopied = copiedArtifactId === artifact.docId;
					const IconComponent = isCopied ? Check : FileText;
					const artifactTarget = getArtifactTarget(artifact);

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
									aria-label={`Copy path for ${artifactName}`}
									onClick={(e) => {
										e.stopPropagation();
										handleCopyArtifact(artifact);
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
		) : null;

	const renderHeader = (controls: ArtifactContentSurfaceControls) =>
		renderHeaderShell(
			<div className="flex min-w-0 items-start gap-2">
				{renderHeaderLabel()}
				{renderArtifactList()}
			</div>,
			<div className="flex h-7 shrink-0 items-center gap-3">
				<ArtifactContentModeControl controls={controls} />
				<SaveStatusIndicator status={controls.saveStatus} />
				{linkArtifacts.length > 0 && (
					<PanelHeaderIconButton
						icon={LINK_ARTIFACT_CONFIG.icon}
						ariaLabel={
							linksPanelOpen ? "Close links panel" : "Open links panel"
						}
						ariaExpanded={linksPanelOpen}
						ariaPressed={linksPanelOpen}
						onClick={() => {
							setLinksPanelOpen((prev) => {
								const next = !prev;
								if (next) {
									controls.closeSecondaryPanels();
								}
								return next;
							});
						}}
						className={cn(linksPanelOpen && "text-fg")}
					/>
				)}
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

	const linksSidebar =
		linksPanelOpen && linkArtifacts.length > 0 ? (
			<LinkSidebar
				artifacts={linkArtifacts}
				onOpenLink={handleOpenLinkArtifact}
				onClose={() => setLinksPanelOpen(false)}
				className="h-full"
			/>
		) : null;

	return (
		<>
			<ArtifactContentSurface
				selectedArtifact={effectiveSelectedArtifact}
				runId={runId}
				showFrontmatter={showFrontmatter}
				emptyMessage={
					fileArtifacts.length > 0
						? "Select an artifact to view."
						: "No file artifacts to preview."
				}
				renderHeader={renderHeader}
				sidePanel={
					!isMobile && linksSidebar ? (
						<div className="w-[280px] shrink-0 border-l border-border overflow-y-auto">
							{linksSidebar}
						</div>
					) : null
				}
				onSecondaryPanelOpen={() => setLinksPanelOpen(false)}
			/>
			{isMobile && (
				<Drawer
					open={linksPanelOpen}
					onClose={() => setLinksPanelOpen(false)}
					side="right"
					title="Links"
				>
					{linksSidebar}
				</Drawer>
			)}
		</>
	);
}
