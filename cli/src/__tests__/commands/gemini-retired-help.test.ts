import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cliRoot = join(import.meta.dir, "..", "..", "..");

const runCli = async (
	args: readonly string[],
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> => {
	const proc = Bun.spawn(["bun", "run", "src/main.ts", ...args], {
		cwd: cliRoot,
		env: {
			...process.env,
			NO_COLOR: "1",
		},
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

describe("retired Gemini lifecycle help", () => {
	const publicHelpCases = [
		{
			name: "install",
			args: ["install", "--help"],
			active: "Install rp1 Antigravity CLI package assets",
			retired: "gemini [options] Install rp1 Gemini CLI extension assets",
		},
		{
			name: "verify",
			args: ["verify", "--help"],
			active: "antigravity    Verify Antigravity CLI integration",
			retired:
				"gemini [options] Verify Gemini CLI integration and support-matrix readiness",
		},
		{
			name: "uninstall",
			args: ["uninstall", "--help"],
			active: "Remove rp1 Antigravity CLI package assets",
			retired: "gemini [options] Remove rp1 Gemini CLI extension assets",
		},
	] as const;

	for (const helpCase of publicHelpCases) {
		test(`${helpCase.name} public help exposes Antigravity without Gemini`, async () => {
			const result = await runCli(helpCase.args);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(helpCase.active);
			expect(result.stdout).not.toContain(helpCase.retired);
		});
	}

	const hiddenRouteCases = [
		{
			name: "install gemini",
			args: ["install", "gemini", "--help"],
			legacyHelp: "Install rp1 Gemini CLI extension assets",
		},
		{
			name: "verify gemini",
			args: ["verify", "gemini", "--help"],
			legacyHelp: "Verify Gemini CLI integration and support-matrix readiness",
		},
		{
			name: "uninstall gemini",
			args: ["uninstall", "gemini", "--help"],
			legacyHelp: "Remove rp1 Gemini CLI extension assets",
		},
	] as const;

	for (const routeCase of hiddenRouteCases) {
		test(`${routeCase.name} remains available as an explicit legacy route`, async () => {
			const result = await runCli(routeCase.args);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(routeCase.legacyHelp);
		});
	}
});
