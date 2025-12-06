import { useState, useCallback, useEffect, useRef, KeyboardEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTreeNode } from "./FileTreeNode";
import { Loader2, AlertCircle } from "lucide-react";
import type { FileNode } from "../../server/routes/api";

interface FileTreeProps {
  tree: FileNode[];
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const EXPANDED_PATHS_KEY = "rp1-ui-expanded-paths";

function loadExpandedPaths(): Set<string> {
  try {
    const stored = sessionStorage.getItem(EXPANDED_PATHS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // ignore
  }
  return new Set(["work", "context"]);
}

function saveExpandedPaths(paths: Set<string>): void {
  try {
    sessionStorage.setItem(EXPANDED_PATHS_KEY, JSON.stringify([...paths]));
  } catch {
    // ignore
  }
}

export function FileTree({
  tree,
  loading,
  error,
  selectedPath,
  onSelect,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    loadExpandedPaths
  );
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveExpandedPaths(expandedPaths);
  }, [expandedPaths]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const getAllPaths = useCallback((nodes: FileNode[]): string[] => {
    const paths: string[] = [];
    const traverse = (node: FileNode) => {
      paths.push(node.path);
      if (node.children && expandedPaths.has(node.path)) {
        node.children.forEach(traverse);
      }
    };
    nodes.forEach(traverse);
    return paths;
  }, [expandedPaths]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!focusedPath) return;

      const allPaths = getAllPaths(tree);
      const currentIndex = allPaths.indexOf(focusedPath);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < allPaths.length - 1) {
            setFocusedPath(allPaths[currentIndex + 1]);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setFocusedPath(allPaths[currentIndex - 1]);
          }
          break;
        case "Home":
          e.preventDefault();
          if (allPaths.length > 0) {
            setFocusedPath(allPaths[0]);
          }
          break;
        case "End":
          e.preventDefault();
          if (allPaths.length > 0) {
            setFocusedPath(allPaths[allPaths.length - 1]);
          }
          break;
      }
    },
    [focusedPath, tree, getAllPaths]
  );

  const handleFocus = useCallback(() => {
    if (!focusedPath && tree.length > 0) {
      setFocusedPath(tree[0].path);
    }
  }, [focusedPath, tree]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center p-4 text-destructive">
        <AlertCircle className="w-4 h-4 mr-2" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No files found
      </div>
    );
  }

  const workSection = tree.find((node) => node.name === "work");
  const contextSection = tree.find((node) => node.name === "context");

  return (
    <ScrollArea className="h-full">
      <div
        ref={containerRef}
        className="p-2"
        role="tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {contextSection && (
          <div className="mb-4">
            <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Context
            </h2>
            <FileTreeNode
              node={contextSection}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggleExpand={handleToggleExpand}
              focusedPath={focusedPath}
              onFocusChange={setFocusedPath}
            />
          </div>
        )}

        {workSection && (
          <div>
            <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Work
            </h2>
            <FileTreeNode
              node={workSection}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggleExpand={handleToggleExpand}
              focusedPath={focusedPath}
              onFocusChange={setFocusedPath}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
