import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAnnotations } from "@/hooks/useAnnotations";

export interface AnnotationToggleBtnProps {
	readonly artifactPath: string;
	readonly onClick: () => void;
	readonly variant?: "icon" | "inline";
	readonly className?: string;
}

function IconVariant({
	count,
	onClick,
}: {
	readonly count: number;
	readonly onClick: () => void;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 relative"
						onClick={onClick}
						aria-label="Open annotations panel"
					>
						<MessageSquare
							className="h-4 w-4"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						{count > 0 && (
							<span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
								{count > 99 ? "99+" : count}
							</span>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Annotations {count > 0 ? `(${count})` : ""}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function InlineVariant({
	count,
	onClick,
	className,
}: {
	readonly count: number;
	readonly onClick: () => void;
	readonly className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={
				className ??
				"flex items-center gap-1 text-fg-ghost transition-colors duration-150 hover:text-fg"
			}
			aria-label="Toggle annotations"
		>
			<MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
			{count > 0 && (
				<span className="type-secondary tabular-nums">{count}</span>
			)}
		</button>
	);
}

export function AnnotationToggleBtn({
	artifactPath,
	onClick,
	variant = "icon",
	className,
}: AnnotationToggleBtnProps) {
	const { count } = useAnnotations({ artifactPath });

	if (variant === "inline") {
		return (
			<InlineVariant count={count} onClick={onClick} className={className} />
		);
	}

	return <IconVariant count={count} onClick={onClick} />;
}
