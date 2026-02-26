import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ShortcutDefinition } from "@/hooks/useContextualShortcuts";
import { isTextInputElement } from "@/hooks/useContextualShortcuts";
import { cn } from "@/lib/utils";
import { useShortcutRegistry } from "@/providers/ShortcutRegistryProvider";

export interface ShortcutHelpOverlayProps {
	className?: string;
}

function ShortcutKey({ keys }: { keys: string }) {
	const parts = keys.split(/(\+| )/);
	return (
		<span className="inline-flex items-center gap-0.5">
			{parts.map((part, i) => {
				const key = `${part}-${i}`;
				if (part === "+" || part === " ") {
					return (
						<span key={key} className="text-muted-foreground text-xs">
							{part === " " ? " " : "+"}
						</span>
					);
				}
				return (
					<kbd
						key={key}
						className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
					>
						{part}
					</kbd>
				);
			})}
		</span>
	);
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }) {
	return (
		<div className="flex items-center justify-between gap-4 py-1">
			<span className="text-sm text-foreground">{shortcut.description}</span>
			<ShortcutKey keys={shortcut.key} />
		</div>
	);
}

function ShortcutSection({
	title,
	shortcuts,
}: {
	title: string;
	shortcuts: ShortcutDefinition[];
}) {
	if (shortcuts.length === 0) return null;
	return (
		<div>
			<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</h3>
			<div className="space-y-0.5">
				{shortcuts.map((shortcut) => (
					<ShortcutRow key={shortcut.key} shortcut={shortcut} />
				))}
			</div>
		</div>
	);
}

export function ShortcutHelpOverlay({ className }: ShortcutHelpOverlayProps) {
	const [open, setOpen] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);
	const registry = useShortcutRegistry();

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				e.preventDefault();
				close();
				return;
			}

			if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				if (isTextInputElement(document.activeElement)) return;
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, close]);

	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
				close();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open, close]);

	if (!open) return null;

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm",
				className,
			)}
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
		>
			<div
				ref={cardRef}
				className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
			>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-mono text-lg font-semibold">
						<span className="text-terminal-green">$</span> keyboard shortcuts
					</h2>
					<button
						type="button"
						onClick={close}
						className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Close shortcuts overlay"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="space-y-5">
					<ShortcutSection
						title="Global"
						shortcuts={registry.globalShortcuts}
					/>
					<ShortcutSection
						title="Navigation"
						shortcuts={registry.navigationShortcuts}
					/>
					{registry.contextualShortcuts && (
						<ShortcutSection
							title={registry.contextualShortcuts.viewLabel}
							shortcuts={registry.contextualShortcuts.shortcuts}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
