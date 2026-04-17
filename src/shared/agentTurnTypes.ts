/**
 * Shared DTOs for multi-turn agent / tool use (Cursor-style).
 * Used by renderer (Composer), main (AgentToolExecutor), and eventually ONODE HTTP JSON.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** One message in the agent thread (OpenAI-compatible enough for mapping). */
export interface AgentChatMessage {
  role: ChatRole;
  content: string;
  /** When role === 'tool', which tool call this satisfies. */
  toolCallId?: string;
  /** When role === 'assistant', optional tool calls from the model. */
  toolCalls?: AgentToolCall[];
}

export interface AgentToolCall {
  id: string;
  /** e.g. read_file, list_directory */
  name: string;
  /** Raw JSON arguments string from the provider. */
  argumentsJson: string;
}

/** Result of executing one tool on the client (Electron main). */
export interface AgentToolExecutionResult {
  toolCallId: string;
  /** UTF-8 text for the model (file body, listing, command stdout, or error summary). */
  content: string;
  /** Set when execution failed; still send content to model for recovery. */
  isError?: boolean;
}

/** Request body for POST /api/ide/agent/turn (ONODE). */
export interface AgentTurnRequest {
  model: string;
  messages: AgentChatMessage[];
  workspaceRoot?: string | null;
  referencedPaths?: string[];
  fromAvatarId?: string;
  /** IDE-supplied OASIS/STAR reference text; ONODE enforces max length. */
  contextPack?: string | null;
  /**
   * execute = full tools (default).
   * plan = read-only tools + user-facing plan with proceed chips.
   * plan_gather = read-only tools only; internal gather digest (two-step phase 1).
   * plan_present = read-only tools only; user-facing plan after digest (two-step phase 2).
   */
  executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
  /** Bump when tool schemas change. */
  toolDefinitionsVersion?: number;
}

/** Response from POST /api/ide/agent/turn (ONODE — planned). */
export type AgentTurnResponse =
  | {
      kind: 'message';
      /** Assistant text when the model finishes without tool calls. */
      content: string;
      finishReason: 'stop' | 'length' | 'content_filter';
    }
  | {
      kind: 'tool_calls';
      toolCalls: AgentToolCall[];
      /** Optional assistant content before tools (rare). */
      content?: string;
      finishReason: 'tool_calls';
    }
  | {
      kind: 'error';
      error: string;
    };
