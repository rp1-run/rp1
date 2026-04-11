import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IconRail } from "@/components/v2/IconRail";
import { MobileTabBar } from "@/components/v2/MobileTabBar";
import { NotificationsSidebar } from "@/components/v2/NotificationsSidebar";
import { NotificationContainer } from "@/components/v2/NotificationToast";
import { NotificationTrigger } from "@/components/v2/NotificationTrigger";
import { ShortcutHelpOverlay } from "@/components/v2/ShortcutHelpOverlay";
import { TerminalBreadcrumb } from "@/components/v2/TerminalBreadcrumb";
import { BreadcrumbProvider } from "@/hooks/useBreadcrumbContext";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useNotifications } from "@/hooks/useNotifications";
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
	if (/^\/runs\/[^/]+/.test(pathname)) return true;
	if (/^\/projects\/[^/]+\/files/.test(pathname)) return true;
	return false;
}

type ActiveOverlay = "none" | "command-palette" | "notifications";

export function AppLayout() {
	const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>("none");
	const shortcutHelpOpen = false;
	const location = useLocation();
	const navigate = useNavigate();
	const isFullHeight = isFullHeightRoute(location.pathname);
	const { notifications, summary, isLoading, error, dismissNotification } =
		useNotifications();

	const animationKey =
		location.pathname.match(/^\/runs\/[^/]+/)?.[0] ??
		location.pathname.match(/^\/projects\/[^/]+\/files/)?.[0] ??
		location.pathname;

	const reducedMotion = usePrefersReducedMotion();
	const variants = reducedMotion ? pageVariantsReduced : pageVariants;
	const transition = reducedMotion ? pageTransitionReduced : pageTransition;
	const isOverlayOpen = activeOverlay !== "none" || shortcutHelpOpen;

	const handleOpenCommandPalette = useCallback(() => {
		setActiveOverlay("command-palette");
	}, []);

	const handleCloseActiveOverlay = useCallback(() => {
		setActiveOverlay("none");
	}, []);

	const handleToggleShortcutHelp = useCallback(() => {}, []);

	const handleFocusSearch = useCallback(() => {
		window.dispatchEvent(new CustomEvent("rp1:focus-search"));
	}, []);

	const handleToggleNotifications = useCallback(() => {
		setActiveOverlay((current) =>
			current === "notifications" ? "none" : "notifications",
		);
	}, []);

	useGlobalShortcuts({
		activeOverlay,
		onOpenCommandPalette: handleOpenCommandPalette,
		onCloseOverlay: handleCloseActiveOverlay,
		onToggleShortcutHelp: handleToggleShortcutHelp,
		onToggleSidebar: handleToggleNotifications,
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
						<TerminalBreadcrumb
							action={
								<NotificationTrigger
									summary={summary}
									open={activeOverlay === "notifications"}
									onClick={handleToggleNotifications}
								/>
							}
						/>
						{isFullHeight ? (
							<main className="flex-1 overflow-hidden">
								<AnimatePresence mode="wait">
									<motion.div
										key={animationKey}
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
											key={animationKey}
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
						notificationAction={
							<NotificationTrigger
								summary={summary}
								open={activeOverlay === "notifications"}
								onClick={handleToggleNotifications}
								className="h-11 w-11"
							/>
						}
					/>

					<CommandPalette
						open={activeOverlay === "command-palette"}
						onOpenChange={(open) => {
							setActiveOverlay((current) => {
								if (open) {
									return "command-palette";
								}

								return current === "command-palette" ? "none" : current;
							});
						}}
					/>
					<NotificationsSidebar
						open={activeOverlay === "notifications"}
						onClose={handleCloseActiveOverlay}
						notifications={notifications}
						isLoading={isLoading}
						error={error}
						onDismissNotification={dismissNotification}
					/>
				</div>
				<ShortcutHelpOverlay />
				<NotificationContainer />
			</ShortcutRegistryProvider>
		</BreadcrumbProvider>
	);
}

export { AppLayout as V2Layout };
