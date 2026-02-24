import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { V2Header } from "@/components/v2/V2Header";
import { V2Sidebar } from "@/components/v2/V2Sidebar";
import { useWebSocket } from "@/providers/WebSocketProvider";

const FULL_HEIGHT_ROUTES = ["/runs/"];
function isFullHeightRoute(pathname: string): boolean {
	if (
		FULL_HEIGHT_ROUTES.some(
			(route) => pathname.startsWith(route) && pathname.includes("/artifacts/"),
		)
	)
		return true;
	if (/^\/projects\/[^/]+\/files/.test(pathname)) return true;
	return false;
}

const V2_SIDEBAR_COLLAPSED_KEY = "rp1-v2-sidebar-collapsed";

function loadSidebarCollapsed(): boolean {
	try {
		return localStorage.getItem(V2_SIDEBAR_COLLAPSED_KEY) === "true";
	} catch {
		return false;
	}
}

function saveSidebarCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(V2_SIDEBAR_COLLAPSED_KEY, String(collapsed));
	} catch {
		// Storage unavailable (private browsing, quota exceeded)
	}
}

export function V2Layout() {
	const [sidebarCollapsed, setSidebarCollapsed] =
		useState(loadSidebarCollapsed);
	const { status: wsStatus } = useWebSocket();
	const location = useLocation();
	const isFullHeight = isFullHeightRoute(location.pathname);

	const toggleSidebar = useCallback(() => {
		setSidebarCollapsed((prev) => {
			const newValue = !prev;
			saveSidebarCollapsed(newValue);
			return newValue;
		});
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				e.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	return (
		<div className="flex h-screen flex-col bg-background">
			<V2Header wsStatus={wsStatus} />
			<div className="flex flex-1 overflow-hidden">
				<V2Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
				{isFullHeight ? (
					<main className="flex-1 overflow-hidden">
						<Outlet />
					</main>
				) : (
					<main className="flex-1 overflow-hidden">
						<ScrollArea className="h-full">
							<div className="p-6">
								<Outlet />
							</div>
						</ScrollArea>
					</main>
				)}
			</div>
		</div>
	);
}
