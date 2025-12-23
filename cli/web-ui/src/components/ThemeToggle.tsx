import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/providers/ThemeProvider";

export function ThemeToggle() {
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
					{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
