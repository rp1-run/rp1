import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface CollapsibleProps {
	title: string;
	defaultExpanded?: boolean;
	icon?: ReactNode;
	badge?: ReactNode;
	rightContent?: ReactNode;
	children: ReactNode;
	className?: string;
	onExpandedChange?: (expanded: boolean) => void;
}

export function Collapsible({
	title,
	defaultExpanded = false,
	icon,
	badge,
	rightContent,
	children,
	className,
	onExpandedChange,
}: CollapsibleProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const id = useId();
	const contentId = `collapsible-content-${id}`;
	const titleId = `collapsible-title-${id}`;

	const handleToggle = () => {
		const next = !isExpanded;
		setIsExpanded(next);
		onExpandedChange?.(next);
	};

	return (
		<div
			className={cn(
				"rounded-lg border border-border overflow-hidden transition-all duration-200",
				className,
			)}
		>
			<button
				type="button"
				onClick={handleToggle}
				className={cn(
					"flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
					"hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				)}
				aria-expanded={isExpanded}
				aria-controls={contentId}
			>
				<span className="shrink-0">
					{isExpanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</span>

				{icon}

				<span id={titleId} className="flex-1 font-medium text-foreground">
					{title}
				</span>

				{badge}
				{rightContent}
			</button>

			<div
				id={contentId}
				className={cn(
					"overflow-hidden transition-all duration-200 ease-in-out",
					isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
				)}
			>
				{children}
			</div>
		</div>
	);
}
