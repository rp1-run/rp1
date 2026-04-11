import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../../../../");
const EVAL_LAUNCHER_PATH = join(REPO_ROOT, "docker", "eval-run.sh");

let tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function runCommand(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			resolve({
				stdout,
				stderr,
				exitCode: code ?? 1,
			});
		});

		proc.on("error", (error) => {
			reject(error);
		});
	});
}

async function readArgsFile(path: string): Promise<string[]> {
	const content = await readFile(path, "utf-8");
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

async function getGitRevParse(arg: string): Promise<string> {
	const result = await runCommand("git", ["rev-parse", arg], {
		cwd: REPO_ROOT,
		env: process.env,
	});
	expect(result.exitCode).toBe(0);
	return resolve(REPO_ROOT, result.stdout.trim());
}

afterEach(async () => {
	await Promise.all(
		tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
	tempDirs = [];
});

describe("dockerized eval launcher", () => {
	test("runs evals through docker without leaking host runtime overrides", async () => {
		const stubRoot = await createTempDir("rp1-docker-eval-launcher-");
		const binDir = join(stubRoot, "bin");
		const logDir = join(stubRoot, "logs");
		const dockerStubPath = join(binDir, "docker");

		await mkdir(binDir, { recursive: true });
		await mkdir(logDir, { recursive: true });
		await writeFile(
			dockerStubPath,
			`#!/usr/bin/env bash
set -euo pipefail
kind="$1"
shift || true
printf '%s\n' "$@" > "\${DOCKER_STUB_LOG_DIR}/\${kind}-args.txt"
env | sort > "\${DOCKER_STUB_LOG_DIR}/\${kind}-env.txt"
`,
			"utf-8",
		);
		await chmod(dockerStubPath, 0o755);

		const result = await runCommand(
			"bash",
			[EVAL_LAUNCHER_PATH, "rp1-dev/build-fast", "--harness=opencode"],
			{
				cwd: REPO_ROOT,
				env: {
					...process.env,
					PATH: `${binDir}:${process.env.PATH ?? ""}`,
					DOCKER_STUB_LOG_DIR: logDir,
					ANTHROPIC_API_KEY: "anthropic-test",
					GITHUB_TOKEN: "github-test",
					RP1_DB: "/tmp/host-rp1.db",
					RP1_EVAL_MODE: "true",
				},
			},
		);

		expect(result.exitCode).toBe(0);

		const buildArgs = await readArgsFile(join(logDir, "build-args.txt"));
		const runArgs = await readArgsFile(join(logDir, "run-args.txt"));
		const runEnv = await readFile(join(logDir, "run-env.txt"), "utf-8");

		expect(buildArgs).toEqual([
			"--platform",
			"linux/arm64",
			"--target",
			"dev",
			"-t",
			"rp1-dev",
			"-f",
			"docker/Dockerfile",
			".",
		]);

		expect(runArgs).toContain("--rm");
		expect(runArgs).toContain("--platform");
		expect(runArgs).toContain("linux/arm64");
		expect(runArgs).toContain("-v");
		expect(runArgs).toContain(`${REPO_ROOT}:/src/rp1`);
		expect(runArgs).toContain("rp1-dev-evals-node_modules:/src/rp1/evals/node_modules");
		expect(runArgs).toContain("ANTHROPIC_API_KEY");
		expect(runArgs).toContain("GITHUB_TOKEN");
		expect(runArgs).not.toContain("OPENAI_API_KEY");
		expect(runArgs).toContain("RP1_EVAL_DOCKER=1");
		expect(runArgs).toContain("rp1-dev");
		expect(runArgs).toContain("zsh");
		expect(runArgs).toContain("-lc");
		expect(runArgs).toContain('cd /src/rp1 && just eval-run-local "$@"');
		expect(runArgs).toContain("--");
		expect(runArgs).toContain("rp1-dev/build-fast");
		expect(runArgs).toContain("--harness=opencode");
		expect(runArgs).not.toContain("-p");
		expect(runArgs).not.toContain("17710:7710");

		const gitDir = await getGitRevParse("--git-dir");
		const gitCommonDir = await getGitRevParse("--git-common-dir");
		if (gitDir !== gitCommonDir) {
			expect(runArgs).toContain(`${REPO_ROOT}:${REPO_ROOT}`);
			expect(runArgs).toContain(`${gitCommonDir}:${gitCommonDir}`);
		}

		expect(runEnv).toContain("ANTHROPIC_API_KEY=anthropic-test");
		expect(runEnv).toContain("GITHUB_TOKEN=github-test");
		expect(runEnv).not.toContain("RP1_DB=/tmp/host-rp1.db");
		expect(runEnv).not.toContain("RP1_EVAL_MODE=true");
	});

	test("keeps the interactive debug recipe on host port 17710", async () => {
		const stubRoot = await createTempDir("rp1-docker-dev-recipe-");
		const binDir = join(stubRoot, "bin");
		const logDir = join(stubRoot, "logs");
		const dockerStubPath = join(binDir, "docker");

		await mkdir(binDir, { recursive: true });
		await mkdir(logDir, { recursive: true });
		await writeFile(
			dockerStubPath,
			`#!/usr/bin/env bash
set -euo pipefail
kind="$1"
shift || true
printf '%s\n' "$@" > "\${DOCKER_STUB_LOG_DIR}/\${kind}-args.txt"
`,
			"utf-8",
		);
		await chmod(dockerStubPath, 0o755);

		const result = await runCommand("just", ["start-docker-dev"], {
			cwd: REPO_ROOT,
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH ?? ""}`,
				DOCKER_STUB_LOG_DIR: logDir,
				NO_COLOR: "1",
			},
		});

		expect(result.exitCode).toBe(0);

		const buildArgs = await readArgsFile(join(logDir, "build-args.txt"));
		const runArgs = await readArgsFile(join(logDir, "run-args.txt"));

		expect(buildArgs).toEqual([
			"--platform",
			"linux/arm64",
			"--target",
			"dev",
			"-t",
			"rp1-dev",
			"-f",
			"docker/Dockerfile",
			".",
		]);
		expect(runArgs).toContain("--rm");
		expect(runArgs).toContain("-it");
		expect(runArgs).toContain("-p");
		expect(runArgs).toContain("17710:7710");
		expect(runArgs).toContain(`${REPO_ROOT}:/src/rp1`);
		expect(runArgs).toContain(
			"rp1-dev-evals-node_modules:/src/rp1/evals/node_modules",
		);
		expect(runArgs).toContain("rp1-dev");

		const gitDir = await getGitRevParse("--git-dir");
		const gitCommonDir = await getGitRevParse("--git-common-dir");
		if (gitDir !== gitCommonDir) {
			expect(runArgs).toContain(`${REPO_ROOT}:${REPO_ROOT}`);
			expect(runArgs).toContain(`${gitCommonDir}:${gitCommonDir}`);
		}
	});

	test("keeps eval commits on the host when --commit is requested", async () => {
		const stubRoot = await createTempDir("rp1-docker-host-commit-");
		const binDir = join(stubRoot, "bin");
		const logDir = join(stubRoot, "logs");
		const dockerStubPath = join(binDir, "docker");
		const gitStubPath = join(binDir, "git");
		const gitLogPath = join(logDir, "git.log");

		await mkdir(binDir, { recursive: true });
		await mkdir(logDir, { recursive: true });
		await writeFile(
			dockerStubPath,
			`#!/usr/bin/env bash
set -euo pipefail
kind="$1"
shift || true
printf '%s\n' "$@" > "\${DOCKER_STUB_LOG_DIR}/\${kind}-args.txt"
if [ "$kind" = "run" ]; then
    previous=""
    for arg in "$@"; do
        if [ "$previous" = "-e" ] && [[ "$arg" == RP1_EVAL_PASSED_SUITES_FILE=* ]]; then
            host_relative_path="\${arg#RP1_EVAL_PASSED_SUITES_FILE=/src/rp1/}"
            mkdir -p "$(dirname "$PWD/\${host_relative_path}")"
            printf 'output/rp1-dev-build-fast.json\n' > "$PWD/\${host_relative_path}"
        fi
        previous="$arg"
    done
fi
env | sort > "\${DOCKER_STUB_LOG_DIR}/\${kind}-env.txt"
`,
			"utf-8",
		);
		await writeFile(
			gitStubPath,
			`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "\${GIT_STUB_LOG}"
if [ "$1" = "-C" ]; then
    shift 2
fi
case "$1" in
    rev-parse)
        case "$2" in
            --is-inside-work-tree)
                echo true
                ;;
            --git-dir|--git-common-dir)
                echo .git
                ;;
        esac
        ;;
    add)
        ;;
    diff)
        exit 1
        ;;
    commit)
        ;;
esac
`,
			"utf-8",
		);
		await chmod(dockerStubPath, 0o755);
		await chmod(gitStubPath, 0o755);

		const result = await runCommand(
			"bash",
			[EVAL_LAUNCHER_PATH, "rp1-dev/build-fast", "--attest", "--commit"],
			{
				cwd: REPO_ROOT,
				env: {
					...process.env,
					PATH: `${binDir}:${process.env.PATH ?? ""}`,
					DOCKER_STUB_LOG_DIR: logDir,
					GIT_STUB_LOG: gitLogPath,
				},
			},
		);

		expect(result.exitCode).toBe(0);

		const runArgs = await readArgsFile(join(logDir, "run-args.txt"));
		const gitLog = await readFile(gitLogPath, "utf-8");

		expect(runArgs).toContain("--attest");
		expect(runArgs).not.toContain("--commit");
		expect(runArgs.some((arg) =>
			arg.startsWith("RP1_EVAL_PASSED_SUITES_FILE=/src/rp1/.rp1/tmp/eval-run-outputs."),
		)).toBe(true);

		expect(gitLog).toContain(`-C ${REPO_ROOT} add evals/attestation.json`);
		expect(gitLog).toContain(
			`-C ${REPO_ROOT} add evals/output/rp1-dev-build-fast.json`,
		);
		expect(gitLog).toContain(`-C ${REPO_ROOT} commit -m`);
	});
});
