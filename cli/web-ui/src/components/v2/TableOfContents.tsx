import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { cn } from "@/lib/utils";

export interface TableOfContentsProps {
	headings: readonly HeadingEntry[];
	activeId: string | null;
	onNavigate: (id: string) => void;
	collapsed?: boolean;
	onToggleCollapse?: () => void;
}

const LEVEL_INDENT: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
	1: "pl-0",
	2: "pl-2",
	3: "pl-4",
	4: "pl-6",
	5: "pl-8",
	6: "pl-10",
};

export function TableOfContents({
	headings,
	activeId,
	onNavigate,
	collapsed = false,
	onToggleCollapse,
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

	if (collapsed) {
		return (
			<div className="flex h-full flex-col border-l bg-background">
				{onToggleCollapse && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-auto w-full rounded-none border-b px-2 py-2 flex items-center justify-center gap-1"
									onClick={onToggleCollapse}
									aria-label="Expand table of contents"
								>
									<List className="h-4 w-4" aria-hidden="true" />
									<ChevronLeft className="h-3 w-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left">
								<p>
									Expand table of contents
									{headings.length > 0 && ` (${headings.length})`}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>
		);
	}

	return (
		<nav
			className="flex h-full flex-col border-l bg-background"
			aria-label="Table of contents"
		>
			<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-3 py-2">
				<h2 className="text-sm font-medium text-foreground">On this page</h2>
				{onToggleCollapse && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									onClick={onToggleCollapse}
									aria-label="Collapse table of contents"
								>
									<ChevronRight className="h-3 w-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left">
								<p>Collapse table of contents</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>

			{headings.length === 0 ? (
				<div className="p-3 text-sm text-muted-foreground">
					No headings found
				</div>
			) : (
				<ScrollArea className="flex-1">
					<div
						className="space-y-0.5 p-2"
						role="listbox"
						tabIndex={0}
						aria-label="Document headings"
						aria-activedescendant={
							focusedIndex !== null ? `toc-item-${focusedIndex}` : undefined
						}
					>
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
											"rounded-md px-2 py-1",
											"hover:bg-muted/50",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
											LEVEL_INDENT[heading.level],
											isActive
												? "bg-accent text-accent-foreground font-medium"
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
				</ScrollArea>
			)}
		</nav>
	);
}
