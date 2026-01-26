import {
	File,
	FileCode,
	FileDiff,
	FileImage,
	FileSpreadsheet,
	FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import type { Artifact, ArtifactType } from "@/types/runs";

interface ArtifactConfig {
	icon: React.ComponentType<{ className?: string }>;
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

export interface ArtifactSidebarProps {
	artifacts: readonly Artifact[];
	selectedPath: string;
	onSelect: (path: string) => void;
	className?: string;
}

export function ArtifactSidebar({
	artifacts,
	selectedPath,
	onSelect,
	className,
}: ArtifactSidebarProps) {
	const { getItemProps, containerProps, setSelectedIndex } = useKeyboardNav({
		items: artifacts,
		onSelect: (artifact) => {
			onSelect(artifact.path);
		},
		enabled: true,
		wrap: true,
	});

	// Sync selection from selectedPath prop to keyboard nav state
	const selectedIndex = artifacts.findIndex((a) => a.path === selectedPath);

	if (artifacts.length === 0) {
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
			<ul
				{...containerProps}
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
				{artifacts.map((artifact, index) => {
					const config = artifactConfigs[artifact.type];
					const Icon = config.icon;
					const fileName = getFileName(artifact.path);
					const directory = getDirectory(artifact.path);
					const isSelected = artifact.path === selectedPath;
					const itemProps = getItemProps(index);

					return (
						<li key={artifact.path} role="presentation">
							<div
								{...itemProps}
								id={`artifact-item-${index}`}
								role="option"
								aria-selected={isSelected}
								onClick={() => onSelect(artifact.path)}
								className={cn(
									"group flex items-center gap-3 rounded-lg p-2 text-sm cursor-pointer transition-colors outline-none",
									"hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
									isSelected && "bg-accent text-accent-foreground",
								)}
							>
								<Icon
									className={cn(
										"h-4 w-4 shrink-0",
										isSelected
											? "text-accent-foreground"
											: "text-muted-foreground",
									)}
									aria-hidden="true"
								/>

								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span
											className={cn(
												"truncate font-medium",
												isSelected
													? "text-accent-foreground"
													: "text-foreground",
											)}
										>
											{fileName}
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
									{directory && (
										<p
											className={cn(
												"truncate text-xs",
												isSelected
													? "text-accent-foreground/70"
													: "text-muted-foreground",
											)}
										>
											{directory}
										</p>
									)}
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
