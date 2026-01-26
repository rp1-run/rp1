import { useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Run } from "@/types/runs";
import { cn } from "@/lib/utils";
import { RunCard } from "./RunCard";

type AccentColor = "peach" | "mauve" | "red" | "blue";

const accentColors: Record<AccentColor, string> = {
  peach: "text-status-waiting",
  mauve: "text-status-needs-review",
  red: "text-status-failed",
  blue: "text-status-running",
};

const accentBgColors: Record<AccentColor, string> = {
  peach: "bg-status-waiting/10",
  mauve: "bg-status-needs-review/10",
  red: "bg-status-failed/10",
  blue: "bg-status-running/10",
};

export interface AttentionSectionProps {
  title: string;
  icon: LucideIcon;
  runs: readonly Run[];
  defaultExpanded?: boolean;
  maxVisible?: number;
  emptyMessage?: string;
  accentColor: AccentColor;
  className?: string;
}

export function AttentionSection({
  title,
  icon: Icon,
  runs,
  defaultExpanded = true,
  maxVisible = 5,
  emptyMessage = "No items",
  accentColor,
  className,
}: AttentionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();

  const hasItems = runs.length > 0;
  const visibleRuns = showAll ? runs : runs.slice(0, maxVisible);
  const hiddenCount = runs.length - maxVisible;
  const hasMore = runs.length > maxVisible;

  const handleRunClick = (runId: string) => {
    navigate(`/v2/runs/${runId}`);
  };

  const handleToggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  const handleShowMore = () => {
    setShowAll(true);
  };

  const handleShowLess = () => {
    setShowAll(false);
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-border overflow-hidden transition-all duration-200",
        accentBgColors[accentColor],
        className
      )}
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        )}
        aria-expanded={isExpanded}
        aria-controls={`section-content-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className={cn("transition-transform", isExpanded && "rotate-0")}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </span>

        <Icon className={cn("h-5 w-5", accentColors[accentColor])} aria-hidden="true" />

        <h2
          id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
          className="flex-1 font-medium text-foreground"
        >
          {title}
        </h2>

        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-sm font-medium",
            hasItems ? accentColors[accentColor] : "text-muted-foreground",
            hasItems ? accentBgColors[accentColor] : "bg-muted/50"
          )}
        >
          {runs.length}
        </span>
      </button>

      <div
        id={`section-content-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="space-y-2 p-4 pt-0">
          {hasItems ? (
            <>
              <ul className="space-y-2" role="list">
                {visibleRuns.map((run) => (
                  <li
                    key={run.id}
                    className="animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    <RunCard
                      run={run}
                      onClick={() => handleRunClick(run.id)}
                    />
                  </li>
                ))}
              </ul>

              {hasMore && (
                <div className="pt-2">
                  {!showAll ? (
                    <button
                      type="button"
                      onClick={handleShowMore}
                      className={cn(
                        "w-full rounded-md py-2 text-sm font-medium transition-colors",
                        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        accentColors[accentColor]
                      )}
                    >
                      Show more ({hiddenCount} hidden)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleShowLess}
                      className={cn(
                        "w-full rounded-md py-2 text-sm font-medium transition-colors",
                        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "text-muted-foreground"
                      )}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
