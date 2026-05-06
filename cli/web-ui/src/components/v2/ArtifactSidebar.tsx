import {
	File,
	FileCode,
	FileDiff,
	FileImage,
	FileSpreadsheet,
	FileText,
	type LucideIcon,
} from "lucide-react";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import {
	getLinkArtifactContext,
	getLinkArtifactLabel,
	isLinkArtifact,
	LINK_ARTIFACT_CONFIG,
	orderArtifactsWithLinksLast,
} from "@/lib/link-artifacts";
import { cn } from "@/lib/utils";
import type { Artifact, ArtifactType } from "@/types/runs";

interface ArtifactConfig {
	icon: LucideIcon;
	label: string;
}

const artifactConfigs: Record<ArtifactType, ArtifactConfig> = {
	markdown: {
		icon: FileText,
		label: "Markdown",
	},
	diff: {
		icon: FileDiff,
		label: "Diff",
	},
	diagram: {
		icon: FileImage,
		label: "Diagram",
	},
	report: {
		icon: FileSpreadsheet,
		label: "Report",
	},
	code: {
		icon: FileCode,
		label: "Code",
	},
	other: {
		icon: File,
		label: "File",
	},
};

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function getDirectory(path: string): string {
	const parts = path.split("/");
	if (parts.length <= 1) return "";
	parts.pop();
	return parts.join("/");
}

function getArtifactName(artifact: Artifact): string {
	if (isLinkArtifact(artifact)) {
		return getLinkArtifactLabel(artifact);
	}

	return getFileName(artifact.path);
}

function getArtifactContext(artifact: Artifact): string {
	if (isLinkArtifact(artifact)) {
		return getLinkArtifactContext(artifact);
	}

	return getDirectory(artifact.path);
}

function getArtifactConfig(artifact: Artifact): ArtifactConfig {
	if (isLinkArtifact(artifact)) {
		return LINK_ARTIFACT_CONFIG;
	}

	return artifactConfigs[artifact.type] ?? artifactConfigs.other;
}

export interface ArtifactSidebarProps {
	artifacts: readonly Artifact[];
	selectedPath: string;
	onSelect: (artifact: Artifact) => void;
	className?: string;
}

export function ArtifactSidebar({
	artifacts,
	selectedPath,
	onSelect,
	className,
}: ArtifactSidebarProps) {
	const orderedArtifacts = orderArtifactsWithLinksLast(artifacts);
	const { getItemProps, containerProps, setSelectedIndex } = useKeyboardNav({
		items: orderedArtifacts,
		onSelect: (artifact) => {
			onSelect(artifact);
		},
		enabled: true,
		wrap: true,
	});

	// Sync selection from selectedPath prop to keyboard nav state
	const selectedIndex = orderedArtifacts.findIndex(
		(a) => a.path === selectedPath,
	);

	if (orderedArtifacts.length === 0) {
		return (
			<div className={cn("text-sm text-muted-foreground p-4", className)}>
				No artifacts produced
			</div>
		);
	}

	return (
		<nav
			className={cn("flex flex-col", className)}
			aria-label="Artifact navigation"
		>
			<div
				{...containerProps}
				role="listbox"
				tabIndex={0}
				className="space-y-1 p-2"
				aria-label="Artifacts"
				aria-activedescendant={
					selectedIndex >= 0 ? `artifact-item-${selectedIndex}` : undefined
				}
				onFocus={() => {
					// If no item selected via keyboard, start at the currently selected artifact
					if (selectedIndex >= 0) {
						setSelectedIndex(selectedIndex);
					}
				}}
			>
				{orderedArtifacts.map((artifact, index) => {
					const config = getArtifactConfig(artifact);
					const Icon = config.icon;
					const artifactName = getArtifactName(artifact);
					const artifactContext = getArtifactContext(artifact);
					const isSelected = artifact.path === selectedPath;
					const itemProps = getItemProps(index);

					return (
						<div
							key={artifact.docId || artifact.path}
							{...itemProps}
							id={`artifact-item-${index}`}
							role="option"
							tabIndex={-1}
							aria-selected={isSelected}
							onClick={() => onSelect(artifact)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelect(artifact);
								}
							}}
							className={cn(
								"group flex items-center gap-3 rounded-lg p-2 text-sm cursor-pointer transition-colors outline-none",
								"hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								isSelected && "bg-muted ring-1 ring-ring",
							)}
						>
							<Icon
								className={cn(
									"h-4 w-4 shrink-0",
									isSelected ? "text-foreground" : "text-muted-foreground",
								)}
								aria-hidden="true"
							/>

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate font-medium text-foreground">
										{artifactName}
									</span>
									{artifact.isNew && (
										<span className="shrink-0 rounded bg-status-completed/20 px-1.5 py-0.5 text-xs font-medium text-status-completed">
											new
										</span>
									)}
									{artifact.updatedDuringRun && !artifact.isNew && (
										<span className="shrink-0 rounded bg-status-running/20 px-1.5 py-0.5 text-xs font-medium text-status-running">
											updated
										</span>
									)}
								</div>
								{artifactContext && (
									<p className="truncate text-xs text-muted-foreground">
										{artifactContext}
									</p>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</nav>
	);
}
