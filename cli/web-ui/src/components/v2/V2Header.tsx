import { HelpCircle, Keyboard, Moon, Sun } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrandMark } from "@/components/v2/BrandMark";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

const CONNECTION_STATUS_DETAILS: Record<
	ConnectionStatus,
	{ className: string; title: string }
> = {
	connected: {
		className: "bg-terminal-green",
		title: "Live updates active",
	},
	connecting: {
		className: "bg-terminal-yellow",
		title: "Connecting to live updates",
	},
	disconnected: {
		className: "bg-failure",
		title: "Disconnected from live updates",
	},
};

export interface V2HeaderProps {
	wsStatus: ConnectionStatus;
}

export function V2Header({ wsStatus }: V2HeaderProps) {
	return (
		<header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
			<div className="flex items-center gap-3">
				<BrandMark label="RP1 Arcade" />
				<ConnectionStatusIndicator wsStatus={wsStatus} />
			</div>
			<div className="flex items-center gap-1">
				<ThemeButton />
				<KeyboardButton />
				<HelpButton />
			</div>
		</header>
	);
}

interface ConnectionStatusIndicatorProps {
	wsStatus: ConnectionStatus;
}

function ConnectionStatusIndicator({
	wsStatus,
}: ConnectionStatusIndicatorProps) {
	const statusDetails = CONNECTION_STATUS_DETAILS[wsStatus];

	return (
		<output
			aria-label={`Connection status: ${wsStatus}`}
			title={statusDetails.title}
			className="inline-flex h-7 items-center"
		>
			<span
				aria-hidden="true"
				className={cn(
					"h-2.5 w-2.5 rounded-full ring-2 ring-background",
					statusDetails.className,
				)}
			/>
		</output>
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
