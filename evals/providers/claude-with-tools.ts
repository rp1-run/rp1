/**
 * Custom Promptfoo provider that wraps claude-agent-sdk
 * and captures all tool_use blocks from streaming events.
 *
 * Exposes tool calls via metadata for assertion inspection.
 * Includes OpenTelemetry instrumentation for tracing.
 */

import {
	type PermissionMode,
	type PermissionResult,
	query,
	type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";

// OpenTelemetry imports for tracing
import {
	context,
	propagation,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
	BatchSpanProcessor,
	NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";

// Initialize OpenTelemetry tracer provider once
const otlpExporter = new OTLPTraceExporter({
	url: "http://localhost:4318/v1/traces",
});
const tracerProvider = new NodeTracerProvider({
	spanProcessors: [new BatchSpanProcessor(otlpExporter)],
});
tracerProvider.register();

const tracer = trace.getTracer("claude-with-tools", "1.0.0");

interface ToolCall {
	readonly id: string;
	readonly name: string;
	readonly input: unknown;
	readonly source?: "stream_event" | "assistant";
}

interface ProviderMetadata {
	readonly toolCalls: readonly ToolCall[];
	readonly bashCommands: readonly string[];
	readonly toolCallCount: number;
}

type AskUserBehavior = "first_option" | "random" | "deny";

interface AskUserQuestionInput {
	readonly questions: ReadonlyArray<{
		readonly question: string;
		readonly options: ReadonlyArray<{ readonly label: string }>;
	}>;
}

interface ProviderOptions {
	readonly config?: ProviderConfig;
	readonly id?: string;
}

interface ProviderConfig {
	readonly model?: string;
	readonly working_dir?: string;
	readonly permission_mode?: PermissionMode;
	readonly allow_dangerously_skip_permissions?: boolean;
	readonly max_turns?: number;
	readonly setting_sources?: readonly SettingSource[];
	readonly tools?: readonly string[];
	readonly include_partial_messages?: boolean;
	readonly ask_user_behavior?: AskUserBehavior;
	readonly [key: string]: unknown;
}

interface ProviderContext {
	readonly vars?: Record<string, string>;
	readonly prompt?: {
		readonly raw?: string;
		readonly label?: string;
	};
	readonly traceparent?: string;
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

interface StreamEventMessage {
	readonly type: "stream_event";
	readonly event?: {
		readonly type: string;
		readonly content_block?: {
			readonly type: string;
			readonly id: string;
			readonly name: string;
			readonly input?: unknown;
		};
	};
}

interface AssistantMessage {
	readonly type: "assistant";
	readonly message?: {
		readonly content?: ReadonlyArray<{
			readonly type: string;
			readonly id?: string;
			readonly name?: string;
			readonly input?: unknown;
		}>;
	};
}

interface ResultMessage {
	readonly type: "result";
	readonly subtype?: string;
	readonly result?: string;
	readonly usage?: {
		readonly input_tokens?: number;
		readonly output_tokens?: number;
	};
}

type StreamMessage =
	| StreamEventMessage
	| AssistantMessage
	| ResultMessage
	| { readonly type: string };

function isStreamEventMessage(msg: StreamMessage): msg is StreamEventMessage {
	return msg.type === "stream_event";
}

function isAssistantMessage(msg: StreamMessage): msg is AssistantMessage {
	return msg.type === "assistant";
}

function isResultMessage(msg: StreamMessage): msg is ResultMessage {
	return msg.type === "result";
}

function createAskUserQuestionCanUseTool(
	behavior: AskUserBehavior,
	toolCallsRef: ToolCall[],
): (
	toolName: string,
	input: Record<string, unknown>,
	options: { toolUseID: string },
) => Promise<PermissionResult> {
	return async (
		toolName: string,
		input: Record<string, unknown>,
		options: { toolUseID: string },
	): Promise<PermissionResult> => {
		if (toolName !== "AskUserQuestion") {
			return {
				behavior: "allow",
				updatedInput: input,
			};
		}

		toolCallsRef.push({
			id: options.toolUseID,
			name: "AskUserQuestion",
			input,
			source: "stream_event",
		});

		if (behavior === "deny") {
			return {
				behavior: "deny",
				message: "AskUserQuestion is disabled in automated evaluation mode",
			};
		}

		const toolInput = input as unknown as AskUserQuestionInput;
		const answers: Record<string, string> = {};

		for (const question of toolInput.questions ?? []) {
			if (!question.options || question.options.length === 0) {
				continue;
			}

			let selectedLabels: string[];
			if (behavior === "random") {
				const randomIndex = Math.floor(Math.random() * question.options.length);
				selectedLabels = [question.options[randomIndex].label];
			} else {
				selectedLabels = [question.options[0].label];
			}
			answers[question.question] = selectedLabels.join(", ");
		}

		return {
			behavior: "allow",
			updatedInput: {
				questions: toolInput.questions,
				answers,
			},
		};
	};
}

export default class ClaudeWithToolCapture {
	private readonly config: ProviderConfig;

	constructor(options: ProviderOptions) {
		this.config = options.config ?? {};
	}

	id(): string {
		return "claude-with-tools";
	}

	async callApi(
		prompt: string,
		providerContext: ProviderContext,
		_options: CallApiOptions,
	): Promise<ProviderResponse> {
		// Extract trace context from promptfoo's traceparent
		let activeContext = context.active();
		if (providerContext.traceparent) {
			activeContext = propagation.extract(context.active(), {
				traceparent: providerContext.traceparent,
			});
		}

		// Run the entire provider call within the trace context
		return context.with(activeContext, async () => {
			const span = tracer.startSpan("claude-agent-sdk.query", {
				attributes: {
					"gen_ai.system": "anthropic",
					"gen_ai.request.model": this.config.model ?? "unknown",
					"prompt.length": prompt.length,
				},
			});

			const toolCalls: ToolCall[] = [];
			let finalResult = "";
			let totalInputTokens = 0;
			let totalOutputTokens = 0;

			const askUserBehavior: AskUserBehavior =
				this.config.ask_user_behavior ?? "first_option";

			// Use WORKSPACE_DIR from vars (set by extension) or fall back to config
			const workingDir =
				providerContext.vars?.WORKSPACE_DIR ?? this.config.working_dir;

			try {
				const canUseTool = createAskUserQuestionCanUseTool(
					askUserBehavior,
					toolCalls,
				);

				const queryOptions = {
					prompt,
					options: {
						model: this.config.model,
						cwd: workingDir,
						permissionMode: this.config.permission_mode,
						allowDangerouslySkipPermissions:
							this.config.allow_dangerously_skip_permissions,
						maxTurns: this.config.max_turns,
						settingSources: this.config.setting_sources
							? [...this.config.setting_sources]
							: undefined,
						allowedTools: this.config.tools
							? [...this.config.tools]
							: undefined,
						includePartialMessages: true,
						canUseTool,
					},
				};

				const messageStream = query(queryOptions);

				for await (const message of messageStream) {
					const msg = message as StreamMessage;

					if (isStreamEventMessage(msg)) {
						const event = msg.event;
						if (
							event?.type === "content_block_start" &&
							event.content_block?.type === "tool_use"
						) {
							const block = event.content_block;
							// Avoid duplicates (AskUserQuestion is captured via canUseTool)
							const existing = toolCalls.find((t) => t.id === block.id);
							if (!existing) {
								toolCalls.push({
									id: block.id,
									name: block.name,
									input: block.input ?? {},
									source: "stream_event",
								});
								// Add span event for tool use
								span.addEvent("tool_use", {
									"tool.name": block.name,
									"tool.id": block.id,
								});
							}
						}
					}

					if (isAssistantMessage(msg) && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === "tool_use" && block.id) {
								const existingIndex = toolCalls.findIndex(
									(t) => t.id === block.id,
								);
								if (existingIndex !== -1) {
									// Replace with new object to maintain immutability
									toolCalls[existingIndex] = {
										...toolCalls[existingIndex],
										input: block.input,
									};
								} else {
									toolCalls.push({
										id: block.id,
										name: block.name ?? "unknown",
										input: block.input,
										source: "assistant",
									});
								}
							}
						}
					}

					if (isResultMessage(msg)) {
						finalResult = msg.result ?? "";
						if (msg.usage) {
							totalInputTokens += msg.usage.input_tokens ?? 0;
							totalOutputTokens += msg.usage.output_tokens ?? 0;
						}
					}
				}

				const bashCommands = toolCalls
					.filter((t) => t.name === "Bash")
					.map((t) => {
						const input = t.input as { command?: string } | undefined;
						return input?.command ?? "";
					})
					.filter((cmd) => cmd.length > 0);

				const metadataSection = `

## Metadata

\`\`\`json
${JSON.stringify({ toolCalls, bashCommands, toolCallCount: toolCalls.length }, null, 2)}
\`\`\``;

				// Set span attributes for completion
				span.setAttributes({
					"gen_ai.usage.input_tokens": totalInputTokens,
					"gen_ai.usage.output_tokens": totalOutputTokens,
					"tool_call.count": toolCalls.length,
				});
				span.setStatus({ code: SpanStatusCode.OK });
				span.end();

				// Flush spans to ensure they're exported before the eval completes
				await tracerProvider.forceFlush();

				return {
					output: finalResult + metadataSection,
					tokenUsage: {
						prompt: totalInputTokens,
						completion: totalOutputTokens,
						total: totalInputTokens + totalOutputTokens,
					},
					metadata: {
						toolCalls: toolCalls as readonly ToolCall[],
						bashCommands: bashCommands as readonly string[],
						toolCallCount: toolCalls.length,
					},
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				span.recordException(
					error instanceof Error ? error : new Error(errorMessage),
				);
				span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
				span.end();

				// Flush spans even on error
				await tracerProvider.forceFlush();

				return {
					output: "",
					error: `Provider error: ${errorMessage}`,
					metadata: {
						toolCalls: toolCalls as readonly ToolCall[],
						bashCommands: [] as readonly string[],
						toolCallCount: toolCalls.length,
					},
				};
			}
		});
	}
}
