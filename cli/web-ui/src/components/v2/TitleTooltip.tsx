import {
	cloneElement,
	type FocusEvent,
	type PointerEvent,
	type ReactElement,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type TitleTooltipChild = ReactElement<{
	readonly onBlur?: (event: FocusEvent<HTMLElement>) => void;
	readonly onFocus?: (event: FocusEvent<HTMLElement>) => void;
	readonly onPointerCancel?: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
	readonly title?: string | null | undefined;
}>;

const TITLE_TOOLTIP_DELAY_MS = 250;

interface TitleTooltipProps {
	readonly title?: string | null | undefined;
	readonly children: TitleTooltipChild;
	readonly side?: "top" | "right" | "bottom" | "left";
	readonly align?: "start" | "center" | "end";
}

export function TitleTooltip({
	title,
	children,
	side = "top",
	align = "start",
}: TitleTooltipProps) {
	const content = (title ?? children.props.title)?.trim();
	const [open, setOpen] = useState(false);
	const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearOpenTimer = () => {
		if (openTimerRef.current) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
	};

	useEffect(
		() => () => {
			if (openTimerRef.current) {
				clearTimeout(openTimerRef.current);
			}
		},
		[],
	);

	if (!content) {
		return children;
	}

	const close = () => {
		clearOpenTimer();
		setOpen(false);
	};

	const trigger = cloneElement(children, {
		title: undefined,
		onBlur: (event: FocusEvent<HTMLElement>) => {
			children.props.onBlur?.(event);
			close();
		},
		onFocus: (event: FocusEvent<HTMLElement>) => {
			children.props.onFocus?.(event);
			close();
		},
		onPointerCancel: (event: PointerEvent<HTMLElement>) => {
			children.props.onPointerCancel?.(event);
			close();
		},
		onPointerEnter: (event: PointerEvent<HTMLElement>) => {
			children.props.onPointerEnter?.(event);
			if (event.pointerType === "touch") return;

			clearOpenTimer();
			openTimerRef.current = setTimeout(() => {
				setOpen(true);
				openTimerRef.current = null;
			}, TITLE_TOOLTIP_DELAY_MS);
		},
		onPointerLeave: (event: PointerEvent<HTMLElement>) => {
			children.props.onPointerLeave?.(event);
			close();
		},
	});

	return (
		<TooltipProvider delayDuration={TITLE_TOOLTIP_DELAY_MS}>
			<Tooltip
				open={open}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) close();
				}}
			>
				<TooltipTrigger asChild>{trigger}</TooltipTrigger>
				<TooltipContent
					side={side}
					align={align}
					sideOffset={6}
					collisionPadding={12}
					className="pointer-events-none max-w-[min(28rem,calc(100vw-2rem))] rounded-sm border-border bg-surface px-2 py-1 text-left type-secondary text-fg-muted shadow-none"
				>
					{content}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
