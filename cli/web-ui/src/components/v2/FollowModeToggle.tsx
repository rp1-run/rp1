import { ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FollowModeToggleProps {
	enabled: boolean;
	onToggle: () => void;
}

export function FollowModeToggle({ enabled, onToggle }: FollowModeToggleProps) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={cn(
							"h-8 w-8",
							enabled
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground",
						)}
						onClick={onToggle}
						aria-label="Follow mode"
						aria-pressed={enabled}
					>
						<ArrowDownToLine
							className={cn(
								"h-4 w-4",
								enabled ? "fill-current" : "fill-none",
							)}
							aria-hidden="true"
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Follow mode: auto-scroll to new content</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
