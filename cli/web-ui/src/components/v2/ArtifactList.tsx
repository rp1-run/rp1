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

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function getDirectory(path: string): string {
	const parts = path.split("/");
	if (parts.length <= 1) return "";
	parts.pop();
	return parts.join("/");
}

const ARTIFACT_ITEM_HEIGHT = 56;
const VIRTUALIZATION_THRESHOLD = 15;

export interface ArtifactListProps {
	artifacts: readonly Artifact[];
	onArtifactClick?: (artifact: Artifact) => void;
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
	const config = artifactConfigs[artifact.type];
	const Icon = config.icon;
	const fileName = getFileName(artifact.path);
	const directory = getDirectory(artifact.path);

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
		<div
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			onClick={handleClick}
			onKeyDown={onClick ? handleKeyDown : undefined}
			className={cn(
				"group flex items-center gap-3 rounded-lg p-2 text-sm",
				onClick && "cursor-pointer hover:bg-muted/50 transition-colors",
				isSelected && "bg-muted/50 ring-1 ring-ring",
			)}
		>
			<Icon
				className="h-4 w-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-foreground">
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
					<p className="truncate text-xs text-muted-foreground">{directory}</p>
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

	const { selectedIndex, containerProps } = useKeyboardNav({
		items: artifacts,
		onSelect: handleSelect,
		onDrillIn: handleSelect,
		enabled: artifacts.length > 0 && !!onArtifactClick,
		listRef: virtualizedListRef as React.RefObject<KeyboardNavListRef | null>,
	});

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

	const getArtifactKey = useCallback((artifact: Artifact) => artifact.path, []);

	if (artifacts.length === 0) {
		return (
			<div className={cn("text-sm text-muted-foreground p-4", className)}>
				No artifacts produced
			</div>
		);
	}

	if (useVirtualization) {
		return (
			<div {...containerProps} className={cn("focus:outline-none", className)}>
				<VirtualizedList
					ref={virtualizedListRef}
					items={artifacts}
					estimateSize={ARTIFACT_ITEM_HEIGHT}
					overscan={3}
					renderItem={renderArtifactItem}
					getItemKey={getArtifactKey}
					onSelect={handleSelect}
					selectedIndex={selectedIndex}
					className="h-[300px]"
					aria-label="Artifacts"
				/>
			</div>
		);
	}

	return (
		<ul
			{...containerProps}
			className={cn("space-y-1 focus:outline-none", className)}
			aria-label="Artifacts"
		>
			{artifacts.map((artifact, index) => (
				<li key={artifact.path}>
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
