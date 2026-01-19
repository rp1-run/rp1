/**
 * Custom Promptfoo provider that wraps claude-agent-sdk
 * and captures all tool_use blocks from streaming events.
 *
 * Exposes tool calls via metadata for assertion inspection.
 */

import {
  type PermissionMode,
  type PermissionResult,
  type SettingSource,
  query,
} from "@anthropic-ai/claude-agent-sdk";

// Types for tool call capture
interface ToolCall {
  readonly id: string;
  readonly name: string;
  input: unknown;
  readonly source?: "stream_event" | "assistant";
}

interface ProviderMetadata {
  readonly toolCalls: readonly ToolCall[];
  readonly bashCommands: readonly string[];
  readonly toolCallCount: number;
}

// AskUserQuestion behavior options
type AskUserBehavior = "first_option" | "random" | "deny";

interface AskUserQuestionInput {
  readonly questions: ReadonlyArray<{
    readonly question: string;
    readonly options: ReadonlyArray<{ readonly label: string }>;
  }>;
}

// Promptfoo provider types
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

// Stream message types from claude-agent-sdk
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
    // Allow all non-AskUserQuestion tools
    if (toolName !== "AskUserQuestion") {
      return {
        behavior: "allow",
        updatedInput: input,
      };
    }

    // Record the AskUserQuestion tool call for assertions
    toolCallsRef.push({
      id: options.toolUseID,
      name: "AskUserQuestion",
      input,
      source: "stream_event",
    });

    // Handle deny behavior
    if (behavior === "deny") {
      return {
        behavior: "deny",
        message: "AskUserQuestion is disabled in automated evaluation mode",
      };
    }

    // Handle first_option and random behaviors
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
        // first_option (default)
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
    _context: ProviderContext,
    _options: CallApiOptions,
  ): Promise<ProviderResponse> {
    const toolCalls: ToolCall[] = [];
    let finalResult = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const askUserBehavior: AskUserBehavior =
      this.config.ask_user_behavior ?? "first_option";

    try {
      const canUseTool = createAskUserQuestionCanUseTool(
        askUserBehavior,
        toolCalls,
      );

      const queryOptions = {
        prompt,
        options: {
          model: this.config.model,
          cwd: this.config.working_dir,
          permissionMode: this.config.permission_mode,
          allowDangerouslySkipPermissions:
            this.config.allow_dangerously_skip_permissions,
          maxTurns: this.config.max_turns,
          settingSources: this.config.setting_sources
            ? [...this.config.setting_sources]
            : undefined,
          allowedTools: this.config.tools ? [...this.config.tools] : undefined,
          includePartialMessages: true,
          canUseTool,
        },
      };

      const messageStream = query(queryOptions);

      for await (const message of messageStream) {
        const msg = message as StreamMessage;

        // Capture tool_use from stream_event content_block_start
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
            }
          }
        }

        // Capture full input from assistant messages
        if (isAssistantMessage(msg) && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use" && block.id) {
              const existing = toolCalls.find((t) => t.id === block.id);
              if (existing) {
                existing.input = block.input;
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

        // Capture final result
        if (isResultMessage(msg)) {
          finalResult = msg.result ?? "";
          if (msg.usage) {
            totalInputTokens += msg.usage.input_tokens ?? 0;
            totalOutputTokens += msg.usage.output_tokens ?? 0;
          }
        }
      }

      // Extract bash commands as convenience array
      const bashCommands = toolCalls
        .filter((t) => t.name === "Bash")
        .map((t) => {
          const input = t.input as { command?: string } | undefined;
          return input?.command ?? "";
        })
        .filter((cmd) => cmd.length > 0);

      return {
        output: finalResult,
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
  }
}
