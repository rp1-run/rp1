import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IconRail } from "@/components/v2/IconRail";
import { MobileTabBar } from "@/components/v2/MobileTabBar";
import { ShortcutHelpOverlay } from "@/components/v2/ShortcutHelpOverlay";
import { TerminalBreadcrumb } from "@/components/v2/TerminalBreadcrumb";
import { BreadcrumbProvider } from "@/hooks/useBreadcrumbContext";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
	pageTransition,
	pageTransitionReduced,
	pageVariants,
	pageVariantsReduced,
} from "@/lib/motion-config";
import { ShortcutRegistryProvider } from "@/providers/ShortcutRegistryProvider";

const FULL_HEIGHT_ROUTES = ["/runs/"];
function isFullHeightRoute(pathname: string): boolean {
	if (pathname === "/") return true;
	if (
		FULL_HEIGHT_ROUTES.some(
			(route) => pathname.startsWith(route) && pathname.includes("/artifacts/"),
		)
	)
		return true;
	if (/^\/runs\/[^/]+$/.test(pathname)) return true;
	if (/^\/projects\/[^/]+\/files/.test(pathname)) return true;
	return false;
}

export function AppLayout() {
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const shortcutHelpOpen = false;
	const location = useLocation();
	const navigate = useNavigate();
	const isFullHeight = isFullHeightRoute(location.pathname);

	const reducedMotion = usePrefersReducedMotion();
	const variants = reducedMotion ? pageVariantsReduced : pageVariants;
	const transition = reducedMotion ? pageTransitionReduced : pageTransition;
	const isOverlayOpen = commandPaletteOpen || shortcutHelpOpen;

	const handleOpenCommandPalette = useCallback(() => {
		setCommandPaletteOpen(true);
	}, []);

	const handleCloseCommandPalette = useCallback(() => {
		setCommandPaletteOpen(false);
	}, []);

	const handleToggleShortcutHelp = useCallback(() => {}, []);

	const handleFocusSearch = useCallback(() => {
		window.dispatchEvent(new CustomEvent("rp1:focus-search"));
	}, []);

	const handleToggleSidebar = useCallback(() => {}, []);

	useGlobalShortcuts({
		onOpenCommandPalette: handleOpenCommandPalette,
		onCloseCommandPalette: handleCloseCommandPalette,
		onToggleShortcutHelp: handleToggleShortcutHelp,
		onToggleSidebar: handleToggleSidebar,
		onFocusSearch: handleFocusSearch,
		isOverlayOpen,
		navigate,
	});

	return (
		<BreadcrumbProvider>
			<ShortcutRegistryProvider>
				<div className="flex h-screen bg-background">
					<IconRail className="hidden md:flex" />

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

					<MobileTabBar
						className="fixed inset-x-0 bottom-0 md:hidden"
						onOpenCommandPalette={handleOpenCommandPalette}
					/>

					<CommandPalette
						open={commandPaletteOpen}
						onOpenChange={setCommandPaletteOpen}
					/>
				</div>
				<ShortcutHelpOverlay />
			</ShortcutRegistryProvider>
		</BreadcrumbProvider>
	);
}

export { AppLayout as V2Layout };
