import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DiagramFullscreenProvider } from "@/providers/DiagramFullscreenProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
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
