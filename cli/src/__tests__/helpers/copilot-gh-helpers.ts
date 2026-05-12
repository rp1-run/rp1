import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEnvOverride } from "./fs-helpers.js";

interface FakeCopilotCliOptions {
	readonly alreadyInstalledPlugins?: readonly string[];
	readonly forceMarketplaceRemoval?: boolean;
	readonly pluginHelpExitCode?: number;
	readonly pluginListOutput?: string;
	readonly versionOutput?: string;
}

export interface FakeCopilotCli {
	readonly logPath: string;
	readonly restore: () => void;
	readonly readCommands: () => Promise<readonly string[]>;
}

const FAKE_COPILOT_SCRIPT = `#!/bin/sh

command="$*"

if [ -n "$RP1_TEST_COPILOT_LOG" ]; then
\tprintf '%s\\n' "$command" >> "$RP1_TEST_COPILOT_LOG"
fi

state_dir="\${RP1_TEST_COPILOT_STATE_DIR:-.}"
mkdir -p "$state_dir"

contains_csv() {
\tcase ",$1," in
\t\t*",$2,"*) return 0 ;;
\t\t*) return 1 ;;
\tesac
}

mark_once() {
\tkey=$(printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_')
\tstate_path="$state_dir/$key"
\tif [ -f "$state_path" ]; then
\t\treturn 1
\tfi
\t: > "$state_path"
\treturn 0
}

if [ "$command" = "version" ]; then
\tprintf '%s\\n' "\${RP1_TEST_COPILOT_VERSION_OUTPUT:-copilot version 1.0.0}"
\texit 0
fi

if [ "$command" = "plugin --help" ]; then
\tif [ -n "\${RP1_TEST_COPILOT_PLUGIN_HELP_EXIT:-}" ]; then
\t\tprintf '%s\\n' "\${RP1_TEST_COPILOT_PLUGIN_HELP_OUTPUT:-GitHub Copilot plugin commands unavailable}" >&2
\t\texit "$RP1_TEST_COPILOT_PLUGIN_HELP_EXIT"
\tfi
\tprintf '%s\\n' "GitHub Copilot plugin commands"
\texit 0
fi

if [ "$command" = "plugin list" ]; then
\tprintf '%s' "\${RP1_TEST_COPILOT_PLUGIN_LIST_OUTPUT:-Installed plugins:}"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then
\tplugin_ref="$3"
\tif contains_csv "\${RP1_TEST_COPILOT_ALREADY_INSTALLED:-}" "$plugin_ref" && mark_once "install-$plugin_ref"; then
\t\tprintf '%s already installed\\n' "$plugin_ref" >&2
\t\texit 1
\tfi
\tprintf 'installed %s\\n' "$plugin_ref"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "update" ]; then
\tprintf 'updated %s\\n' "$3"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "add" ]; then
\tprintf 'registered marketplace %s\\n' "$4"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "remove" ] && [ "$4" != "--force" ]; then
\tif [ "\${RP1_TEST_COPILOT_FORCE_MARKETPLACE_REMOVAL:-}" = "1" ] && mark_once "marketplace-remove"; then
\t\tprintf '%s\\n' "plugins from this marketplace are installed; use --force" >&2
\t\texit 1
\tfi
\tprintf 'removed marketplace %s\\n' "$4"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "remove" ] && [ "$4" = "--force" ]; then
\tprintf 'force removed marketplace %s\\n' "$5"
\texit 0
fi

if [ "$1" = "plugin" ] && [ "$2" = "uninstall" ]; then
\tprintf 'uninstalled %s\\n' "$3"
\texit 0
fi

printf 'Unexpected copilot args: %s\\n' "$command" >&2
exit 1
`;

export const installFakeCopilotCli = async (
	rootDir: string,
	options: FakeCopilotCliOptions = {},
): Promise<FakeCopilotCli> => {
	const binDir = join(rootDir, "fake-copilot-bin");
	const stateDir = join(rootDir, "fake-copilot-state");
	const logPath = join(rootDir, "fake-copilot.log");
	const copilotPath = join(binDir, "copilot");

	await mkdir(binDir, { recursive: true });
	await mkdir(stateDir, { recursive: true });
	await writeFile(copilotPath, FAKE_COPILOT_SCRIPT, "utf-8");
	await chmod(copilotPath, 0o755);

	const restorePath = withEnvOverride(
		"PATH",
		`${binDir}:${process.env.PATH ?? ""}`,
	);
	const restoreLog = withEnvOverride("RP1_TEST_COPILOT_LOG", logPath);
	const restoreStateDir = withEnvOverride(
		"RP1_TEST_COPILOT_STATE_DIR",
		stateDir,
	);
	const restoreAlreadyInstalled = withEnvOverride(
		"RP1_TEST_COPILOT_ALREADY_INSTALLED",
		options.alreadyInstalledPlugins?.join(",") || undefined,
	);
	const restoreForceRemove = withEnvOverride(
		"RP1_TEST_COPILOT_FORCE_MARKETPLACE_REMOVAL",
		options.forceMarketplaceRemoval ? "1" : undefined,
	);
	const restorePluginList = withEnvOverride(
		"RP1_TEST_COPILOT_PLUGIN_LIST_OUTPUT",
		options.pluginListOutput,
	);
	const restorePluginHelpExit = withEnvOverride(
		"RP1_TEST_COPILOT_PLUGIN_HELP_EXIT",
		options.pluginHelpExitCode === undefined
			? undefined
			: String(options.pluginHelpExitCode),
	);
	const restoreVersion = withEnvOverride(
		"RP1_TEST_COPILOT_VERSION_OUTPUT",
		options.versionOutput,
	);

	return {
		logPath,
		restore: () => {
			restoreVersion();
			restorePluginHelpExit();
			restorePluginList();
			restoreForceRemove();
			restoreAlreadyInstalled();
			restoreStateDir();
			restoreLog();
			restorePath();
		},
		readCommands: async () => {
			try {
				const content = await readFile(logPath, "utf-8");
				return content
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			} catch {
				return [];
			}
		},
	};
};
