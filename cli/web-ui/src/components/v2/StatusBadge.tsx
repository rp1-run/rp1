import { cva, type VariantProps } from "class-variance-authority";
import { Check, Circle, CircleDot, Hand, MinusCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunStatus, StepStatus } from "@/types/runs";

const statusBadgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-full font-medium",
	{
		variants: {
			size: {
				sm: "px-2 py-0.5 text-xs",
				md: "px-2.5 py-1 text-sm",
				lg: "px-3 py-1.5 text-base",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

const iconSizes = {
	sm: "h-3 w-3",
	md: "h-4 w-4",
	lg: "h-5 w-5",
} as const;

type Status = RunStatus | StepStatus;

interface StatusConfig {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	colorClass: string;
	bgClass: string;
	glowPulse?: boolean;
}

const statusConfigs: Record<Status, StatusConfig> = {
	not_started: {
		icon: CircleDot,
		label: "Not Started",
		colorClass: "text-muted-foreground",
		bgClass: "bg-muted/50",
	},
	running: {
		icon: Circle,
		label: "Running",
		colorClass: "text-status-running",
		bgClass: "bg-status-running/15",
		glowPulse: true,
	},
	waiting: {
		icon: Hand,
		label: "Waiting",
		colorClass: "text-status-waiting",
		bgClass: "bg-status-waiting/15",
	},
	completed: {
		icon: Check,
		label: "Completed",
		colorClass: "text-status-completed",
		bgClass: "bg-status-completed/15",
	},
	failed: {
		icon: X,
		label: "Failed",
		colorClass: "text-status-failed",
		bgClass: "bg-status-failed/15",
	},
	skipped: {
		icon: MinusCircle,
		label: "Skipped",
		colorClass: "text-muted-foreground",
		bgClass: "bg-muted/50",
	},
};

export interface StatusBadgeProps
	extends VariantProps<typeof statusBadgeVariants> {
	status: Status;
	showLabel?: boolean;
	className?: string;
}

export function StatusBadge({
	status,
	size = "md",
	showLabel = true,
	className,
}: StatusBadgeProps) {
	const config = statusConfigs[status];
	const Icon = config.icon;
	const iconSize = iconSizes[size || "md"];

	return (
		// biome-ignore lint/a11y/useSemanticElements: status badge with ARIA role
		<span
			className={cn(
				statusBadgeVariants({ size }),
				config.colorClass,
				config.bgClass,
				className,
			)}
			role="status"
			aria-label={config.label}
		>
			{config.glowPulse ? (
				<span
					className={cn("flex items-center justify-center", iconSize)}
					aria-hidden="true"
				>
					<span
						className="h-2 w-2 rounded-full bg-status-running animate-glow-pulse"
						style={
							{
								"--glow-color": "hsl(var(--status-running) / 0.5)",
							} as React.CSSProperties
						}
					/>
				</span>
			) : (
				<Icon className={cn(iconSize)} aria-hidden="true" />
			)}
			{showLabel && <span>{config.label}</span>}
		</span>
	);
}
