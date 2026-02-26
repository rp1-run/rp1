import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { ShortcutHelpOverlay } from "@/components/v2/ShortcutHelpOverlay";
import { TerminalBreadcrumb } from "@/components/v2/TerminalBreadcrumb";
import { V2Header } from "@/components/v2/V2Header";
import { V2Sidebar } from "@/components/v2/V2Sidebar";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
	pageTransition,
	pageTransitionReduced,
	pageVariants,
	pageVariantsReduced,
} from "@/lib/motion-config";
import { ShortcutRegistryProvider } from "@/providers/ShortcutRegistryProvider";
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
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
	const { status: wsStatus } = useWebSocket();
	const location = useLocation();
	const navigate = useNavigate();
	const isFullHeight = isFullHeightRoute(location.pathname);

	const reducedMotion = usePrefersReducedMotion();
	const variants = reducedMotion ? pageVariantsReduced : pageVariants;
	const transition = reducedMotion ? pageTransitionReduced : pageTransition;
	const isOverlayOpen = commandPaletteOpen || shortcutHelpOpen;

	const toggleSidebar = useCallback(() => {
		setSidebarCollapsed((prev) => {
			const newValue = !prev;
			saveSidebarCollapsed(newValue);
			return newValue;
		});
	}, []);

	const handleOpenCommandPalette = useCallback(() => {
		setCommandPaletteOpen(true);
	}, []);

	const handleCloseCommandPalette = useCallback(() => {
		setCommandPaletteOpen(false);
		setShortcutHelpOpen(false);
	}, []);

	const handleToggleShortcutHelp = useCallback(() => {
		setShortcutHelpOpen((prev) => !prev);
	}, []);

	const handleFocusSearch = useCallback(() => {
		window.dispatchEvent(new CustomEvent("rp1:focus-search"));
	}, []);

	useGlobalShortcuts({
		onOpenCommandPalette: handleOpenCommandPalette,
		onCloseCommandPalette: handleCloseCommandPalette,
		onToggleShortcutHelp: handleToggleShortcutHelp,
		onToggleSidebar: toggleSidebar,
		onFocusSearch: handleFocusSearch,
		isOverlayOpen,
		navigate,
	});

	return (
		<ShortcutRegistryProvider>
			<div className="flex h-screen flex-col bg-background">
				<V2Header wsStatus={wsStatus} />
				<div className="flex flex-1 overflow-hidden">
					<V2Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
					<div className="flex flex-1 flex-col overflow-hidden">
						<TerminalBreadcrumb />
						{isFullHeight ? (
							<main className="flex-1 overflow-hidden">
								<AnimatePresence mode="wait">
									<motion.div
										key={location.pathname}
										variants={variants}
										initial="initial"
										animate="animate"
										exit="exit"
										transition={transition}
										className="h-full"
									>
										<Outlet />
									</motion.div>
								</AnimatePresence>
							</main>
						) : (
							<main className="flex-1 overflow-hidden">
								<ScrollArea className="h-full">
									<AnimatePresence mode="wait">
										<motion.div
											key={location.pathname}
											variants={variants}
											initial="initial"
											animate="animate"
											exit="exit"
											transition={transition}
											className="p-6"
										>
											<Outlet />
										</motion.div>
									</AnimatePresence>
								</ScrollArea>
							</main>
						)}
					</div>
				</div>
				<CommandPalette
					open={commandPaletteOpen}
					onOpenChange={setCommandPaletteOpen}
				/>
				<ShortcutHelpOverlay
					open={shortcutHelpOpen}
					onOpenChange={setShortcutHelpOpen}
				/>
			</div>
			<ShortcutHelpOverlay />
		</ShortcutRegistryProvider>
	);
}
