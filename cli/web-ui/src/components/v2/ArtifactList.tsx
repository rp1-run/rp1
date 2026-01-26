import {
  FileText,
  FileDiff,
  FileImage,
  FileCode,
  File,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import type { Artifact, ArtifactType } from "@/types/runs";
import { cn } from "@/lib/utils";

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

export interface ArtifactListProps {
  artifacts: readonly Artifact[];
  onArtifactClick?: (artifact: Artifact) => void;
  className?: string;
}

export function ArtifactList({
  artifacts,
  onArtifactClick,
  className,
}: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground p-4", className)}>
        No artifacts produced
      </div>
    );
  }

  const handleClick = (artifact: Artifact) => {
    if (onArtifactClick) {
      onArtifactClick(artifact);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    artifact: Artifact
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick(artifact);
    }
  };

  return (
    <ul
      className={cn("space-y-1", className)}
      role="list"
      aria-label="Artifacts"
    >
      {artifacts.map((artifact) => {
        const config = artifactConfigs[artifact.type];
        const Icon = config.icon;
        const fileName = getFileName(artifact.path);
        const directory = getDirectory(artifact.path);

        return (
          <li key={artifact.path}>
            <div
              role={onArtifactClick ? "button" : undefined}
              tabIndex={onArtifactClick ? 0 : undefined}
              onClick={() => handleClick(artifact)}
              onKeyDown={(e) => handleKeyDown(e, artifact)}
              className={cn(
                "group flex items-center gap-3 rounded-lg p-2 text-sm",
                onArtifactClick &&
                  "cursor-pointer hover:bg-muted/50 transition-colors"
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
                  <p className="truncate text-xs text-muted-foreground">
                    {directory}
                  </p>
                )}
              </div>

              {onArtifactClick && (
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden="true"
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
