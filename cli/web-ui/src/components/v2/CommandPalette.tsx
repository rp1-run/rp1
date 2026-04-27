import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
	FileText,
	Home,
	Info,
	List,
	Moon,
	NotebookTabs,
	RefreshCw,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
	type Command as CommandType,
	commands,
	isActionCommand,
	isNavigationCommand,
} from "@/lib/commands";
import {
	overlayBackdropTransition,
	overlayBackdropVariants,
	overlayPanelTransition,
	overlayPanelVariants,
	staggerItem,
	staggerItemReduced,
} from "@/lib/motion-config";
import { useShortcutRegistry } from "@/providers/ShortcutRegistryProvider";
import { useTheme } from "@/providers/ThemeProvider";

declare const __RP1_WEB_UI_BUILD_TIME__: string | undefined;
declare const __RP1_WEB_UI_GIT_COMMIT__: string | undefined;
declare const __RP1_WEB_UI_VERSION__: string | undefined;

export interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type PaletteView = "commands" | "about";

interface ClientBuildMetadata {
	readonly buildTime: string;
	readonly devBuild: boolean | undefined;
	readonly gitCommit: string;
	readonly mode: string;
	readonly version: string;
}

interface HealthMetadata {
	readonly status: "ok";
	readonly uptime: number;
	readonly port: number;
	readonly projectCount: number;
	readonly isDev?: boolean;
	readonly version?: string;
}

interface MetadataRow {
	readonly label: string;
	readonly value: string;
}

const navigationIcons: Record<string, React.ReactNode> = {
	"nav-home": (
		<Home className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"nav-runs": (
		<FileText className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"nav-projects": (
		<NotebookTabs
			className="mr-2 h-4 w-4"
			strokeWidth={1.5}
			aria-hidden="true"
		/>
	),
};

const actionIcons: Record<string, React.ReactNode> = {
	"act-theme": (
		<Moon className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"act-refresh": (
		<RefreshCw className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"act-about": (
		<Info className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
};

const navigationCommands = commands.filter(isNavigationCommand);
const actionCommands = commands.filter(isActionCommand);

const CMDK_STYLES =
	"[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-10 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4";

const commandStaggerContainer = {
	animate: {
		transition: {
			delayChildren: 0.15,
			staggerChildren: 0.04,
		},
	},
};

const commandStaggerContainerReduced = {
	animate: {
		transition: {
			delayChildren: 0,
			staggerChildren: 0,
		},
	},
};

function AnimatedCommandDialog({
	open,
	onOpenChange,
	children,
	reducedMotion,
	title = "Command Palette",
	wrapCommand = true,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
	reducedMotion: boolean;
	title?: string;
	wrapCommand?: boolean;
}) {
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<DialogPrimitive.Portal forceMount>
						<DialogPrimitive.Overlay asChild forceMount>
							<motion.div
								className="fixed inset-0 z-50 bg-black/80"
								initial={
									reducedMotion
										? { opacity: 1 }
										: overlayBackdropVariants.initial
								}
								animate={
									reducedMotion
										? { opacity: 1 }
										: overlayBackdropVariants.animate
								}
								exit={
									reducedMotion ? { opacity: 0 } : overlayBackdropVariants.exit
								}
								transition={
									reducedMotion ? { duration: 0 } : overlayBackdropTransition
								}
							/>
						</DialogPrimitive.Overlay>
						<div className="fixed inset-0 z-50 flex items-center justify-center">
							<DialogPrimitive.Content
								asChild
								forceMount
								aria-describedby={undefined}
							>
								<motion.div
									className="w-full max-w-lg overflow-hidden rounded border border-border bg-surface"
									initial={
										reducedMotion
											? { opacity: 1, scale: 1 }
											: overlayPanelVariants.initial
									}
									animate={
										reducedMotion
											? { opacity: 1, scale: 1 }
											: overlayPanelVariants.animate
									}
									exit={
										reducedMotion
											? { opacity: 0, scale: 1 }
											: overlayPanelVariants.exit
									}
									transition={
										reducedMotion ? { duration: 0 } : overlayPanelTransition
									}
								>
									<DialogPrimitive.Title className="sr-only">
										{title}
									</DialogPrimitive.Title>
									{wrapCommand ? (
										<Command className={CMDK_STYLES}>{children}</Command>
									) : (
										children
									)}
								</motion.div>
							</DialogPrimitive.Content>
						</div>
					</DialogPrimitive.Portal>
				)}
			</AnimatePresence>
		</DialogPrimitive.Root>
	);
}

function getClientBuildMetadata(): ClientBuildMetadata {
	const viteEnv = (
		import.meta as ImportMeta & {
			readonly env?: {
				readonly DEV?: boolean;
				readonly MODE?: string;
			};
		}
	).env;

	return {
		buildTime:
			typeof __RP1_WEB_UI_BUILD_TIME__ === "string"
				? __RP1_WEB_UI_BUILD_TIME__
				: "Unknown",
		devBuild: typeof viteEnv?.DEV === "boolean" ? viteEnv.DEV : undefined,
		gitCommit:
			typeof __RP1_WEB_UI_GIT_COMMIT__ === "string"
				? __RP1_WEB_UI_GIT_COMMIT__
				: "Unknown",
		mode: typeof viteEnv?.MODE === "string" ? viteEnv.MODE : "Unknown",
		version:
			typeof __RP1_WEB_UI_VERSION__ === "string"
				? __RP1_WEB_UI_VERSION__
				: "Unknown",
	};
}

function formatBuildVersion(
	version: string,
	devBuild: boolean | undefined,
	gitCommit: string,
): string {
	if (
		!devBuild ||
		version === "Unknown" ||
		!gitCommit ||
		gitCommit === "Unknown"
	) {
		return version;
	}

	const separator = version.includes("+") ? "." : "+";
	return `${version}${separator}${gitCommit}`;
}

function formatBoolean(value: boolean | undefined): string {
	if (value === undefined) return "Unknown";
	return value ? "Yes" : "No";
}

function formatUptime(seconds: number | undefined): string {
	if (seconds === undefined) return "Unknown";
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function getDaemonDevBuild(health: HealthMetadata | null): boolean | undefined {
	if (!health) return undefined;
	if (health.version?.includes("-dev")) return true;
	return typeof health.isDev === "boolean" ? health.isDev : undefined;
}

function getRp1DevBuild(
	clientBuild: ClientBuildMetadata,
	health: HealthMetadata | null,
): boolean | undefined {
	return getDaemonDevBuild(health) ?? clientBuild.devBuild;
}

function AboutMetadataRow({ label, value }: MetadataRow) {
	return (
		<div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t border-border/60 py-2 first:border-t-0">
			<dt className="type-caption uppercase tracking-[0.08em] text-fg-ghost">
				{label}
			</dt>
			<dd
				className="min-w-0 truncate text-right font-mono text-[12px] text-fg"
				title={value}
			>
				{value}
			</dd>
		</div>
	);
}

function AboutPanel({ onClose }: { onClose: () => void }) {
	const clientBuild = useMemo(getClientBuildMetadata, []);
	const [health, setHealth] = useState<HealthMetadata | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const rp1DevBuild = getRp1DevBuild(clientBuild, health);

	useEffect(() => {
		const controller = new AbortController();

		setLoading(true);
		setError(null);

		fetch("/api/v2/health", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Health check failed (${response.status})`);
				}
				setHealth((await response.json()) as HealthMetadata);
			})
			.catch((fetchError: unknown) => {
				if (controller.signal.aborted) return;
				setError(fetchError instanceof Error ? fetchError.message : "Unknown");
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			});

		return () => controller.abort();
	}, []);

	const rows: MetadataRow[] = [
		{
			label: "rp1",
			value: formatBuildVersion(
				clientBuild.version,
				rp1DevBuild,
				clientBuild.gitCommit,
			),
		},
		{ label: "Build mode", value: clientBuild.mode },
		{ label: "Dev build", value: formatBoolean(rp1DevBuild) },
		{ label: "Build time", value: clientBuild.buildTime },
		{
			label: "API port",
			value:
				loading || health?.port === undefined ? "Unknown" : String(health.port),
		},
		{
			label: "Projects",
			value:
				loading || health?.projectCount === undefined
					? "Unknown"
					: String(health.projectCount),
		},
		{ label: "Uptime", value: formatUptime(health?.uptime) },
	];

	return (
		<div>
			<div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
				<div className="min-w-0">
					<h2 className="type-body font-medium text-fg">About rp1</h2>
					<p className="mt-1 type-secondary text-fg-muted">
						Version and build metadata
					</p>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-ghost transition-colors duration-150 hover:bg-surface-void hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
					aria-label="Close about dialog"
				>
					<X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</div>
			<dl className="px-4 py-3">
				{rows.map((row) => (
					<AboutMetadataRow key={row.label} {...row} />
				))}
			</dl>
			{error && (
				<p className="border-t border-border px-4 py-3 type-secondary text-failure">
					{error}
				</p>
			)}
		</div>
	);
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
	const navigate = useNavigate();
	const { toggleTheme } = useTheme();
	const registry = useShortcutRegistry();
	const reducedMotion = usePrefersReducedMotion();
	const contextualCommands = registry.contextualShortcuts?.commands ?? [];
	const [view, setView] = useState<PaletteView>("commands");

	useEffect(() => {
		if (!open) {
			setView("commands");
		}
	}, [open]);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				setView("commands");
			}
			onOpenChange(nextOpen);
		},
		[onOpenChange],
	);

	const executeCommand = useCallback(
		(command: CommandType) => {
			if (isNavigationCommand(command)) {
				navigate(command.path);
			} else if (isActionCommand(command)) {
				switch (command.action) {
					case "toggle-theme":
						toggleTheme();
						break;
					case "refresh-data":
						window.dispatchEvent(new CustomEvent("rp1:refresh"));
						break;
					case "show-about":
						setView("about");
						return;
				}
			}
			handleOpenChange(false);
		},
		[navigate, toggleTheme, handleOpenChange],
	);

	const executeContextualCommand = useCallback(
		(action: () => void) => {
			action();
			handleOpenChange(false);
		},
		[handleOpenChange],
	);

	return (
		<AnimatedCommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			reducedMotion={reducedMotion}
			title={view === "about" ? "About rp1" : "Command Palette"}
			wrapCommand={view === "commands"}
		>
			{view === "about" ? (
				<AboutPanel onClose={() => handleOpenChange(false)} />
			) : (
				<>
					<CommandInput placeholder="Type a command or search..." />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<motion.div
							variants={
								reducedMotion
									? commandStaggerContainerReduced
									: commandStaggerContainer
							}
							initial="initial"
							animate="animate"
						>
							<CommandGroup heading="Navigation">
								{navigationCommands.map((cmd) => (
									<motion.div
										key={cmd.id}
										variants={reducedMotion ? staggerItemReduced : staggerItem}
									>
										<CommandItem
											value={`${cmd.label} ${cmd.keywords.join(" ")}`}
											onSelect={() => executeCommand(cmd)}
										>
											{navigationIcons[cmd.id]}
											<span>{cmd.label}</span>
											{cmd.shortcutLabel && (
												<CommandShortcut>{cmd.shortcutLabel}</CommandShortcut>
											)}
										</CommandItem>
									</motion.div>
								))}
							</CommandGroup>
							<CommandGroup heading="Actions">
								{actionCommands.map((cmd) => (
									<motion.div
										key={cmd.id}
										variants={reducedMotion ? staggerItemReduced : staggerItem}
									>
										<CommandItem
											value={`${cmd.label} ${cmd.keywords.join(" ")}`}
											onSelect={() => executeCommand(cmd)}
										>
											{actionIcons[cmd.id]}
											<span>{cmd.label}</span>
											{cmd.shortcutLabel && (
												<CommandShortcut>{cmd.shortcutLabel}</CommandShortcut>
											)}
										</CommandItem>
									</motion.div>
								))}
							</CommandGroup>
							{registry.contextualShortcuts &&
								contextualCommands.length > 0 && (
									<CommandGroup
										heading={registry.contextualShortcuts.viewLabel}
									>
										{contextualCommands.map((cmd) => (
											<motion.div
												key={cmd.id}
												variants={
													reducedMotion ? staggerItemReduced : staggerItem
												}
											>
												<CommandItem
													value={`${cmd.label} ${cmd.description} ${(cmd.keywords ?? []).join(" ")}`}
													onSelect={() => executeContextualCommand(cmd.action)}
												>
													<List
														className="mr-2 h-4 w-4"
														strokeWidth={1.5}
														aria-hidden="true"
													/>
													<span>{cmd.label}</span>
													{cmd.shortcutHint && (
														<CommandShortcut>
															{cmd.shortcutHint}
														</CommandShortcut>
													)}
												</CommandItem>
											</motion.div>
										))}
									</CommandGroup>
								)}
						</motion.div>
					</CommandList>
				</>
			)}
		</AnimatedCommandDialog>
	);
}
