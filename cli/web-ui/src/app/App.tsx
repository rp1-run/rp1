import { RouterProvider } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { DiagramFullscreenProvider } from "@/providers/DiagramFullscreenProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { router } from "./routes";

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WebSocketProvider>
          <DiagramFullscreenProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </DiagramFullscreenProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
