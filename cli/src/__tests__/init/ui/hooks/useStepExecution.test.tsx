/**
 * Tests for the wizard's directory/settings step executors.
 *
 * Guards the wizard/headless parity for central-mode init: directory-setup
 * must create only the minimal .rp1/ + project_id, and settings-setup must
 * create the storage directories AFTER settings.toml exists so the storage
 * mode is honored (mirroring the headless three-phase flow in executeInit).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { useEffect } from "react";
import type { InitOptions } from "../../../../init/models.js";
import {
	type StepExecutor,
	useStepExecution,
} from "../../../../init/ui/hooks/useStepExecution.js";
import { useWizardState } from "../../../../init/ui/hooks/useWizardState.js";
import { cleanupTempDir, createTempDir } from "../../../helpers/index.js";

interface HarnessProps {
	readonly options: InitOptions;
	readonly onReady: (executor: StepExecutor) => void;
}

const Harness: React.FC<HarnessProps> = ({ options, onReady }) => {
	const [state, dispatch] = useWizardState();
	const executor = useStepExecution({ state, dispatch, options });

	useEffect(() => {
		onReady(executor);
	}, [executor, onReady]);

	return <Text>harness</Text>;
};

async function mountExecutor(options: InitOptions): Promise<StepExecutor> {
	let executor: StepExecutor | undefined;
	render(<Harness options={options} onReady={(e) => (executor = e)} />);

	for (let i = 0; i < 50 && executor === undefined; i++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	if (executor === undefined) {
		throw new Error("Harness never provided a step executor");
	}
	return executor;
}

function readProjectId(projectRoot: string): string {
	return readFileSync(join(projectRoot, ".rp1", "project_id"), "utf-8").trim();
}

describe("wizard directory-setup and settings-setup steps", () => {
	let tempDir: string;
	let centralProjectDir: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("wizard-step-exec-");
		centralProjectDir = undefined;
	});

	afterEach(async () => {
		// The wizard resolves the real home directory for central storage, so
		// remove the central store entry created for this test's project id.
		if (centralProjectDir !== undefined) {
			await rm(centralProjectDir, { recursive: true, force: true });
		}
		await cleanupTempDir(tempDir);
	});

	test("directory-setup creates only minimal .rp1/ + project_id; settings-setup creates central storage dirs", async () => {
		const executor = await mountExecutor({ cwd: tempDir });

		await executor("directory-setup");

		expect(existsSync(join(tempDir, ".rp1"))).toBe(true);
		expect(existsSync(join(tempDir, ".rp1", "project_id"))).toBe(true);
		// Storage directories must NOT be created before settings.toml exists —
		// their location depends on the storage mode written there.
		expect(existsSync(join(tempDir, ".rp1", "context"))).toBe(false);
		expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(false);

		await executor("settings-setup");

		const settingsPath = join(tempDir, ".rp1", "settings.toml");
		expect(existsSync(settingsPath)).toBe(true);
		const settings = readFileSync(settingsPath, "utf-8");
		expect(settings).toContain('mode = "central"');

		// Central mode: storage lives under ~/.rp1/projects/<id>/, not the repo.
		const projectId = readProjectId(tempDir);
		centralProjectDir = join(homedir(), ".rp1", "projects", projectId);
		expect(existsSync(join(centralProjectDir, "context"))).toBe(true);
		expect(existsSync(join(centralProjectDir, "work"))).toBe(true);
		expect(existsSync(join(tempDir, ".rp1", "context"))).toBe(false);
		expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(false);
	});

	test("settings-setup honors an existing local-mode settings.toml", async () => {
		const executor = await mountExecutor({ cwd: tempDir });

		await executor("directory-setup");

		const settingsPath = join(tempDir, ".rp1", "settings.toml");
		await Bun.write(settingsPath, '[storage]\nmode = "local"\n');

		await executor("settings-setup");

		// Existing settings are preserved and local-mode dirs are created in-repo.
		expect(readFileSync(settingsPath, "utf-8")).toContain('mode = "local"');
		expect(existsSync(join(tempDir, ".rp1", "context"))).toBe(true);
		expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(true);

		const projectId = readProjectId(tempDir);
		expect(existsSync(join(homedir(), ".rp1", "projects", projectId))).toBe(
			false,
		);
	});

	test("keeps wizard central-mode settings, storage, and instruction writes below the supplied home", async () => {
		const isolatedHome = join(tempDir, "home");
		const globalSettingsPath = join(
			isolatedHome,
			".config",
			"rp1",
			"settings.toml",
		);
		await mkdir(join(isolatedHome, ".config", "rp1"), { recursive: true });
		await Bun.write(globalSettingsPath, '[storage]\nmode = "central"\n');
		const executor = await mountExecutor({
			cwd: tempDir,
			homeDir: isolatedHome,
			globalSettingsPath,
		});

		await executor("directory-setup");
		await Bun.write(
			join(tempDir, ".rp1", "settings.toml"),
			"[arguments.build]\nAFK = false\n",
		);
		await executor("settings-setup");

		const projectId = readProjectId(tempDir);
		const centralProjectDir = join(isolatedHome, ".rp1", "projects", projectId);
		expect(existsSync(globalSettingsPath)).toBe(true);
		expect(existsSync(join(centralProjectDir, "context"))).toBe(true);
		expect(existsSync(join(centralProjectDir, "work"))).toBe(true);

		await Bun.write(
			globalSettingsPath,
			'[storage]\nmode = "central"\n\n[harnesses]\nenabled = ["claude-code", "codex"]\n',
		);
		await executor("instruction-injection");

		expect(existsSync(join(isolatedHome, ".claude", "CLAUDE.md"))).toBe(true);
		expect(existsSync(join(isolatedHome, ".codex", "AGENTS.md"))).toBe(true);
	});
});
