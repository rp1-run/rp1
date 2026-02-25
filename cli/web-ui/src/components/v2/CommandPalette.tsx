import { FileText, FolderOpen, Home, Moon, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import {
	type Command,
	commands,
	isActionCommand,
	isNavigationCommand,
} from "@/lib/commands";
import { useTheme } from "@/providers/ThemeProvider";

export interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const navigationIcons: Record<string, React.ReactNode> = {
	"nav-home": <Home className="mr-2 h-4 w-4" />,
	"nav-runs": <FileText className="mr-2 h-4 w-4" />,
	"nav-projects": <FolderOpen className="mr-2 h-4 w-4" />,
};

const actionIcons: Record<string, React.ReactNode> = {
	"act-theme": <Moon className="mr-2 h-4 w-4" />,
	"act-refresh": <RefreshCw className="mr-2 h-4 w-4" />,
};

const navigationCommands = commands.filter(isNavigationCommand);
const actionCommands = commands.filter(isActionCommand);

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
	const navigate = useNavigate();
	const { toggleTheme } = useTheme();

	const executeCommand = useCallback(
		(command: Command) => {
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

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroup heading="Navigation">
					{navigationCommands.map((cmd) => (
						<CommandItem
							key={cmd.id}
							value={`${cmd.label} ${cmd.keywords.join(" ")}`}
							onSelect={() => executeCommand(cmd)}
						>
							{navigationIcons[cmd.id]}
							<span>{cmd.label}</span>
							{cmd.shortcutLabel && (
								<CommandShortcut>{cmd.shortcutLabel}</CommandShortcut>
							)}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandGroup heading="Actions">
					{actionCommands.map((cmd) => (
						<CommandItem
							key={cmd.id}
							value={`${cmd.label} ${cmd.keywords.join(" ")}`}
							onSelect={() => executeCommand(cmd)}
						>
							{actionIcons[cmd.id]}
							<span>{cmd.label}</span>
							{cmd.shortcutLabel && (
								<CommandShortcut>{cmd.shortcutLabel}</CommandShortcut>
							)}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
