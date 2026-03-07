/**
 * Custom Promptfoo provider that wraps @opencode-ai/sdk (v2)
 * and captures ToolPart entries from session responses.
 *
 * Exposes tool calls via metadata for assertion inspection,
 * matching the same format as claude-with-tools.ts.
 *
 * Runs a background auto-responder that handles:
 * - Permission requests (auto-approve with "always")
 * - Question requests (auto-select first option, like claude-with-tools)
 */

import {
	createOpencode,
	type OpencodeClient,
	type Part,
	type StepFinishPart,
	type TextPart,
	type ToolPart,
} from "@opencode-ai/sdk/v2";

// Canonical tool name mapping (inlined to avoid cross-module TS import issues with Node.js runtime)
// Source of truth: suites/shared/tool-names.ts
type CanonicalTool =
	| "shell"
	| "read"
	| "write"
	| "edit"
	| "ask_user"
	| "subagent"
	| "skill";
const CANONICAL_MAP: Record<string, CanonicalTool> = {
	Bash: "shell",
	Read: "read",
	Write: "write",
	Edit: "edit",
	AskUserQuestion: "ask_user",
	Agent: "subagent",
	Task: "subagent",
	Skill: "skill",
	bash: "shell",
	read: "read",
	write: "write",
	edit: "edit",
	question: "ask_user",
	task: "subagent",
	skill: "skill",
	"functions.exec_command": "shell",
	"functions.apply_patch": "edit",
	"functions.request_user_input": "ask_user",
};
function toCanonical(rawName: string): CanonicalTool | undefined {
	return CANONICAL_MAP[rawName];
}

/**
 * Recursively collect parts from a session and all its child sessions.
 * OpenCode spawns child sessions for subagents (task tool), so we must
 * traverse the session tree to capture all tool calls.
 */
async function collectAllParts(
	client: OpencodeClient,
	sessionId: string,
	directory: string,
): Promise<Part[]> {
	const parts: Part[] = [];

	const messagesResult = await client.session.messages({
		sessionID: sessionId,
		directory,
	});

	if (messagesResult.data) {
		// Only collect parts from assistant messages.
		// User messages contain the echoed prompt text which pollutes the output.
		for (const msg of messagesResult.data) {
			if (msg.info.role === "assistant") {
				parts.push(...msg.parts);
			}
		}
	}

	const childrenResult = await client.session.children({
		sessionID: sessionId,
		directory,
	});

	if (childrenResult.data && childrenResult.data.length > 0) {
		for (const child of childrenResult.data) {
			const childParts = await collectAllParts(client, child.id, directory);
			parts.push(...childParts);
		}
	}

	return parts;
}

/**
 * Poll for pending permission and question requests and auto-respond.
 * Mirrors claude-with-tools.ts AskUserQuestion behavior (first_option).
 */
async function runAutoResponder(
	client: OpencodeClient,
	directory: string,
	signal: AbortSignal,
): Promise<void> {
	while (!signal.aborted) {
		try {
			// Auto-approve pending permissions
			const permissions = await client.permission.list({ directory });
			if (permissions.data) {
				for (const perm of permissions.data) {
					await client.permission.reply({
						requestID: perm.id,
						directory,
						reply: "always",
					});
				}
			}

			// Auto-answer pending questions (select first option)
			const questions = await client.question.list({ directory });
			if (questions.data) {
				for (const q of questions.data) {
					const answers = q.questions.map((qi) => {
						if (qi.options.length > 0) {
							return [qi.options[0].label];
						}
						return [];
					});
					await client.question.reply({
						requestID: q.id,
						directory,
						answers,
					});
				}
			}
		} catch {
			// Ignore errors during polling (server may be shutting down)
		}

		// Poll interval
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 500);
			signal.addEventListener("abort", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
}

interface ToolCall {
	readonly id: string;
	readonly name: string;
	readonly canonical?: CanonicalTool;
	readonly input: unknown;
	readonly source: "opencode";
}

interface ProviderMetadata {
	readonly toolCalls: readonly ToolCall[];
	readonly bashCommands: readonly string[];
	readonly toolCallCount: number;
}

interface ProviderOptions {
	readonly config?: ProviderConfig;
	readonly id?: string;
}

interface ProviderConfig {
	readonly provider_id?: string;
	readonly model_id?: string;
	readonly working_dir?: string;
	readonly max_turns?: number;
	readonly context_limit?: number;
	readonly output_limit?: number;
	readonly opencode_port?: number;
	readonly opencode_timeout?: number;
	readonly permission?: Record<string, unknown>;
	readonly tools?: { readonly [key: string]: boolean };
	readonly [key: string]: unknown;
}

interface ProviderContext {
	readonly vars?: Record<string, string>;
	readonly prompt?: {
		readonly raw?: string;
		readonly label?: string;
	};
}

interface CallApiOptions {
	readonly includeLogProbs?: boolean;
	readonly originalProvider?: unknown;
}

interface ProviderResponse {
	readonly output: string;
	readonly tokenUsage?: {
		readonly prompt?: number;
		readonly completion?: number;
		readonly total?: number;
	};
	readonly cost?: number;
	readonly metadata?: ProviderMetadata;
	readonly error?: string;
}

function isToolPart(part: Part): part is ToolPart {
	return part.type === "tool";
}

function isTextPart(part: Part): part is TextPart {
	return part.type === "text";
}

function isStepFinishPart(part: Part): part is StepFinishPart {
	return part.type === "step-finish";
}

export default class OpenCodeWithToolCapture {
	private readonly config: ProviderConfig;

	constructor(options: ProviderOptions) {
		this.config = options.config ?? {};
	}

	id(): string {
		return "opencode-with-tools";
	}

	async callApi(
		prompt: string,
		providerContext: ProviderContext,
		_options: CallApiOptions,
	): Promise<ProviderResponse> {
		const providerID =
			this.config.provider_id ?? process.env.OPENCODE_PROVIDER_ID;
		const modelID = this.config.model_id ?? process.env.OPENCODE_MODEL_ID;

		if (!providerID || !modelID) {
			return {
				output: "",
				error:
					"Missing provider_id/model_id. Set via provider config or OPENCODE_PROVIDER_ID/OPENCODE_MODEL_ID env vars.",
				metadata: { toolCalls: [], bashCommands: [], toolCallCount: 0 },
			};
		}

		const workingDir =
			providerContext.vars?.WORKSPACE_DIR ?? this.config.working_dir;

		const port =
			this.config.opencode_port ?? Math.floor(Math.random() * 10000) + 10000;
		const timeout = this.config.opencode_timeout ?? 30000;

		let server: { url: string; close(): void } | undefined;
		const autoResponderAbort = new AbortController();

		try {
			const opencode = await createOpencode({
				port,
				timeout,
				config: {
					provider: {
						[providerID]: {
							models: {
								[modelID]: {
									...(this.config.context_limit || this.config.output_limit
										? {
												limit: {
													context: this.config.context_limit ?? 128000,
													output: this.config.output_limit ?? 16000,
												},
											}
										: {}),
								},
							},
						},
					},
					permission: (this.config.permission as Record<
						string,
						"allow" | "ask" | "deny"
					>) ?? { "*": "allow" },
				},
			});

			server = opencode.server;
			const client = opencode.client;

			if (!workingDir) {
				return {
					output: "",
					error:
						"No working directory specified (WORKSPACE_DIR or working_dir config)",
					metadata: { toolCalls: [], bashCommands: [], toolCallCount: 0 },
				};
			}

			const sessionResult = await client.session.create({
				directory: workingDir,
			});

			if (!sessionResult.data) {
				return {
					output: "",
					error: `Failed to create session: ${JSON.stringify(sessionResult.error)}`,
					metadata: { toolCalls: [], bashCommands: [], toolCallCount: 0 },
				};
			}

			const sessionId = sessionResult.data.id;

			// Start auto-responder for permissions and questions in background
			runAutoResponder(client, workingDir, autoResponderAbort.signal);

			// Send prompt and wait for completion
			const promptResult = await client.session.prompt({
				sessionID: sessionId,
				directory: workingDir,
				model: { providerID, modelID },
				parts: [{ type: "text" as const, text: prompt }],
			});

			if (!promptResult.data) {
				return {
					output: "",
					error: `Prompt failed: ${JSON.stringify(promptResult.error)}`,
					metadata: { toolCalls: [], bashCommands: [], toolCallCount: 0 },
				};
			}

			// Recursively collect parts from the session and all child sessions
			const allParts = await collectAllParts(client, sessionId, workingDir);

			if (allParts.length === 0) {
				allParts.push(...promptResult.data.parts);
			}

			// Extract tool calls
			const toolCalls: ToolCall[] = [];
			for (const part of allParts) {
				if (isToolPart(part)) {
					toolCalls.push({
						id: part.callID,
						name: part.tool,
						canonical: toCanonical(part.tool),
						input: part.state.input,
						source: "opencode",
					});
				}
			}

			// Extract bash commands
			const bashCommands = toolCalls
				.filter((t) => t.name.toLowerCase() === "bash" || t.name === "Bash")
				.map((t) => {
					const input = t.input as { command?: string } | undefined;
					return input?.command ?? "";
				})
				.filter((cmd) => cmd.length > 0);

			// Aggregate text from all assistant messages
			const allTextParts = allParts.filter(isTextPart);
			const finalResult = allTextParts.map((p) => p.text).join("\n") || "";

			// Aggregate token usage
			let totalInputTokens = 0;
			let totalOutputTokens = 0;
			let totalCost = 0;

			for (const part of allParts) {
				if (isStepFinishPart(part)) {
					totalInputTokens += part.tokens.input;
					totalOutputTokens += part.tokens.output;
					totalCost += part.cost;
				}
			}

			const assistantMessage = promptResult.data.info;
			if (assistantMessage.tokens && totalInputTokens === 0) {
				totalInputTokens = assistantMessage.tokens.input;
				totalOutputTokens = assistantMessage.tokens.output;
				totalCost = assistantMessage.cost;
			}

			const metadataSection = `

## Metadata

\`\`\`json
${JSON.stringify({ toolCalls, bashCommands, toolCallCount: toolCalls.length }, null, 2)}
\`\`\``;

			return {
				output: finalResult + metadataSection,
				tokenUsage: {
					prompt: totalInputTokens,
					completion: totalOutputTokens,
					total: totalInputTokens + totalOutputTokens,
				},
				cost: totalCost,
				metadata: { toolCalls, bashCommands, toolCallCount: toolCalls.length },
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				output: "",
				error: `Provider error: ${errorMessage}`,
				metadata: { toolCalls: [], bashCommands: [], toolCallCount: 0 },
			};
		} finally {
			autoResponderAbort.abort();
			if (server) {
				server.close();
			}
		}
	}
}
