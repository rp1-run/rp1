import {
	ExternalLink,
	File,
	FileCode,
	FileDiff,
	FileImage,
	FileSpreadsheet,
	FileText,
} from "lucide-react";
import { useCallback, useRef } from "react";
import {
	type VirtualizedListRef as KeyboardNavListRef,
	useKeyboardNav,
} from "@/hooks/useKeyboardNav";
import { cn } from "@/lib/utils";
import type { Artifact, ArtifactType } from "@/types/runs";
import { VirtualizedList, type VirtualizedListRef } from "./VirtualizedList";

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

const urlArtifactConfig: ArtifactConfig = {
	icon: ExternalLink,
	label: "Link",
};

function isUrlArtifact(artifact: Artifact): boolean {
	return artifact.locationKind === "url";
}

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
	if (isUrlArtifact(artifact)) {
		return artifact.label || artifact.url || artifact.path;
	}

	return getFileName(artifact.path);
}

function getArtifactContext(artifact: Artifact): string {
	if (isUrlArtifact(artifact)) {
		return artifact.url || artifact.path;
	}

	return getDirectory(artifact.path);
}

function getArtifactConfig(artifact: Artifact): ArtifactConfig {
	if (isUrlArtifact(artifact)) {
		return urlArtifactConfig;
	}

	return artifactConfigs[artifact.type] ?? artifactConfigs.other;
}

const ARTIFACT_ITEM_HEIGHT = 56;
const VIRTUALIZATION_THRESHOLD = 15;

export interface ArtifactListProps {
	artifacts: readonly Artifact[];
	onArtifactClick?: (artifact: Artifact) => void;
	selectedIndex?: number | null;
	className?: string;
}

function ArtifactItem({
	artifact,
	onClick,
	isSelected,
}: {
	artifact: Artifact;
	onClick?: (artifact: Artifact) => void;
	isSelected?: boolean;
}) {
	const config = getArtifactConfig(artifact);
	const Icon = config.icon;
	const artifactName = getArtifactName(artifact);
	const artifactContext = getArtifactContext(artifact);

	const handleClick = () => {
		onClick?.(artifact);
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleClick();
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: conditionally interactive - role is set to "button" when onClick is provided
		<div
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			onClick={handleClick}
			onKeyDown={onClick ? handleKeyDown : undefined}
			className={cn(
				"group flex items-center gap-3 rounded-lg p-2 text-sm border border-transparent",
				onClick && "cursor-pointer hover:bg-muted/50 transition-colors",
				isSelected && "border-l-2 border-l-primary bg-muted/30",
			)}
		>
			<Icon
				className="h-4 w-4 shrink-0 text-muted-foreground"
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

			{onClick && (
				<ExternalLink
					className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
					aria-hidden="true"
				/>
			)}
		</div>
	);
}

export function ArtifactList({
	artifacts,
	onArtifactClick,
	selectedIndex: externalSelectedIndex,
	className,
}: ArtifactListProps) {
	const virtualizedListRef = useRef<VirtualizedListRef>(null);
	const useVirtualization = artifacts.length > VIRTUALIZATION_THRESHOLD;

	const handleSelect = useCallback(
		(artifact: Artifact) => {
			onArtifactClick?.(artifact);
		},
		[onArtifactClick],
	);

	// Use external selectedIndex if provided, otherwise use internal keyboard nav
	const { selectedIndex: internalSelectedIndex } = useKeyboardNav({
		items: artifacts,
		onSelect: handleSelect,
		onDrillIn: handleSelect,
		enabled:
			artifacts.length > 0 &&
			!!onArtifactClick &&
			externalSelectedIndex === undefined,
		listRef: virtualizedListRef as React.RefObject<KeyboardNavListRef | null>,
	});

	const selectedIndex = externalSelectedIndex ?? internalSelectedIndex;

	const renderArtifactItem = useCallback(
		(artifact: Artifact, _index: number, isSelected: boolean) => (
			<ArtifactItem
				artifact={artifact}
				onClick={onArtifactClick}
				isSelected={isSelected}
			/>
		),
		[onArtifactClick],
	);

	const getArtifactKey = useCallback(
		(artifact: Artifact) => artifact.docId || artifact.path,
		[],
	);

	if (artifacts.length === 0) {
		return (
			<div className={cn("text-sm text-muted-foreground p-4", className)}>
				No artifacts produced
			</div>
		);
	}

	if (useVirtualization) {
		return (
			<VirtualizedList
				ref={virtualizedListRef}
				items={artifacts}
				estimateSize={ARTIFACT_ITEM_HEIGHT}
				overscan={3}
				renderItem={renderArtifactItem}
				getItemKey={getArtifactKey}
				onSelect={handleSelect}
				selectedIndex={selectedIndex}
				className={cn("h-[300px]", className)}
				aria-label="Artifacts"
			/>
		);
	}

	return (
		<ul className={cn("space-y-1", className)} aria-label="Artifacts">
			{artifacts.map((artifact, index) => (
				<li key={artifact.docId || artifact.path}>
					<ArtifactItem
						artifact={artifact}
						onClick={onArtifactClick}
						isSelected={selectedIndex === index}
					/>
				</li>
			))}
		</ul>
	);
}
