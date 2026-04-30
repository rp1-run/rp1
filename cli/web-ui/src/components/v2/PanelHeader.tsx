import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PANEL_HEADER_PADDING_CLASS = "px-4 pt-3 pb-2";

export interface PanelHeaderIconButtonProps {
	readonly icon: LucideIcon;
	readonly ariaLabel: string;
	readonly onClick: () => void;
	readonly ariaExpanded?: boolean;
	readonly ariaPressed?: boolean;
	readonly title?: string;
	readonly className?: string;
}

export function PanelHeaderIconButton({
	icon: Icon,
	ariaLabel,
	onClick,
	ariaExpanded,
	ariaPressed,
	title,
	className,
}: PanelHeaderIconButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex h-4 items-center text-fg-ghost transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
				className,
			)}
			aria-label={ariaLabel}
			aria-expanded={ariaExpanded}
			aria-pressed={ariaPressed}
			title={title}
		>
			<Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
		</button>
	);
}

export interface PanelHeaderProps {
	readonly icon: LucideIcon;
	readonly title: string;
	readonly meta?: ReactNode;
	readonly actions?: ReactNode;
	readonly iconButton?: Omit<PanelHeaderIconButtonProps, "icon">;
}

export function PanelHeader({
	icon: Icon,
	title,
	meta,
	actions,
	iconButton,
}: PanelHeaderProps) {
	return (
		<header
			className={cn(
				"shrink-0 flex items-center justify-between",
				PANEL_HEADER_PADDING_CLASS,
			)}
		>
			<div className="flex items-center gap-2">
				{iconButton ? (
					<PanelHeaderIconButton icon={Icon} {...iconButton} />
				) : (
					<span className="inline-flex h-4 items-center text-fg-ghost">
						<Icon
							className="h-3.5 w-3.5"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</span>
				)}
				<h2 className="type-secondary text-fg-muted tracking-wider uppercase">
					{title}
				</h2>
				{meta}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</header>
	);
}
