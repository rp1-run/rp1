import { basename } from "node:path";
import type {
	AntigravityPluginValidationPluginResult,
	AntigravityPluginValidationResult,
	AntigravityPluginValidationStatus,
} from "./models.js";

export interface AntigravityPluginValidationOptions {
	readonly pluginDirs: readonly string[];
	readonly pluginDisplayDirs: readonly string[];
	readonly getAntigravityBinaryPath?: () => string | null;
	readonly runAgyPluginValidate?: (
		binaryPath: string,
		pluginDir: string,
	) => Promise<{
		readonly exitCode: number;
		readonly stdout: string;
		readonly stderr: string;
	}>;
}

const validationUnsupportedPattern =
	/(unknown|unsupported|invalid|unrecognized).*(plugin|validate)|plugin.*(unknown|unsupported|invalid|unrecognized)|no such command/i;

const defaultRunAgyPluginValidate = async (
	binaryPath: string,
	pluginDir: string,
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> => {
	const proc = Bun.spawn([binaryPath, "plugin", "validate", pluginDir], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

const statusFromCommand = (
	exitCode: number,
	output: string,
): AntigravityPluginValidationStatus => {
	if (exitCode === 0) return "passed";
	if (validationUnsupportedPattern.test(output)) return "unsupported";
	return "failed";
};

const validationIssue = (
	status: AntigravityPluginValidationStatus,
	output: string,
): string | null => {
	if (status === "passed") return null;
	if (status === "unsupported") {
		return "The detected `agy` binary does not expose `agy plugin validate`.";
	}
	return output.trim() || "Antigravity plugin validation failed.";
};

const overallStatus = (
	plugins: readonly AntigravityPluginValidationPluginResult[],
): AntigravityPluginValidationStatus => {
	if (plugins.some((plugin) => plugin.status === "failed")) return "failed";
	if (plugins.some((plugin) => plugin.status === "unsupported")) {
		return "unsupported";
	}
	if (
		plugins.length > 0 &&
		plugins.every((plugin) => plugin.status === "passed")
	) {
		return "passed";
	}
	return "not_run";
};

const remediationFor = (status: AntigravityPluginValidationStatus): string => {
	if (status === "passed") {
		return "Antigravity plugin validation passed for all rp1 packages.";
	}
	if (status === "missing_binary") {
		return "Install Antigravity CLI, then confirm `agy --version` succeeds.";
	}
	if (status === "unsupported") {
		return "Update Antigravity CLI or manually validate the package contents before relying on installed workflows.";
	}
	if (status === "failed") {
		return "Inspect `agy plugin validate` output, refresh with `rp1 update plugins antigravity -y`, then rerun verification.";
	}
	return "Run `rp1 verify antigravity` after installing Antigravity package assets.";
};

export const validateAntigravityPackages = async (
	options: AntigravityPluginValidationOptions,
): Promise<AntigravityPluginValidationResult> => {
	const binaryPath = options.getAntigravityBinaryPath?.() ?? Bun.which("agy");

	if (!binaryPath) {
		return {
			status: "missing_binary",
			checked: false,
			binaryPath: null,
			plugins: [],
			issue: "Antigravity CLI was not found in PATH.",
			remediation: remediationFor("missing_binary"),
		};
	}

	if (options.pluginDirs.length === 0) {
		return {
			status: "not_run",
			checked: false,
			binaryPath,
			plugins: [],
			issue:
				"No Antigravity plugin package directories were available to validate.",
			remediation: remediationFor("not_run"),
		};
	}

	const runValidate =
		options.runAgyPluginValidate ?? defaultRunAgyPluginValidate;
	const plugins: AntigravityPluginValidationPluginResult[] = [];

	for (let i = 0; i < options.pluginDirs.length; i++) {
		const pluginDir = options.pluginDirs[i]!;
		const displayDir = options.pluginDisplayDirs[i] ?? pluginDir;
		const command = [binaryPath, "plugin", "validate", pluginDir] as const;
		const result = await runValidate(binaryPath, pluginDir);
		const output = `${result.stdout}\n${result.stderr}`.trim();
		const status = statusFromCommand(result.exitCode, output);
		plugins.push({
			pluginName: basename(pluginDir),
			pluginDir,
			displayDir,
			status,
			command,
			issue: validationIssue(status, output),
		});
	}

	const status = overallStatus(plugins);
	const issue =
		status === "passed"
			? null
			: (plugins.find((plugin) => plugin.issue)?.issue ??
				"Antigravity plugin validation did not pass.");

	return {
		status,
		checked: status === "passed" || status === "failed",
		binaryPath,
		plugins,
		issue,
		remediation: remediationFor(status),
	};
};
