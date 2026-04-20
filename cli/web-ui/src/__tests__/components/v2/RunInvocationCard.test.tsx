import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { RunInvocationContext } from "@/types/runs";
import { RunInvocationCard } from "../../../components/v2/RunInvocationCard";

const baseInvocation: RunInvocationContext = {
	workflowName: "build",
	runPolicy: "resumable",
	decision: "matched_non_terminal_run",
	projectIdentity: "project-1",
	canonicalProjectRoot: "/repo",
	requestedProjectRoot: "/repo/worktrees/feature",
	isWorktree: true,
	worktreeName: "feature",
	workIdentity: "FEATURE_ID=feat-ui",
	identityValues: { FEATURE_ID: "feat-ui" },
	harness: "codex",
	arguments: {
		FEATURE_ID: "feat-ui",
		AFK: true,
		API_TOKEN: "[redacted]",
	},
};

afterEach(() => {
	cleanup();
});

describe("RunInvocationCard", () => {
	test("renders the invocation details when context exists", () => {
		render(createElement(RunInvocationCard, { invocation: baseInvocation }));

		expect(screen.getByText("Invocation")).toBeTruthy();
		expect(screen.getByText("build")).toBeTruthy();
		expect(screen.getByText("Resumable")).toBeTruthy();
		expect(screen.getByText("Resumed existing run")).toBeTruthy();
		expect(screen.getByText("/repo")).toBeTruthy();
		expect(screen.getByText("/repo/worktrees/feature")).toBeTruthy();
		expect(screen.getByText("Linked worktree (feature)")).toBeTruthy();
		expect(screen.getByText("FEATURE_ID=feat-ui")).toBeTruthy();

		expect(screen.getByText("Arguments")).toBeTruthy();
		expect(screen.getByText("FEATURE_ID")).toBeTruthy();
		expect(screen.getByText("feat-ui")).toBeTruthy();
		expect(screen.getByText("AFK")).toBeTruthy();
		expect(screen.getByText("true")).toBeTruthy();
		expect(screen.getByText("API_TOKEN")).toBeTruthy();
		expect(screen.getByText("[redacted]")).toBeTruthy();
	});

	test("omits the invocation card when no context exists", () => {
		render(createElement(RunInvocationCard, { invocation: undefined }));

		expect(screen.queryByText("Invocation")).toBeNull();
	});

	test("omits the arguments section when arguments is undefined", () => {
		const { arguments: _, ...noArgs } = baseInvocation;
		render(createElement(RunInvocationCard, { invocation: noArgs }));

		expect(screen.getByText("Invocation")).toBeTruthy();
		expect(screen.queryByText("Arguments")).toBeNull();
	});
});
