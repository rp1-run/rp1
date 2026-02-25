import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { usePlatform } from "@/hooks/usePlatform";
import {
	formatShortcutKeys,
	type ShortcutDef,
	shortcuts,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export interface ShortcutHelpOverlayProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const categories = ["Global", "Navigation", "Current View"] as const;

function parseKeys(
	formatted: string,
): Array<{ type: "key" | "sep"; text: string }> {
	const parts: Array<{ type: "key" | "sep"; text: string }> = [];

	if (formatted.includes(" then ")) {
		const segments = formatted.split(" then ");
		for (let i = 0; i < segments.length; i++) {
			if (i > 0) parts.push({ type: "sep", text: "then" });
			parts.push({ type: "key", text: segments[i].trim() });
		}
		return parts;
	}

	if (formatted.includes(" / ")) {
		const segments = formatted.split(" / ");
		for (let i = 0; i < segments.length; i++) {
			if (i > 0) parts.push({ type: "sep", text: "/" });
			parts.push({ type: "key", text: segments[i].trim() });
		}
		return parts;
	}

	if (formatted.includes("+")) {
		const segments = formatted.split("+");
		for (let i = 0; i < segments.length; i++) {
			if (i > 0) parts.push({ type: "sep", text: "+" });
			parts.push({ type: "key", text: segments[i].trim() });
		}
		return parts;
	}

	parts.push({ type: "key", text: formatted });
	return parts;
}

function ShortcutKeys({ keys, modLabel }: { keys: string; modLabel: string }) {
	const formatted = formatShortcutKeys(keys, modLabel);
	const parts = parseKeys(formatted);

	return (
		<span className="flex items-center gap-1">
			{parts.map((part) =>
				part.type === "key" ? (
					<kbd
						key={`key-${part.text}`}
						className={cn(
							"inline-flex h-5 min-w-5 items-center justify-center rounded",
							"border border-border bg-muted px-1.5",
							"font-mono text-[11px] font-medium text-muted-foreground",
						)}
					>
						{part.text}
					</kbd>
				) : (
					<span
						key={`sep-${part.text}`}
						className="text-[11px] text-muted-foreground/60"
					>
						{part.text}
					</span>
				),
			)}
		</span>
	);
}

function ShortcutRow({
	shortcut,
	modLabel,
}: {
	shortcut: ShortcutDef;
	modLabel: string;
}) {
	return (
		<div className="flex items-center justify-between py-1.5">
			<span className="text-sm text-foreground">{shortcut.description}</span>
			<ShortcutKeys keys={shortcut.keys} modLabel={modLabel} />
		</div>
	);
}

function ShortcutSection({
	title,
	shortcuts: sectionShortcuts,
	modLabel,
}: {
	title: string;
	shortcuts: readonly ShortcutDef[];
	modLabel: string;
}) {
	return (
		<div className="space-y-1">
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</h3>
			{sectionShortcuts.length > 0 ? (
				<div className="divide-y divide-border/50">
					{sectionShortcuts.map((s) => (
						<ShortcutRow key={s.id} shortcut={s} modLabel={modLabel} />
					))}
				</div>
			) : (
				<p className="py-1.5 text-sm text-muted-foreground/60">
					No view-specific shortcuts
				</p>
			)}
		</div>
	);
}

export function ShortcutHelpOverlay({
	open,
	onOpenChange,
}: ShortcutHelpOverlayProps) {
	const { modLabel } = usePlatform();

	const grouped = categories.map((category) => ({
		title: category,
		items: shortcuts.filter((s) => s.category === category),
	}));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md gap-6 glass">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
				</DialogHeader>
				<div className="space-y-5">
					{grouped.map((group) => (
						<ShortcutSection
							key={group.title}
							title={group.title}
							shortcuts={group.items}
							modLabel={modLabel}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
