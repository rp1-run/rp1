import { HelpCircle } from "lucide-react";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface V2HeaderProps {
  wsStatus: ConnectionStatus;
}

export function V2Header({ wsStatus }: V2HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <Logo wsStatus={wsStatus} />
        <span className="text-muted-foreground">/</span>
        <ProjectSwitcher />
      </div>
      <div className="flex items-center gap-2">
        <WebSocketIndicator status={wsStatus} />
        <ThemeToggle />
        <HelpButton />
      </div>
    </header>
  );
}

interface LogoProps {
  wsStatus: ConnectionStatus;
}

function Logo({ wsStatus }: LogoProps) {
  return (
    <span
      title={wsStatus === "connected" ? "Live updates active" : "Reconnecting..."}
      aria-label={`rp1 - Connection status: ${wsStatus}`}
    >
      <span className="text-terminal-mauve">[=] </span>
      <span className="text-lg font-medium">rp1</span>
      <span
        className={cn(
          "animate-blink",
          wsStatus === "connected" ? "text-terminal-green" : "text-terminal-red"
        )}
      >
        _
      </span>
    </span>
  );
}

interface WebSocketIndicatorProps {
  status: ConnectionStatus;
}

function WebSocketIndicator({ status }: WebSocketIndicatorProps) {
  const statusConfig = {
    connected: {
      label: "Connected",
      color: "bg-status-completed",
      description: "Live updates active",
    },
    connecting: {
      label: "Connecting",
      color: "bg-status-waiting",
      description: "Connecting to server...",
    },
    disconnected: {
      label: "Disconnected",
      color: "bg-status-failed",
      description: "Connection lost, reconnecting...",
    },
  };

  const config = statusConfig[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground"
            role="status"
            aria-label={`WebSocket ${config.label}`}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                config.color,
                status === "connecting" && "animate-pulse"
              )}
              aria-hidden="true"
            />
            <span className="sr-only">{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{config.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HelpButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Help"
            onClick={() => {
              window.open("https://rp1.run/docs", "_blank");
            }}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Documentation</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
