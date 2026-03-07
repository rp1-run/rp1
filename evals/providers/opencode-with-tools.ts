/**
 * Custom Promptfoo provider that wraps @opencode-ai/sdk
 * and captures ToolPart entries from session responses.
 *
 * Exposes tool calls via metadata for assertion inspection,
 * matching the same format as claude-with-tools.ts.
 */

import {
	createOpencode,
	type OpencodeClient,
	type Part,
	type StepFinishPart,
	type TextPart,
	type ToolPart,
} from "@opencode-ai/sdk";

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
		path: { id: sessionId },
		query: { directory },
	});

	if (messagesResult.data) {
		for (const msg of messagesResult.data) {
			parts.push(...msg.parts);
		}
	}

	// Recurse into child sessions (subagents)
	const childrenResult = await client.session.children({
		path: { id: sessionId },
		query: { directory },
	});

	if (childrenResult.data && childrenResult.data.length > 0) {
		for (const child of childrenResult.data) {
			const childParts = await collectAllParts(client, child.id, directory);
			parts.push(...childParts);
		}
	}

	return parts;
}

interface ToolCall {
	readonly id: string;
	readonly name: string;
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
	readonly permission?: {
		readonly edit?: "ask" | "allow" | "deny";
		readonly bash?:
			| ("ask" | "allow" | "deny")
			| { readonly [key: string]: "ask" | "allow" | "deny" };
		readonly webfetch?: "ask" | "allow" | "deny";
		readonly doom_loop?: "ask" | "allow" | "deny";
		readonly external_directory?: "ask" | "allow" | "deny";
	};
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
		// Resolution order: config > env var (required if no config)
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

		// Use WORKSPACE_DIR from vars (set by extension) or fall back to config
		const workingDir =
			providerContext.vars?.WORKSPACE_DIR ?? this.config.working_dir;

		// Pick a random port to avoid collisions in parallel execution
		const port =
			this.config.opencode_port ?? Math.floor(Math.random() * 10000) + 10000;
		const timeout = this.config.opencode_timeout ?? 30000;

		let server: { url: string; close(): void } | undefined;

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
					permission: this.config.permission ?? {
						edit: "allow",
						bash: "allow",
						webfetch: "deny",
						doom_loop: "allow",
						external_directory: "allow",
					},
				},
			});

			server = opencode.server;
			const client = opencode.client;

			if (!workingDir) {
				return {
					output: "",
					error:
						"No working directory specified (WORKSPACE_DIR or working_dir config)",
					metadata: {
						toolCalls: [],
						bashCommands: [],
						toolCallCount: 0,
					},
				};
			}

			// Create session with directory context
			// OpenCode auto-discovers AGENTS.md from the project root via this directory
			const sessionResult = await client.session.create({
				query: { directory: workingDir },
			});

			if (!sessionResult.data) {
				return {
					output: "",
					error: `Failed to create session: ${JSON.stringify(sessionResult.error)}`,
					metadata: {
						toolCalls: [],
						bashCommands: [],
						toolCallCount: 0,
					},
				};
			}

			const sessionId = sessionResult.data.id;

			// Send prompt and wait for completion
			const promptResult = await client.session.prompt({
				path: { id: sessionId },
				query: { directory: workingDir },
				body: {
					model: {
						providerID,
						modelID,
					},
					parts: [
						{
							type: "text" as const,
							text: prompt,
						},
					],
				},
			});

			if (!promptResult.data) {
				return {
					output: "",
					error: `Prompt failed: ${JSON.stringify(promptResult.error)}`,
					metadata: {
						toolCalls: [],
						bashCommands: [],
						toolCallCount: 0,
					},
				};
			}

			// Recursively collect parts from the session and all child sessions.
			// OpenCode spawns child sessions for subagents (task tool calls),
			// so we must traverse the full session tree to capture all tool calls.
			const allParts = await collectAllParts(client, sessionId, workingDir);

			if (allParts.length === 0) {
				allParts.push(...promptResult.data.parts);
			}

			// Extract tool calls from ToolParts across all messages
			const toolCalls: ToolCall[] = [];
			for (const part of allParts) {
				if (isToolPart(part)) {
					toolCalls.push({
						id: part.callID,
						name: part.tool,
						input: part.state.input,
						source: "opencode",
					});
				}
			}

			// Extract bash commands from tool calls where tool is "bash"
			const bashCommands = toolCalls
				.filter((t) => t.name.toLowerCase() === "bash" || t.name === "Bash")
				.map((t) => {
					const input = t.input as { command?: string } | undefined;
					return input?.command ?? "";
				})
				.filter((cmd) => cmd.length > 0);

			// Aggregate text from ALL assistant messages across the full conversation,
			// not just the final message — multi-turn agents produce output across turns
			const allTextParts = allParts.filter(isTextPart);
			const finalResult = allTextParts.map((p) => p.text).join("\n") || "";

			// Aggregate token usage from StepFinishParts across all messages
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

			// Fallback to assistant message level tokens
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
				metadata: {
					toolCalls,
					bashCommands,
					toolCallCount: toolCalls.length,
				},
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				output: "",
				error: `Provider error: ${errorMessage}`,
				metadata: {
					toolCalls: [],
					bashCommands: [],
					toolCallCount: 0,
				},
			};
		} finally {
			if (server) {
				server.close();
			}
		}
	}
}
