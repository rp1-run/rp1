import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const selectTriggerVariants = cva(
	"inline-flex items-center justify-between rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
	{
		variants: {
			size: {
				sm: "h-7 px-2 type-secondary font-medium min-w-[80px] max-w-[160px] gap-1 border border-border/50 bg-transparent hover:bg-surface text-fg-muted",
				md: "h-9 px-3 text-sm min-w-[140px] gap-2 border border-border bg-background hover:bg-muted",
				lg: "h-10 px-4 text-sm min-w-[160px] gap-2 border border-border bg-background hover:bg-muted",
			},
		},
		defaultVariants: { size: "md" },
	},
);

const chevronSizes = {
	sm: "h-3 w-3",
	md: "h-4 w-4",
	lg: "h-4 w-4",
} as const;

const checkSizes = {
	sm: "h-3 w-3",
	md: "h-4 w-4",
	lg: "h-4 w-4",
} as const;

const optionPadding = {
	sm: "gap-1 px-2 py-1.5 type-secondary font-medium",
	md: "gap-2 px-3 py-2 text-sm",
	lg: "gap-2 px-3 py-2 text-sm",
} as const;

const unselectedOffset = {
	sm: "pl-4",
	md: "pl-6",
	lg: "pl-6",
} as const;

export interface SelectProps<T extends string>
	extends VariantProps<typeof selectTriggerVariants> {
	value: T | null;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	placeholder?: string;
	label?: string;
	className?: string;
}

export function Select<T extends string>({
	value,
	options,
	onChange,
	placeholder,
	label,
	size = "md",
	className,
}: SelectProps<T>) {
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const listRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
	const resolvedSize = size ?? "md";

	const selectedOption = options.find((o) => o.value === value);
	const selectedIndex = options.findIndex((o) => o.value === value);

	const handleOpen = useCallback(() => {
		setOpen(true);
		setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
	}, [selectedIndex]);

	const handleClose = useCallback(() => {
		setOpen(false);
		setFocusedIndex(-1);
		triggerRef.current?.focus();
	}, []);

	const handleSelect = useCallback(
		(optionValue: T) => {
			onChange(optionValue);
			setOpen(false);
			setFocusedIndex(-1);
			triggerRef.current?.focus();
		},
		[onChange],
	);

	useEffect(() => {
		if (open && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
			optionRefs.current[focusedIndex]?.focus();
		}
	}, [open, focusedIndex]);

	const handleTriggerKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "Enter":
				case " ":
				case "ArrowDown":
					e.preventDefault();
					handleOpen();
					break;
				case "ArrowUp":
					e.preventDefault();
					setOpen(true);
					setFocusedIndex(
						selectedIndex >= 0 ? selectedIndex : options.length - 1,
					);
					break;
			}
		},
		[handleOpen, selectedIndex, options.length],
	);

	const handleListKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
					break;
				case "ArrowUp":
					e.preventDefault();
					setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
					break;
				case "Enter":
				case " ": {
					e.preventDefault();
					const focused = options[focusedIndex];
					if (focused) {
						handleSelect(focused.value);
					}
					break;
				}
				case "Escape":
					e.preventDefault();
					handleClose();
					break;
				case "Home":
					e.preventDefault();
					setFocusedIndex(0);
					break;
				case "End":
					e.preventDefault();
					setFocusedIndex(options.length - 1);
					break;
			}
		},
		[options, focusedIndex, handleSelect, handleClose],
	);

	return (
		<div className={cn("relative", className)}>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => (open ? handleClose() : handleOpen())}
				onKeyDown={handleTriggerKeyDown}
				className={selectTriggerVariants({ size })}
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-label={label}
			>
				<span
					className={cn("truncate", !selectedOption && "text-muted-foreground")}
				>
					{selectedOption?.label ?? placeholder ?? "Select..."}
				</span>
				<ChevronDown
					className={cn(
						chevronSizes[resolvedSize],
						"text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>

			{open && (
				<>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click handler */}
					<div
						className="fixed inset-0 z-40"
						onClick={handleClose}
						onKeyDown={(e) => e.key === "Escape" && handleClose()}
						role="presentation"
					/>
					<div
						ref={listRef}
						role="listbox"
						aria-label={label}
						onKeyDown={handleListKeyDown}
						className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-background shadow-lg"
					>
						{options.map((option, index) => (
							<div
								key={option.value}
								ref={(el) => {
									optionRefs.current[index] = el;
								}}
								role="option"
								aria-selected={option.value === value}
								className={cn(
									"flex cursor-pointer items-center transition-colors",
									"hover:bg-muted",
									option.value === value && "bg-muted/50",
									index === focusedIndex &&
										"bg-muted outline-none ring-2 ring-inset ring-ring",
									optionPadding[resolvedSize],
								)}
								onClick={() => handleSelect(option.value)}
								onKeyDown={handleListKeyDown}
								tabIndex={index === focusedIndex ? 0 : -1}
							>
								{option.value === value && (
									<Check
										className={cn(checkSizes[resolvedSize], "text-foreground")}
										aria-hidden="true"
									/>
								)}
								<span
									className={
										option.value !== value ? unselectedOffset[resolvedSize] : ""
									}
								>
									{option.label}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
