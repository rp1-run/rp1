import { usePlatform } from "@/hooks/usePlatform";

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
			{children}
		</kbd>
	);
}

interface KeyHintsProps {
	hints: ReadonlyArray<{ keys: string[]; label: string }>;
	className?: string;
}

export function KeyHints({ hints, className }: KeyHintsProps) {
	const { modLabel } = usePlatform();

	return (
		<p className={`text-xs text-muted-foreground ${className ?? ""}`}>
			{hints.map((hint, i) => (
				<span key={hint.label}>
					{i > 0 && <span className="mx-1.5 text-border">·</span>}
					{hint.keys.map((key, j) => (
						<span key={key}>
							{j > 0 && <span className="text-muted-foreground/60"> / </span>}
							<Kbd>{key === "{mod}" ? modLabel : key}</Kbd>
						</span>
					))}
					<span className="ml-1">{hint.label}</span>
				</span>
			))}
		</p>
	);
}

export const NAV_HINTS = [
	{ keys: ["j", "k"], label: "navigate" },
	{ keys: ["l"], label: "open" },
	{ keys: ["h"], label: "back" },
	{ keys: ["{mod}+K"], label: "commands" },
] as const;

export const NAV_HINTS_NO_BACK = [
	{ keys: ["j", "k"], label: "navigate" },
	{ keys: ["l"], label: "open" },
	{ keys: ["{mod}+K"], label: "commands" },
] as const;

export const DETAIL_HINTS = [
	{ keys: ["j", "k"], label: "navigate" },
	{ keys: ["l"], label: "open" },
	{ keys: ["h"], label: "back" },
	{ keys: ["{mod}+K"], label: "commands" },
] as const;

export const VIEWER_HINTS = [
	{ keys: ["h"], label: "back" },
	{ keys: ["{mod}+K"], label: "commands" },
] as const;
