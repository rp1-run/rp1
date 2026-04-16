import { Activity, FolderOpen, NotebookTabs, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWorkspaceTabs, type WorkspaceTab } from "@/hooks/useWorkspaceTabs";
import { cn } from "@/lib/utils";

function getNextFocusableKey(
	tabs: readonly WorkspaceTab[],
	currentKey: string,
	direction: "previous" | "next",
): string | null {
	const currentIndex = tabs.findIndex((tab) => tab.key === currentKey);
	if (currentIndex < 0) return null;

	const nextIndex =
		direction === "previous" ? currentIndex - 1 : currentIndex + 1;

	if (nextIndex < 0 || nextIndex >= tabs.length) {
		return null;
	}

	return tabs[nextIndex]?.key ?? null;
}

function WorkspaceKindIcon({ kind }: Pick<WorkspaceTab, "kind">) {
	switch (kind) {
		case "run":
			return (
				<Activity
					className="h-3.5 w-3.5 shrink-0"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			);
		case "project":
			return (
				<NotebookTabs
					className="h-3.5 w-3.5 shrink-0"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			);
		case "files":
			return (
				<FolderOpen
					className="h-3.5 w-3.5 shrink-0"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			);
	}
}

export interface WorkspaceTabStripProps {
	action?: ReactNode;
	className?: string;
}

export function WorkspaceTabStrip({
	action,
	className,
}: WorkspaceTabStripProps = {}) {
	const { tabs, activeKey, activateWorkspace, closeWorkspace } =
		useWorkspaceTabs();
	const reducedMotion = usePrefersReducedMotion();
	const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

	useEffect(() => {
		if (!activeKey) return;

		const activeItem = itemRefs.current.get(activeKey);
		activeItem?.scrollIntoView({
			behavior: reducedMotion ? "auto" : "smooth",
			block: "nearest",
			inline: "nearest",
		});
	}, [activeKey, reducedMotion]);

	const hasTabs = tabs.length > 0;

	if (!hasTabs && !action) {
		return null;
	}

	const focusItem = (key: string | null) => {
		if (!key) return;
		const item = itemRefs.current.get(key);
		item?.focus();
		item?.scrollIntoView({
			behavior: reducedMotion ? "auto" : "smooth",
			block: "nearest",
			inline: "nearest",
		});
	};

	const closeAndRefocus = (tab: WorkspaceTab) => {
		const currentIndex = tabs.findIndex((item) => item.key === tab.key);
		const remainingTabs = tabs.filter((item) => item.key !== tab.key);
		const fallbackIndex = Math.max(0, currentIndex - 1);
		const nextFocusableKey =
			remainingTabs[fallbackIndex]?.key ?? remainingTabs[0]?.key ?? null;

		closeWorkspace(tab.key);

		if (!nextFocusableKey || typeof window === "undefined") {
			return;
		}

		window.requestAnimationFrame(() => {
			focusItem(nextFocusableKey);
		});
	};

	const handleNavigationKey = (
		event: React.KeyboardEvent<HTMLButtonElement>,
		tab: WorkspaceTab,
	) => {
		switch (event.key) {
			case "ArrowLeft":
				event.preventDefault();
				focusItem(getNextFocusableKey(tabs, tab.key, "previous"));
				return;
			case "ArrowRight":
				event.preventDefault();
				focusItem(getNextFocusableKey(tabs, tab.key, "next"));
				return;
			case "Home":
				event.preventDefault();
				focusItem(tabs[0]?.key ?? null);
				return;
			case "End":
				event.preventDefault();
				focusItem(tabs.at(-1)?.key ?? null);
				return;
			case "Delete":
			case "Backspace":
				event.preventDefault();
				closeAndRefocus(tab);
				return;
			case "Enter":
			case " ":
				event.preventDefault();
				activateWorkspace(tab.key);
				return;
		}
	};

	const handleCloseKey = (
		event: React.KeyboardEvent<HTMLButtonElement>,
		tab: WorkspaceTab,
	) => {
		switch (event.key) {
			case "ArrowLeft":
				event.preventDefault();
				focusItem(getNextFocusableKey(tabs, tab.key, "previous"));
				return;
			case "ArrowRight":
				event.preventDefault();
				focusItem(getNextFocusableKey(tabs, tab.key, "next"));
				return;
			case "Home":
				event.preventDefault();
				focusItem(tabs[0]?.key ?? null);
				return;
			case "End":
				event.preventDefault();
				focusItem(tabs.at(-1)?.key ?? null);
				return;
			case "Delete":
			case "Backspace":
			case "Enter":
			case " ":
				event.preventDefault();
				closeAndRefocus(tab);
				return;
		}
	};

	return (
		<div
			className={cn(
				"flex min-h-11 items-center gap-3 border-b border-border/50 bg-surface-void px-3 py-2 md:px-4",
				className,
			)}
		>
			{hasTabs ? (
				<nav
					aria-label="Open workspaces"
					className="min-w-0 flex-1 overflow-x-auto"
				>
					<div className="flex items-center gap-1">
						{tabs.map((tab) => {
							const isActive = tab.key === activeKey;

							return (
								<div
									key={tab.key}
									className={cn(
										"group flex min-w-[5rem] max-w-[13rem] items-center gap-1 rounded-md border px-2 py-1 md:min-w-[7rem] md:max-w-[18rem]",
										isActive
											? "border-border bg-surface text-fg"
											: "border-transparent bg-transparent text-fg-muted hover:border-border/60 hover:bg-muted/30 hover:text-fg",
									)}
								>
									<button
										type="button"
										ref={(node) => {
											if (node) {
												itemRefs.current.set(tab.key, node);
												return;
											}

											itemRefs.current.delete(tab.key);
										}}
										onClick={() => activateWorkspace(tab.key)}
										onKeyDown={(event) => handleNavigationKey(event, tab)}
										className={cn(
											"flex min-w-0 flex-1 items-center gap-1.5 rounded-sm bg-transparent text-left",
											"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
										)}
										aria-current={isActive ? "page" : undefined}
										aria-label={
											tab.subtitle ? `${tab.title}, ${tab.subtitle}` : tab.title
										}
									>
										<WorkspaceKindIcon kind={tab.kind} />
										<span className="truncate type-secondary font-medium">
											{tab.title}
										</span>
										{tab.subtitle ? (
											<span className="hidden truncate type-secondary text-fg-ghost md:inline">
												{tab.subtitle}
											</span>
										) : null}
									</button>
									<button
										type="button"
										onClick={() => closeAndRefocus(tab)}
										onKeyDown={(event) => handleCloseKey(event, tab)}
										className={cn(
											"shrink-0 rounded-sm p-1 text-fg-ghost hover:text-fg",
											"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
											reducedMotion
												? ""
												: "transition-[opacity,color] duration-150",
											isActive
												? "opacity-100"
												: "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
										)}
										aria-label={`Close ${tab.title}`}
									>
										<X
											className="h-3 w-3"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
									</button>
								</div>
							);
						})}
					</div>
				</nav>
			) : (
				<div className="flex-1" aria-hidden="true" />
			)}
			{action ? (
				<div className="flex shrink-0 items-center">{action}</div>
			) : null}
		</div>
	);
}
