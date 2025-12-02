import { useState, useCallback, useEffect, useRef, KeyboardEvent } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileIcon, getFolderIcon } from "./icons";
import type { FileNode } from "../../server/routes/api";

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
    [handleClick, isDirectory, isExpanded, node.path, onToggleExpand]
  );

  const Icon = isDirectory
    ? getFolderIcon(isExpanded)
    : getFileIcon(node.name);

  return (
    <div role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined}>
      <div
        ref={nodeRef}
        className={cn(
          "flex items-center gap-1 py-1 px-2 cursor-pointer rounded-sm text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "transition-colors duration-100",
          isSelected && "bg-accent text-accent-foreground font-medium",
          isFocused && !isSelected && "ring-1 ring-ring"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={isFocused ? 0 : -1}
        role="button"
        aria-selected={isSelected}
      >
        {isDirectory && (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
        {!isDirectory && <span className="w-4" />}
        <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </div>

      {isDirectory && isExpanded && node.children && (
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
