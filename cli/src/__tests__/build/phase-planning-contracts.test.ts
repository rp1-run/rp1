import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

const stripTemplateRoutingFrontmatter = (content: string): string =>
	content.replace(FRONTMATTER_REGEX, "");

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractPhaseSection = (
	phasePlan: string,
	phaseId: string,
): { readonly phaseTitle: string; readonly phaseBody: string } => {
	const match = phasePlan.match(
		new RegExp(
			`### ${escapeRegex(phaseId)}: (.+?)\\n([\\s\\S]*?)(?=\\n### P\\d+: |\\n## Delivery Mapping|\\n## Traceability|$)`,
		),
	);
	if (!match) {
		throw new Error(`Missing phase section for ${phaseId}`);
	}

	return {
		phaseTitle: match[1].trim(),
		phaseBody: match[2].trim(),
	};
};

const extractTableBlock = (content: string, heading: string): string => {
	const match = content.match(
		new RegExp(`${escapeRegex(heading)}\\n\\n((?:\\|.*\\n)+)`),
	);
	if (!match) {
		throw new Error(`Missing markdown table after ${heading}`);
	}

	return match[1].trim();
};

const parseMarkdownTableRows = (tableBlock: string): string[][] =>
	tableBlock
		.split(/\r?\n/)
		.slice(2)
		.filter((line) => line.startsWith("|"))
		.map((line) =>
			line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim().replace(/^`|`$/g, "")),
		);

interface PlanningTraceabilityContext {
	readonly normalizedPhasePlanPath: string;
	readonly sourceTitle: string;
	readonly sourcePath: string;
	readonly phaseId: string;
	readonly phaseTitle: string;
	readonly manualVerificationExpected: string;
	readonly recommendedNextStep: string;
}

const resolvePlanningTraceabilityContext = (params: {
	readonly featureId: string;
	readonly phaseId: string;
	readonly phasePlanPath: string;
	readonly phasePlan: string;
}): PlanningTraceabilityContext => {
	const normalizedPhasePlanPath = params.phasePlanPath.replace(
		/^\.rp1\/work\//,
		"",
	);
	const sourceTitle = params.phasePlan.match(/\*\*Source Title\*\*: (.+)/)?.[1];
	const sourcePath = params.phasePlan.match(
		/\*\*Source Path\*\*: `([^`]+)`/,
	)?.[1];
	if (!sourceTitle || !sourcePath) {
		throw new Error("Missing source title or path in phase plan");
	}

	const { phaseTitle, phaseBody } = extractPhaseSection(
		params.phasePlan,
		params.phaseId,
	);
	const manualVerificationExpected = phaseBody.match(
		/\*\*Manual Verification Expected\*\*: (.+)/,
	)?.[1];
	if (!manualVerificationExpected) {
		throw new Error(
			`Missing manual verification expectation for ${params.phaseId}`,
		);
	}

	const childHandoffRows = parseMarkdownTableRows(
		extractTableBlock(phaseBody, "**Child Feature Handoff**:"),
	);
	const childHandoffRow = childHandoffRows.find(
		([type, id]) => type === "feature" && id === params.featureId,
	);

	const deliveryMappingRows = parseMarkdownTableRows(
		extractTableBlock(params.phasePlan, "## Delivery Mapping"),
	);
	const deliveryMappingRow = deliveryMappingRows.find(
		([phaseId]) => phaseId === params.phaseId,
	);

	const recommendedNextStep =
		childHandoffRow?.[4] ?? deliveryMappingRow?.[2] ?? null;
	if (!recommendedNextStep) {
		throw new Error(`Missing recommended next step for ${params.phaseId}`);
	}

	return {
		normalizedPhasePlanPath,
		sourceTitle: sourceTitle.trim(),
		sourcePath: sourcePath.trim(),
		phaseId: params.phaseId,
		phaseTitle,
		manualVerificationExpected: manualVerificationExpected.trim(),
		recommendedNextStep,
	};
};

const renderRequirementsWithTraceability = (params: {
	readonly featureId: string;
	readonly featureTitle: string;
	readonly runId: string;
	readonly date: string;
	readonly parentPrdName: string;
	readonly parentPrdPath: string;
	readonly template: string;
	readonly traceability: PlanningTraceabilityContext;
}): string => {
	let rendered = stripTemplateRoutingFrontmatter(params.template);
	const replacements = [
		["[Feature Title]", params.featureTitle],
		["{RUN_ID}", params.runId],
		["{FEATURE_ID}", params.featureId],
		["{Date}", params.date],
		[
			"[PRD Name](../../prds/prd-name.md) _(if associated)_",
			`[${params.parentPrdName}](${params.parentPrdPath})`,
		],
		["{PLANNING_SOURCE_TITLE}", params.traceability.sourceTitle],
		["{PLANNING_SOURCE_PATH}", params.traceability.sourcePath],
		["{PHASE_ID}", params.traceability.phaseId],
		["{PHASE_TITLE}", params.traceability.phaseTitle],
		[
			"{PHASE_MANUAL_VERIFICATION_EXPECTED}",
			params.traceability.manualVerificationExpected,
		],
		["{PHASE_RECOMMENDED_NEXT_STEP}", params.traceability.recommendedNextStep],
	] as const;

	for (const [placeholder, value] of replacements) {
		rendered = rendered.replaceAll(placeholder, value);
	}

	return rendered;
};

describe("phase planning prompt contracts", () => {
	test("build preserves phase-plan redirect and child-feature traceability inputs", async () => {
		const buildSkill = await readProjectFile(
			"plugins/dev/skills/build/SKILL.md",
		);
		const featureArchitect = await readProjectFile(
			"plugins/dev/agents/feature-architect.md",
		);
		const requirementGatherer = await readProjectFile(
			"plugins/dev/agents/feature-requirement-gatherer.md",
		);

		expect(buildSkill).toContain("- name: PHASE_PLAN_PATH");
		expect(buildSkill).toContain("- name: PHASE_ID");
		expect(buildSkill).toContain(
			"FEATURE_ID={FEATURE_ID}, REQUIREMENTS={REQUIREMENTS}, AFK={AFK}, PHASE_PLAN_PATH={PHASE_PLAN_PATH}, PHASE_ID={PHASE_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, WORKFLOW=build, RUN_ID={RUN_ID}",
		);
		expect(buildSkill).toContain('status = "needs_phase_planning"');
		expect(buildSkill).toContain("do NOT run `hypothesis-tester`");
		expect(buildSkill).toContain(
			"Scope exceeds a single feature. Run /phase-plan before resuming delivery.",
		);
		expect(featureArchitect).toContain(
			"Do NOT trigger phase planning from routing provenance alone.",
		);
		expect(featureArchitect).toContain(
			"If the requirements already contain resolved child-phase provenance",
		);
		expect(requirementGatherer).toContain(
			"Keep `## Planning Traceability` strictly as provenance metadata for the current child feature.",
		);
	});

	test("build-fast keeps initiative-sized work on the phase-plan path", async () => {
		const buildFastSkill = await readProjectFile(
			"plugins/dev/skills/build-fast/SKILL.md",
		);
		const planner = await readProjectFile(
			"plugins/dev/agents/build-fast-planner.md",
		);

		expect(buildFastSkill).toContain('`redirect_target = "phase-plan"`');
		expect(buildFastSkill).toContain(
			"Treat `/phase-plan` as the supported next step",
		);
		expect(planner).toContain('"redirect_target": "phase-plan" | "build"');
		expect(planner).toContain(
			"completed PRD or oversized `requirements.md` artifact as its source",
		);
	});

	test("phase-plan treats ambiguous source resolution as terminal error guidance", async () => {
		const phasePlanner = await readProjectFile(
			"plugins/dev/agents/phase-planner.md",
		);
		const phasePlanSkill = await readProjectFile(
			"plugins/dev/skills/phase-plan/SKILL.md",
		);

		expect(phasePlanner).toContain(
			"`AFK_MODE=false`: do NOT ask a follow-up question.",
		);
		expect(phasePlanner).toContain("candidate_paths");
		expect(phasePlanner).toContain(
			"return an error JSON object with `candidate_paths` and rerun guidance instead of prompting.",
		);
		expect(phasePlanSkill).toContain(
			"This workflow is single-pass. It does not emit `waiting_for_user` for source ambiguity.",
		);
		expect(phasePlanSkill).toContain(
			'For `status="error"` responses, treat this as a terminal workflow result, not an interactive pause.',
		);
		expect(phasePlanSkill).toContain("## Phase Plan Failed");
		expect(phasePlanSkill).toContain(
			"Re-run `/phase-plan` with one explicit source path from the list above.",
		);
	});

	test("phase-plan template keeps durable handoff fields", async () => {
		const phasePlanTemplate = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/phase-planner/phase-plan.md",
		);

		expect(phasePlanTemplate).toContain("## Phase Summary");
		expect(phasePlanTemplate).toContain("## Phase Details");
		expect(phasePlanTemplate).toContain("## Delivery Mapping");
		expect(phasePlanTemplate).toContain("## Traceability");
		expect(phasePlanTemplate).toContain("Manual Verification Expected");
		expect(phasePlanTemplate).toContain("Manual Checks");
		expect(phasePlanTemplate).toContain(
			"PHASE_PLAN_PATH={PHASE_PLAN_DIR}/{PHASE_PLAN_FILENAME} PHASE_ID=P1",
		);
		expect(phasePlanTemplate).toContain("| P{N} |");
		expect(phasePlanTemplate).toContain("### P{N}: [Phase Title]");
		expect(phasePlanTemplate).toContain("PHASE_ID=P{N}");
		expect(phasePlanTemplate).toContain(
			"Repeat the `P{N}` section once per additional phase (`P3`, `P4`, ...).",
		);
	});

	test("build treats task and requirements status error payloads as blocking failures", async () => {
		const buildSkill = await readProjectFile(
			"plugins/dev/skills/build/SKILL.md",
		);

		expect(buildSkill).toContain(
			'If the response is valid JSON with `"status": "error"`, treat it as an intentional requirements-step failure.',
		);
		expect(buildSkill).toContain(
			"abort the build on `requirements`, and do NOT retry it as a generic contract failure",
		);
		expect(buildSkill).toContain(
			"Validate the `feature-tasker` response before the design checkpoint:",
		);
		expect(buildSkill).toContain(
			"abort the build on `design`, and do NOT continue to §STEP-3, build, verify, or archive.",
		);
		expect(buildSkill).toContain(
			"abort the build on `tasks`, and do NOT continue to §STEP-4.",
		);
		expect(buildSkill).toContain(
			"Do not infer success from prior design-step task generation.",
		);
	});

	test("phase handoff inputs render planning traceability into requirements", async () => {
		const featureRequirementGatherer = await readProjectFile(
			"plugins/dev/agents/feature-requirement-gatherer.md",
		);
		const requirementsTemplate = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/feature-requirement-gatherer/requirements.md",
		);
		const phasePlan = `---
source_path: .rp1/work/prds/auth-overhaul.md
source_kind: prd
phase_count: 2
plan_status: draft
---
# Delivery Phase Plan: Auth Overhaul

**Source Title**: Auth Overhaul
**Source Path**: \`.rp1/work/prds/auth-overhaul.md\`
**Source Kind**: prd
**Plan Status**: draft
**Phase Count**: 2
**Generated**: 2026-04-15

## Overview
Phase the auth overhaul so delivery can progress through stable rollout slices.

## Phase Summary

| Phase ID | Phase | Value Delivered / Risk Retired | Exit Criteria | Manual Verification Expected |
|----------|-------|--------------------------------|---------------|------------------------------|
| P1 | Foundation Cleanup | Reduce migration risk before rollout | Config cleanup complete | No |
| P2 | Rollout Hardening | Make rollout telemetry and safeguards durable | Rollout alarms remain stable | Yes |

## Phase Details

### P1: Foundation Cleanup
**Value Delivered / Risk Retired**: Reduce migration risk before rollout

**Included Now**:
- Clean up config drift

**Deferred Scope**:
- Rollout monitoring

**Exit Criteria**:
- Config cleanup complete

**Manual Verification Expected**: No

**Manual Checks**:
- None

**Child Feature Handoff**:

| Type | ID | Title | Scope | Recommended Next Step |
|------|----|-------|-------|-----------------------|
| feature | auth-foundation-cleanup | Foundation Cleanup | Normalize auth config | \`/build auth-foundation-cleanup "Normalize auth config" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P1\` |

### P2: Rollout Hardening
**Value Delivered / Risk Retired**: Make rollout telemetry and safeguards durable

**Included Now**:
- Add telemetry for session expiry rollout

**Deferred Scope**:
- Follow-up dashboard polish

**Exit Criteria**:
- Rollout alarms remain stable

**Manual Verification Expected**: Yes

**Manual Checks**:
- Verify staged rollout alarms stay green

**Child Feature Handoff**:

| Type | ID | Title | Scope | Recommended Next Step |
|------|----|-------|-------|-----------------------|
| feature | auth-session-hardening | Session Hardening | Add session expiry telemetry and rollout guards | \`/build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2\` |

## Delivery Mapping

| Phase ID | Child ID | Recommended Command | Notes |
|----------|----------|---------------------|-------|
| P1 | auth-foundation-cleanup | \`/build auth-foundation-cleanup "Normalize auth config" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P1\` | Foundation cleanup comes first |
| P2 | auth-session-hardening | \`/build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2\` | Keep rollout safeguards tied to the phase handoff |

## Traceability

| Item | Value |
|------|-------|
| Source Title | Auth Overhaul |
| Source Path | \`.rp1/work/prds/auth-overhaul.md\` |
| Phase Plan Path | \`prds/auth-overhaul-phase-plan.md\` |
| Stable Phase IDs | P1, P2 |
`;

		expect(featureRequirementGatherer).toContain(
			"prefer the child handoff row whose `ID` matches `{FEATURE_ID}`",
		);
		expect(featureRequirementGatherer).toContain(
			"When phase context is resolved, add `## Planning Traceability`",
		);
		expect(requirementsTemplate).toContain("## Planning Traceability");

		const traceability = resolvePlanningTraceabilityContext({
			featureId: "auth-session-hardening",
			phaseId: "P2",
			phasePlanPath: ".rp1/work/prds/auth-overhaul-phase-plan.md",
			phasePlan,
		});
		const renderedRequirements = renderRequirementsWithTraceability({
			featureId: "auth-session-hardening",
			featureTitle: "Auth Session Hardening",
			runId: "run-phase-traceability",
			date: "2026-04-15",
			parentPrdName: "Auth Overhaul",
			parentPrdPath: "../../prds/auth-overhaul.md",
			template: requirementsTemplate,
			traceability,
		});

		expect(traceability.normalizedPhasePlanPath).toBe(
			"prds/auth-overhaul-phase-plan.md",
		);
		expect(renderedRequirements).toContain("## Planning Traceability");
		expect(renderedRequirements).toContain(
			"| Source Artifact Title | Auth Overhaul |",
		);
		expect(renderedRequirements).toContain(
			"| Source Artifact Path | `.rp1/work/prds/auth-overhaul.md` |",
		);
		expect(renderedRequirements).toContain("| Parent Phase ID | P2 |");
		expect(renderedRequirements).toContain(
			"| Parent Phase Title | Rollout Hardening |",
		);
		expect(renderedRequirements).toContain(
			"| Manual Verification Expected | Yes |",
		);
		expect(renderedRequirements).toContain(
			'| Recommended Next Step | `/build auth-session-hardening "Add session expiry telemetry" PHASE_PLAN_PATH=prds/auth-overhaul-phase-plan.md PHASE_ID=P2` |',
		);
		expect(renderedRequirements).not.toContain("{PHASE_ID}");
		expect(renderedRequirements).not.toContain("{PHASE_TITLE}");
		expect(renderedRequirements).not.toContain(
			"{PHASE_MANUAL_VERIFICATION_EXPECTED}",
		);
		expect(renderedRequirements).not.toContain("{PHASE_RECOMMENDED_NEXT_STEP}");
	});

	test("legacy task readers remain tolerant of milestone artifacts", async () => {
		const taskBuilder = await readProjectFile(
			"plugins/dev/agents/task-builder.md",
		);
		const taskReviewer = await readProjectFile(
			"plugins/dev/agents/task-reviewer.md",
		);

		expect(taskBuilder).toContain("milestone-{N}.md");
		expect(taskBuilder).toContain(
			"If all `TASK_IDS` match the same `T{N}.{M}` root",
		);
		expect(taskReviewer).toContain("milestone-{N}.md");
		expect(taskReviewer).toContain(
			"If all `TASK_IDS` match the same `T{N}.{M}` root",
		);
	});
});
