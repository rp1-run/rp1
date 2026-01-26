import { Check, X, Circle, Loader2 } from "lucide-react";
import type { Step, StepStatus } from "@/types/runs";
import { cn } from "@/lib/utils";

interface StepConfig {
  icon: React.ComponentType<{ className?: string }>;
  nodeClass: string;
  lineClass: string;
}

const stepConfigs: Record<StepStatus, StepConfig> = {
  completed: {
    icon: Check,
    nodeClass: "bg-status-completed text-background",
    lineClass: "bg-status-completed",
  },
  running: {
    icon: Loader2,
    nodeClass: "bg-status-running text-background",
    lineClass: "bg-status-running/50",
  },
  pending: {
    icon: Circle,
    nodeClass: "border-2 border-muted-foreground bg-background text-muted-foreground",
    lineClass: "bg-muted",
  },
  failed: {
    icon: X,
    nodeClass: "bg-status-failed text-background",
    lineClass: "bg-status-failed",
  },
  skipped: {
    icon: Circle,
    nodeClass: "border-2 border-muted bg-background text-muted",
    lineClass: "bg-muted",
  },
};

export interface StepTimelineProps {
  steps: readonly Step[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function StepTimeline({
  steps,
  orientation = "horizontal",
  className,
}: StepTimelineProps) {
  if (steps.length === 0) {
    return null;
  }

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={cn(
        "flex",
        isHorizontal ? "flex-row items-start gap-0" : "flex-col gap-0",
        className
      )}
      role="list"
      aria-label="Workflow steps"
    >
      {steps.map((step, index) => {
        const config = stepConfigs[step.status];
        const Icon = config.icon;
        const isLast = index === steps.length - 1;
        const isRunning = step.status === "running";

        return (
          <div
            key={step.id}
            className={cn(
              "flex",
              isHorizontal ? "flex-col items-center" : "flex-row items-start",
              !isLast && (isHorizontal ? "flex-1" : "")
            )}
            role="listitem"
            aria-current={isRunning ? "step" : undefined}
          >
            <div
              className={cn(
                "flex",
                isHorizontal ? "w-full items-center" : "flex-col items-center"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  config.nodeClass
                )}
                title={`${step.name}: ${step.status}`}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isRunning && "animate-spin"
                  )}
                  aria-hidden="true"
                />
              </div>

              {!isLast && (
                <div
                  className={cn(
                    config.lineClass,
                    isHorizontal
                      ? "h-0.5 flex-1 min-w-[32px]"
                      : "w-0.5 h-8 my-1"
                  )}
                  aria-hidden="true"
                />
              )}
            </div>

            <div
              className={cn(
                isHorizontal
                  ? "mt-2 text-center max-w-[100px]"
                  : "ml-3 flex-1 pb-4"
              )}
            >
              <p
                className={cn(
                  "text-sm font-medium truncate",
                  step.status === "pending" || step.status === "skipped"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {step.name}
              </p>
              {step.taskCount !== null && step.taskCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {step.completedTaskCount ?? 0}/{step.taskCount} tasks
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
