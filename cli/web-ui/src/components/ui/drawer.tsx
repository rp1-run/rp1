import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DrawerProps {
	open: boolean;
	onClose: () => void;
	children: React.ReactNode;
	side?: "left" | "right";
	title?: string;
	className?: string;
}

export function Drawer({
	open,
	onClose,
	children,
	side = "left",
	title,
	className,
}: DrawerProps) {
	const drawerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [open, onClose]);

	useEffect(() => {
		if (open && drawerRef.current) {
			const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			);
			const firstElement = focusableElements[0];
			firstElement?.focus();
		}
	}, [open]);

	if (typeof document === "undefined") return null;

	return createPortal(
		<>
			{/* Backdrop */}
			<div
				className={cn(
					"fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
					open
						? "opacity-100 pointer-events-auto"
						: "opacity-0 pointer-events-none",
				)}
				onClick={onClose}
				aria-hidden="true"
			/>
			{/* Drawer panel */}
			<div
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={cn(
					"fixed z-50 flex flex-col bg-background shadow-lg transition-transform duration-200 ease-in-out",
					side === "left" && "inset-y-0 left-0 w-80 max-w-[85vw]",
					side === "right" && "inset-y-0 right-0 w-80 max-w-[85vw]",
					open
						? "translate-x-0"
						: side === "left"
							? "-translate-x-full"
							: "translate-x-full",
					className,
				)}
			>
				{title && (
					<div className="flex items-center justify-between border-b px-4 py-3">
						<h2 className="font-medium">{title}</h2>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							onClick={onClose}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				)}
				<div className="flex-1 overflow-auto">{children}</div>
			</div>
		</>,
		document.body,
	);
}
