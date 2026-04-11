import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
};

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
	});

	test("omits the invocation card when no context exists", () => {
		render(createElement(RunInvocationCard, { invocation: undefined }));

		expect(screen.queryByText("Invocation")).toBeNull();
	});
});
