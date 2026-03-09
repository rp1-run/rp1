import { PanelRightClose } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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

	return (
		<nav
			className="flex h-full flex-col border-l bg-background"
			aria-label="Table of contents"
		>
			<header className="shrink-0 flex h-10 items-center justify-between border-b bg-background px-4">
				<div className="flex items-center gap-2">
					<h2 className="text-sm font-semibold">On this page</h2>
					{headings.length > 0 && (
						<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
							{headings.length}
						</span>
					)}
				</div>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded-md p-1.5 transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Close table of contents"
					>
						<PanelRightClose className="h-4 w-4" aria-hidden="true" />
					</button>
				)}
			</header>

			{headings.length === 0 ? (
				<div className="p-3 text-sm text-muted-foreground">
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
					<div className="space-y-0.5 px-2 py-2">
						{headings.map((heading, index) => {
							const isActive = heading.id === activeId;
							const isFocused = focusedIndex === index;

							return (
								<div key={heading.id}>
									<button
										ref={setItemRef(index)}
										id={`toc-item-${index}`}
										type="button"
										role="option"
										aria-selected={isActive}
										tabIndex={
											isFocused || (focusedIndex === null && index === 0)
												? 0
												: -1
										}
										onClick={() => onNavigate(heading.id)}
										onKeyDown={(e) => handleKeyDown(e, index)}
										onFocus={() => setFocusedIndex(index)}
										className={cn(
											"w-full text-left text-sm transition-colors",
											"rounded-md pr-2 py-1",
											"hover:bg-muted/50",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
											LEVEL_INDENT[heading.level],
											isActive
												? "bg-muted font-medium text-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
										aria-current={isActive ? "location" : undefined}
									>
										<span className="line-clamp-2">{heading.text}</span>
									</button>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</nav>
	);
}
