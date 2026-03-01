import { HelpCircle, Keyboard, Moon, Sun } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface V2HeaderProps {
	wsStatus: ConnectionStatus;
}

export function V2Header({ wsStatus }: V2HeaderProps) {
	return (
		<header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
			<div className="flex items-center gap-2">
				<Logo wsStatus={wsStatus} />
			</div>
			<div className="flex items-center gap-1">
				<ThemeButton />
				<KeyboardButton />
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
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen reader context
		<span
			title={
				wsStatus === "connected" ? "Live updates active" : "Reconnecting..."
			}
			aria-label={`rp1 - Connection status: ${wsStatus}`}
		>
			<span className="text-lg font-medium font-mono">rp1</span>
			<span
				className={cn(
					"animate-blink",
					wsStatus === "connected"
						? "text-terminal-green"
						: "text-terminal-red",
				)}
			>
				_
			</span>
		</span>
	);
}

function ThemeButton() {
	const { theme, toggleTheme } = useTheme();
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={toggleTheme}
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
					>
						{theme === "dark" ? (
							<Sun className="h-4 w-4" />
						) : (
							<Moon className="h-4 w-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{theme === "dark" ? "Light mode" : "Dark mode"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function KeyboardButton() {
	const openShortcutHelp = useCallback(() => {
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "?",
				bubbles: true,
			}),
		);
	}, []);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={openShortcutHelp}
						aria-label="Keyboard shortcuts"
					>
						<Keyboard className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Keyboard shortcuts (?)</TooltipContent>
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
