import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LineDiffEntry } from "@/lib/diff-engine";
import { calculatePopoverPosition, type PopoverPosition } from "@/lib/utils";

export interface EditDiffPopoverProps {
	readonly entry: LineDiffEntry;
	readonly anchorRect: DOMRect;
	readonly onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
	added: "Added",
	modified: "Modified",
	deleted: "Deleted",
};

const TYPE_COLORS: Record<string, string> = {
	added: "text-diff-added",
	modified: "text-diff-modified",
	deleted: "text-failure",
};

export function EditDiffPopover({
	entry,
	anchorRect,
	onClose,
}: EditDiffPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const [isPositioned, setIsPositioned] = useState(false);
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		x: anchorRect.left - 260 - 8,
		y: anchorRect.top,
		side: "left",
	});

	useEffect(() => {
		if (!popoverRef.current) return;

		const rect = popoverRef.current.getBoundingClientRect();
		const newPosition = calculatePopoverPosition(
			{
				left: anchorRect.left,
				right: anchorRect.right,
				top: anchorRect.top,
				bottom: anchorRect.bottom,
			},
			rect.width,
			rect.height,
		);

		setPopoverPosition(newPosition);
		setIsPositioned(true);
	}, [anchorRect]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopImmediatePropagation();
				onClose();
			}
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape, true);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [onClose]);

	useEffect(() => {
		const handleScroll = (e: Event) => {
			if (popoverRef.current?.contains(e.target as Node)) return;
			onClose();
		};

		window.addEventListener("scroll", handleScroll, true);
		return () => window.removeEventListener("scroll", handleScroll, true);
	}, [onClose]);

	return (
		<div
			ref={popoverRef}
			className={`fixed z-50 w-[260px] rounded border border-border bg-surface ${isPositioned ? "animate-in fade-in-0 duration-150" : "opacity-0"}`}
			style={{
				left: `${popoverPosition.x}px`,
				top: `${popoverPosition.y}px`,
			}}
			role="dialog"
			aria-label="Edit diff details"
		>
			<div className="flex items-center justify-between px-3 pt-2 pb-1">
				<span
					className={`type-secondary font-medium ${TYPE_COLORS[entry.type] ?? "text-fg-muted"}`}
				>
					{TYPE_LABELS[entry.type] ?? entry.type} · line {entry.line}
				</span>
				<button
					type="button"
					onClick={onClose}
					className="text-fg-ghost transition-colors duration-150 hover:text-fg p-1"
					aria-label="Close"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>

			<div className="px-3 pb-3 space-y-1.5 max-h-[300px] overflow-y-auto">
				{entry.before !== null && (
					<div className="rounded bg-surface-void px-2 py-1.5">
						<span className="type-secondary text-fg-ghost block mb-0.5">
							Before
						</span>
						<pre className="whitespace-pre-wrap break-words font-mono text-xs max-h-[120px] overflow-y-auto text-failure">
							{entry.before || "\u00A0"}
						</pre>
					</div>
				)}
				{entry.after !== null && (
					<div className="rounded bg-surface-void px-2 py-1.5">
						<span className="type-secondary text-fg-ghost block mb-0.5">
							After
						</span>
						<pre className="whitespace-pre-wrap break-words font-mono text-xs max-h-[120px] overflow-y-auto text-diff-added">
							{entry.after || "\u00A0"}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
}
