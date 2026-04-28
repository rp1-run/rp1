interface BaseCommand {
	readonly id: string;
	readonly label: string;
	readonly category: "Navigation" | "Actions";
	readonly keywords: readonly string[];
	readonly shortcutLabel?: string;
}

export interface NavigationCommand extends BaseCommand {
	readonly category: "Navigation";
	readonly path: string;
}

export interface ActionCommand extends BaseCommand {
	readonly category: "Actions";
	readonly action: string;
}

export type Command = NavigationCommand | ActionCommand;

export function isNavigationCommand(cmd: Command): cmd is NavigationCommand {
	return cmd.category === "Navigation";
}

export function isActionCommand(cmd: Command): cmd is ActionCommand {
	return cmd.category === "Actions";
}

export const commands: readonly Command[] = [
	{
		id: "nav-home",
		label: "Home",
		category: "Navigation",
		path: "/",
		keywords: ["dashboard", "main", "index"],
		shortcutLabel: "g then h",
	},
	{
		id: "nav-runs",
		label: "Runs",
		category: "Navigation",
		path: "/runs",
		keywords: ["builds", "executions", "jobs"],
		shortcutLabel: "g then r",
	},
	{
		id: "nav-projects",
		label: "Projects",
		category: "Navigation",
		path: "/projects",
		keywords: ["repos", "repositories", "workspaces"],
		shortcutLabel: "g then p",
	},
	{
		id: "act-theme",
		label: "Toggle Theme",
		category: "Actions",
		action: "toggle-theme",
		keywords: ["dark", "light", "mode", "appearance"],
	},
	{
		id: "act-refresh",
		label: "Refresh Data",
		category: "Actions",
		action: "refresh-data",
		keywords: ["reload", "refetch", "update"],
	},
	{
		id: "act-about",
		label: "About",
		category: "Actions",
		action: "show-about",
		keywords: ["version", "build", "metadata", "dev"],
	},
] as const;
