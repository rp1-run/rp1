import { List, X } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { cn } from "@/lib/utils";

export interface TableOfContentsProps {
	headings: readonly HeadingEntry[];
	activeId: string | null;
	onNavigate: (id: string) => void;
	onClose?: () => void;
}

const LEVEL_INDENT: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
	1: "pl-2",
	2: "pl-4",
	3: "pl-6",
	4: "pl-8",
	5: "pl-10",
	6: "pl-12",
};

interface TocItemProps {
	heading: HeadingEntry;
	index: number;
	isActive: boolean;
	isFocused: boolean;
	isFirstFocusable: boolean;
	onNavigate: (id: string) => void;
	onKeyDown: (e: React.KeyboardEvent, index: number) => void;
	onFocus: (index: number) => void;
	setRef: (index: number) => (node: HTMLButtonElement | null) => void;
}

const TocItem = memo(function TocItem({
	heading,
	index,
	isActive,
	isFocused,
	isFirstFocusable,
	onNavigate,
	onKeyDown,
	onFocus,
	setRef,
}: TocItemProps) {
	return (
		<button
			ref={setRef(index)}
			id={`toc-item-${index}`}
			type="button"
			role="option"
			aria-selected={isActive}
			tabIndex={isFocused || isFirstFocusable ? 0 : -1}
			onClick={() => onNavigate(heading.id)}
			onKeyDown={(e) => onKeyDown(e, index)}
			onFocus={() => onFocus(index)}
			className={cn(
				"w-full text-left transition-colors duration-150",
				"rounded pr-2 py-1 type-secondary",
				"focus-visible:outline-none",
				LEVEL_INDENT[heading.level],
				isActive
					? "bg-accent-amber/15 text-fg"
					: "text-fg-ghost hover:text-fg-muted",
			)}
			aria-current={isActive ? "location" : undefined}
		>
			<span className="line-clamp-2">{heading.text}</span>
		</button>
	);
});

export function TableOfContents({
	headings,
	activeId,
	onNavigate,
	onClose,
}: TableOfContentsProps) {
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, index: number) => {
			let newIndex: number | null = null;

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					newIndex = index > 0 ? index - 1 : headings.length - 1;
					break;
				case "ArrowDown":
					e.preventDefault();
					newIndex = index < headings.length - 1 ? index + 1 : 0;
					break;
				case "Home":
					e.preventDefault();
					newIndex = 0;
					break;
				case "End":
					e.preventDefault();
					newIndex = headings.length - 1;
					break;
				case "Enter":
				case " ":
					e.preventDefault();
					onNavigate(headings[index].id);
					return;
				default:
					return;
			}

			if (newIndex !== null) {
				setFocusedIndex(newIndex);
				itemRefs.current.get(newIndex)?.focus();
			}
		},
		[headings, onNavigate],
	);

	const setItemRef = useCallback(
		(index: number) => (node: HTMLButtonElement | null) => {
			if (node) {
				itemRefs.current.set(index, node);
			} else {
				itemRefs.current.delete(index);
			}
		},
		[],
	);

	const handleFocus = useCallback((index: number) => {
		setFocusedIndex(index);
	}, []);

	return (
		<nav className="flex h-full flex-col" aria-label="Table of contents">
			<header className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
				<div className="flex items-center gap-2">
					<List className="h-3.5 w-3.5 text-fg-ghost" strokeWidth={1.5} />
					<h2 className="type-secondary text-fg-muted tracking-wider uppercase">
						On this page
					</h2>
					{headings.length > 0 && (
						<span className="type-secondary text-fg-ghost tabular-nums">
							{headings.length}
						</span>
					)}
				</div>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="text-fg-ghost transition-colors duration-150 hover:text-fg"
						aria-label="Close table of contents"
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				)}
			</header>

			{headings.length === 0 ? (
				<div className="px-4 py-3 type-secondary text-fg-ghost">
					No headings found
				</div>
			) : (
				<div
					className="flex-1 overflow-y-auto"
					role="listbox"
					tabIndex={0}
					aria-label="Document headings"
					aria-activedescendant={
						focusedIndex !== null ? `toc-item-${focusedIndex}` : undefined
					}
				>
					<div className="space-y-px px-2 py-1">
						{headings.map((heading, index) => (
							<TocItem
								key={heading.id}
								heading={heading}
								index={index}
								isActive={heading.id === activeId}
								isFocused={focusedIndex === index}
								isFirstFocusable={focusedIndex === null && index === 0}
								onNavigate={onNavigate}
								onKeyDown={handleKeyDown}
								onFocus={handleFocus}
								setRef={setItemRef}
							/>
						))}
					</div>
				</div>
			)}
		</nav>
	);
}
