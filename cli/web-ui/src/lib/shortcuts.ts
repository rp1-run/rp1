export interface ShortcutDef {
	readonly id: string;
	readonly keys: string;
	readonly description: string;
	readonly category: "Global" | "Navigation" | "Current View";
}

export const shortcuts: readonly ShortcutDef[] = [
	{
		id: "cmd-k",
		keys: "{mod}+K",
		description: "Open command palette",
		category: "Global",
	},
	{
		id: "question-mark",
		keys: "?",
		description: "Toggle shortcut help",
		category: "Global",
	},
	{
		id: "slash",
		keys: "/",
		description: "Focus search",
		category: "Global",
	},
	{
		id: "escape",
		keys: "Escape",
		description: "Dismiss / back",
		category: "Global",
	},
	{
		id: "cmd-backslash",
		keys: "{mod}+\\",
		description: "Toggle sidebar",
		category: "Global",
	},
	{
		id: "cmd-b",
		keys: "{mod}+B",
		description: "Toggle sidebar",
		category: "Global",
	},
	{
		id: "j-k",
		keys: "j / k",
		description: "Move down / up in list",
		category: "Navigation",
	},
	{
		id: "enter",
		keys: "Enter",
		description: "Open / select",
		category: "Navigation",
	},
	{
		id: "go-home",
		keys: "g then h",
		description: "Go to Home",
		category: "Navigation",
	},
	{
		id: "go-runs",
		keys: "g then r",
		description: "Go to Runs",
		category: "Navigation",
	},
	{
		id: "go-projects",
		keys: "g then p",
		description: "Go to Projects",
		category: "Navigation",
	},
] as const;

export function formatShortcutKeys(keys: string, modLabel: string): string {
	return keys.replace(/\{mod\}/g, modLabel);
}
