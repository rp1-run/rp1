import {
	GEMINI_EXTENSION_DISPLAY_DIR,
	GEMINI_EXTENSION_NAME,
	GEMINI_EXTENSION_RELATIVE_DIR,
} from "./smoke-command.js";

export const GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/gemini-extension.json`;

export const GEMINI_EXTENSION_MANIFEST_DISPLAY_PATH = `${GEMINI_EXTENSION_DISPLAY_DIR}/gemini-extension.json`;

export const GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/commands/rp1/subagents.toml`;

export const GEMINI_SUBAGENT_COMMAND_DISPLAY_PATH = `${GEMINI_EXTENSION_DISPLAY_DIR}/commands/rp1/subagents.toml`;

export const GEMINI_SUBAGENT_COMMAND_INVOCATION =
	"/rp1:subagents FEATURE_ID=<feature-id> RUN_CONTEXT=<label>";

export const GEMINI_ALPHA_AGENT_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/agents/rp1-alpha.md`;

export const GEMINI_BETA_AGENT_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/agents/rp1-beta.md`;

export const GEMINI_RUNTIME_FAIL_AGENT_NAME = "rp1-runtime-fail";

export const GEMINI_RUNTIME_FAIL_AGENT_MODEL =
	"gemini-rp1-intentional-invalid-model";

export const GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH = `${GEMINI_EXTENSION_RELATIVE_DIR}/agents/${GEMINI_RUNTIME_FAIL_AGENT_NAME}.md`;

export const GEMINI_EXTENSION_MANIFEST_JSON = `${JSON.stringify(
	{
		name: GEMINI_EXTENSION_NAME,
		version: "1.0.0",
		description:
			"Experimental rp1 Gemini smoke, P2 delegation, and P3 boundary validation assets.",
	},
	null,
	2,
)}\n`;

export const GEMINI_SUBAGENT_COMMAND_TOML = `description = "Experimental rp1 P2 subagent fanout validation for Gemini CLI."
prompt = '''
# rp1 Gemini Subagent Fanout Validation

Run this experimental validation only for Gemini P2 readiness evidence. Do not run full rp1 workflows or claim first-class Gemini support from this command.

Arguments: {{args}}

Use the extension-packaged validation agents installed by rp1. If Gemini says an agent is not found, disabled, blocked by trust or approval, or requires the project-level "New Agents Discovered" acknowledgement flow, stop and report:

Gemini subagent validation: blocked
Reason: rp1 extension-packaged validation agents could not be invoked.
User action: Run rp1 install gemini, restart Gemini CLI, make sure extension rp1-phase2-validation is enabled, and complete Gemini acknowledgement only if Gemini prompts for project-level agents.

Validation steps:
1. Invoke @rp1-alpha and ask it for its marker.
2. Invoke @rp1-beta and ask it for its marker.
3. Invoke @rp1-runtime-fail. This delegated unit is intentionally configured to fail at runtime; preserve the failure status and error text surfaced by Gemini.
4. Return only compact JSON with fields: alpha_agent, alpha_output, beta_agent, beta_output, failing_agent, failing_status, failing_error, overall_status.

The expected markers are:
- ALPHA_MARKER_FROM_rp1-alpha
- BETA_MARKER_FROM_rp1-beta

The intentional delegated failure is expected as:
- failing_agent: rp1-runtime-fail
- failing_status: failed
'''
`;

export const GEMINI_ALPHA_AGENT_MARKDOWN = `---
name: rp1-alpha
description: Return the alpha validation marker.
kind: local
tools: []
model: inherit
max_turns: 3
---
Return exactly: ALPHA_MARKER_FROM_rp1-alpha
`;

export const GEMINI_BETA_AGENT_MARKDOWN = `---
name: rp1-beta
description: Return the beta validation marker.
kind: local
tools: []
model: inherit
max_turns: 3
---
Return exactly: BETA_MARKER_FROM_rp1-beta
`;

export const GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN = `---
name: ${GEMINI_RUNTIME_FAIL_AGENT_NAME}
description: Intentionally fail at runtime for rp1 Gemini delegated failure validation.
kind: local
tools: []
model: ${GEMINI_RUNTIME_FAIL_AGENT_MODEL}
max_turns: 1
---
This validation agent is intentionally configured with an invalid model so Gemini reports a delegated runtime failure to the parent.
`;

export const GEMINI_FAIL_AGENT_RELATIVE_PATH =
	GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH;

export const GEMINI_FAIL_AGENT_MARKDOWN = GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN;
