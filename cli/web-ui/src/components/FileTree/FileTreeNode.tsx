import { ChevronDown, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { FileNode } from "../../server/routes/content-utils";
import { getFileIcon, getFolderIcon } from "./icons";

interface FileTreeNodeProps {
	node: FileNode;
	depth: number;
	selectedPath: string | null;
	onSelect: (path: string) => void;
	expandedPaths: Set<string>;
	onToggleExpand: (path: string) => void;
	focusedPath: string | null;
	onFocusChange: (path: string) => void;
}

export function FileTreeNode({
	node,
	depth,
	selectedPath,
	onSelect,
	expandedPaths,
	onToggleExpand,
	focusedPath,
	onFocusChange,
}: FileTreeNodeProps) {
	const isDirectory = node.type === "directory";
	const isExpanded = expandedPaths.has(node.path);
	const isSelected = selectedPath === node.path;
	const isFocused = focusedPath === node.path;
	const nodeRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isFocused && nodeRef.current) {
			nodeRef.current.focus();
		}
	}, [isFocused]);

	const handleClick = useCallback(() => {
		onFocusChange(node.path);
		if (isDirectory) {
			onToggleExpand(node.path);
		} else {
			onSelect(node.path);
		}
	}, [node.path, isDirectory, onToggleExpand, onSelect, onFocusChange]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			switch (e.key) {
				case "Enter":
				case " ":
					e.preventDefault();
					handleClick();
					break;
				case "ArrowRight":
					e.preventDefault();
					if (isDirectory && !isExpanded) {
						onToggleExpand(node.path);
					}
					break;
				case "ArrowLeft":
					e.preventDefault();
					if (isDirectory && isExpanded) {
						onToggleExpand(node.path);
					}
					break;
			}
		},
		[handleClick, isDirectory, isExpanded, node.path, onToggleExpand],
	);

	const Icon = isDirectory ? getFolderIcon(isExpanded) : getFileIcon(node.name);

	return (
		// biome-ignore lint/a11y/useFocusableInteractive: focus managed by inner div with tabIndex
		<div role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined}>
			{/* biome-ignore lint/a11y/useSemanticElements: div used for custom tree styling */}
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-selected for tree selection state */}
			<div
				ref={nodeRef}
				className={cn(
					"flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded type-body",
					"hover:bg-accent-ghost",
					"focus:outline-none focus:ring-1 focus:ring-accent-amber",
					"transition-colors duration-150",
					isSelected && "bg-accent-ghost text-fg",
					isFocused && !isSelected && "ring-1 ring-accent-amber",
				)}
				style={{ paddingLeft: `${depth * 20 + 8}px` }}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				tabIndex={isFocused ? 0 : -1}
				role="button"
				aria-selected={isSelected}
			>
				{isDirectory && (
					<span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
						{isExpanded ? (
							<ChevronDown className="w-3 h-3" strokeWidth={1.5} />
						) : (
							<ChevronRight className="w-3 h-3" strokeWidth={1.5} />
						)}
					</span>
				)}
				{!isDirectory && <span className="w-3.5" />}
				<Icon className="w-3.5 h-3.5 flex-shrink-0 text-fg-muted" />
				<span className="truncate">{node.name}</span>
			</div>

			{isDirectory && isExpanded && node.children && (
				// biome-ignore lint/a11y/useSemanticElements: role="group" for tree structure
				<div role="group">
					{node.children.map((child) => (
						<FileTreeNode
							key={child.path}
							node={child}
							depth={depth + 1}
							selectedPath={selectedPath}
							onSelect={onSelect}
							expandedPaths={expandedPaths}
							onToggleExpand={onToggleExpand}
							focusedPath={focusedPath}
							onFocusChange={onFocusChange}
						/>
					))}
				</div>
			)}
		</div>
	);
}
