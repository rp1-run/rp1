import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NewUpdatesChipProps {
	visible: boolean;
	onClick: () => void;
}

export function NewUpdatesChip({ visible, onClick }: NewUpdatesChipProps) {
	if (!visible) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"absolute bottom-4 right-4 z-10",
				"flex items-center gap-1.5 px-3 py-1.5",
				"rounded-full",
				"bg-primary text-primary-foreground",
				"text-sm font-medium",
				"shadow-md",
				"transition-opacity duration-200 ease-in",
				"animate-in fade-in slide-in-from-bottom-2",
				"hover:bg-primary/90",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
			)}
			aria-label="Scroll to new updates"
		>
			<ChevronDown className="h-4 w-4" aria-hidden="true" />
			<span>New updates</span>
		</button>
	);
}
