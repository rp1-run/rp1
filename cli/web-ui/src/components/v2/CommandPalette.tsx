import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
	FileText,
	Home,
	List,
	Moon,
	RefreshCw,
	SquareKanban,
} from "lucide-react";
import { useCallback } from "react";
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

export interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const navigationIcons: Record<string, React.ReactNode> = {
	"nav-home": (
		<Home className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"nav-runs": (
		<FileText className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
	),
	"nav-projects": (
		<SquareKanban
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
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
	reducedMotion: boolean;
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
										Command Palette
									</DialogPrimitive.Title>
									<Command className={CMDK_STYLES}>{children}</Command>
								</motion.div>
							</DialogPrimitive.Content>
						</div>
					</DialogPrimitive.Portal>
				)}
			</AnimatePresence>
		</DialogPrimitive.Root>
	);
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
	const navigate = useNavigate();
	const { toggleTheme } = useTheme();
	const registry = useShortcutRegistry();
	const reducedMotion = usePrefersReducedMotion();
	const contextualCommands = registry.contextualShortcuts?.commands ?? [];

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
				}
			}
			onOpenChange(false);
		},
		[navigate, toggleTheme, onOpenChange],
	);

	const executeContextualCommand = useCallback(
		(action: () => void) => {
			action();
			onOpenChange(false);
		},
		[onOpenChange],
	);

	return (
		<AnimatedCommandDialog
			open={open}
			onOpenChange={onOpenChange}
			reducedMotion={reducedMotion}
		>
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
					{registry.contextualShortcuts && contextualCommands.length > 0 && (
						<CommandGroup heading={registry.contextualShortcuts.viewLabel}>
							{contextualCommands.map((cmd) => (
								<motion.div
									key={cmd.id}
									variants={reducedMotion ? staggerItemReduced : staggerItem}
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
											<CommandShortcut>{cmd.shortcutHint}</CommandShortcut>
										)}
									</CommandItem>
								</motion.div>
							))}
						</CommandGroup>
					)}
				</motion.div>
			</CommandList>
		</AnimatedCommandDialog>
	);
}
