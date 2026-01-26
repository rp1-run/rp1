import { useState } from "react";
import {
  Play,
  Check,
  AlertTriangle,
  XCircle,
  FilePlus,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { RunEvent, EventType } from "@/types/runs";
import { cn } from "@/lib/utils";

interface EventConfig {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

const eventConfigs: Record<EventType, EventConfig> = {
  "step-start": {
    icon: Play,
    colorClass: "text-status-running",
  },
  "step-complete": {
    icon: Check,
    colorClass: "text-status-completed",
  },
  warning: {
    icon: AlertTriangle,
    colorClass: "text-status-waiting",
  },
  error: {
    icon: XCircle,
    colorClass: "text-status-failed",
  },
  "artifact-updated": {
    icon: FilePlus,
    colorClass: "text-muted-foreground",
  },
  "task-batch": {
    icon: Layers,
    colorClass: "text-muted-foreground",
  },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return date.toLocaleTimeString();
}

function getTaskBatchSummary(event: RunEvent): string {
  if (event.type !== "task-batch" || !event.metadata) {
    return event.message;
  }
  const count = event.metadata.taskCount as number | undefined;
  const stepName = event.metadata.stepName as string | undefined;
  if (count !== undefined && stepName) {
    return `${count} tasks completed in ${stepName}`;
  }
  return event.message;
}

export interface EventStreamProps {
  events: readonly RunEvent[];
  defaultExpanded?: boolean;
  className?: string;
}

export function EventStream({
  events,
  defaultExpanded = false,
  className,
}: EventStreamProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const errorCount = events.filter((e) => e.type === "error").length;
  const warningCount = events.filter((e) => e.type === "warning").length;

  return (
    <div className={cn("border border-border rounded-lg", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="event-stream-content"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-foreground">Event Stream</span>
          <span className="text-sm text-muted-foreground">
            ({events.length} events)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-status-failed">
              <XCircle className="h-3 w-3" />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-status-waiting">
              <AlertTriangle className="h-3 w-3" />
              {warningCount}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div
          id="event-stream-content"
          className="border-t border-border max-h-[400px] overflow-y-auto"
        >
          {sortedEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No events yet</p>
          ) : (
            <ul role="list" className="divide-y divide-border">
              {sortedEvents.map((event) => {
                const config = eventConfigs[event.type];
                const Icon = config.icon;
                const displayMessage =
                  event.type === "task-batch"
                    ? getTaskBatchSummary(event)
                    : event.message;

                return (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 p-3 text-sm"
                  >
                    <Icon
                      className={cn("h-4 w-4 mt-0.5 shrink-0", config.colorClass)}
                      aria-hidden="true"
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-foreground",
                          event.type === "error" && "text-status-failed",
                          event.type === "warning" && "text-status-waiting"
                        )}
                      >
                        {displayMessage}
                      </p>
                      {event.stepId && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Step: {event.stepId}
                        </p>
                      )}
                    </div>

                    <time
                      dateTime={event.timestamp}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatRelativeTime(event.timestamp)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
