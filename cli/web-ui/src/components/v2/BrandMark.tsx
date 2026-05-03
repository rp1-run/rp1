import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

export interface BrandMarkProps {
	className?: string;
	label?: string;
}

export function BrandMark({ className, label = "RP1" }: BrandMarkProps) {
	const { theme } = useTheme();
	const src =
		theme === "dark" ? "/rp1-mark-only-light.svg" : "/rp1-mark-only-dark.svg";

	return (
		<img
			src={src}
			alt={label}
			className={cn("h-7 w-14 shrink-0 select-none object-contain", className)}
			draggable={false}
		/>
	);
}
