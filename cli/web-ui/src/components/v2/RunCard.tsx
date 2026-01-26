import type { Run } from "@/types/runs";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString();
}

export interface RunCardProps {
  run: Run;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function RunCard({ run, onClick, selected, className }: RunCardProps) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      className={cn(
        "group flex items-center gap-4 rounded-md px-3 py-2 transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50",
        selected && "bg-muted/50",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {run.projectName}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-muted-foreground">
            {run.featureName}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {run.command}
          </code>
          {run.currentStep && (
            <>
              <span aria-hidden="true">-</span>
              <span className="truncate">{run.currentStep}</span>
            </>
          )}
        </div>

        {run.status === "failed" && run.error && (
          <p className="mt-1 truncate text-xs text-status-failed">
            {run.error}
          </p>
        )}
      </div>

      <time
        dateTime={run.startedAt}
        className="shrink-0 text-sm text-muted-foreground"
      >
        {formatRelativeTime(run.startedAt)}
      </time>
    </div>
  );
}
