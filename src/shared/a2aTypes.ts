/**
 * Shared A2A (Agent-to-Agent) message and protocol types.
 * Used by the renderer (InboxPanel, AgentPanel), main (IPC handlers),
 * and OASISAPIClient so the schema is defined in one place.
 */

/** Supported A2A JSON-RPC 2.0 methods. */
export type A2AMethod =
  | 'service_request'
  | 'ping'
  | 'capability_query'
  | 'task_delegation'
  | 'service_response';

/** A message sitting in the inbox (from GET /api/a2a/messages). */
export interface A2AMessage {
  /** Canonical message ID (ONODE may return id or messageId). */
  messageId: string;
  /** Agent ID of the sender. */
  fromAgentId: string;
  /** Human-readable agent name, if provided by the sender. */
  fromAgentName?: string;
  /** Plain-text or JSON body of the message. */
  content: string;
  /** A2A method that generated this message. */
  method?: A2AMethod;
  /** ISO-8601 timestamp. */
  createdAt?: string;
  /** Raw server-side fields not mapped above. */
  [key: string]: unknown;
}

/** Normalise the ad-hoc server shape into a clean A2AMessage. */
export function normaliseA2AMessage(raw: Record<string, unknown>): A2AMessage {
  const messageId =
    (raw.messageId ?? raw.id ?? raw.message_id ?? '') as string;
  const fromAgentId =
    (raw.fromAgentId ?? raw.from_agent_id ?? raw.fromId ?? '') as string;
  const fromAgentName =
    (raw.fromAgentName ?? raw.from_agent_name ?? raw.agentName ?? undefined) as string | undefined;
  const rawContent = raw.content ?? raw.body ?? raw.payload;
  const content =
    typeof rawContent === 'string'
      ? rawContent
      : rawContent != null
      ? JSON.stringify(rawContent)
      : '';
  const method = (raw.method ?? raw.rpcMethod ?? undefined) as A2AMethod | undefined;
  const createdAt =
    (raw.createdAt ?? raw.created_at ?? raw.timestamp ?? undefined) as string | undefined;

  return { ...raw, messageId, fromAgentId, fromAgentName, content, method, createdAt };
}

/** Payload for sending a new outbound A2A message. */
export interface A2AComposePayload {
  toAgentId: string;
  method: A2AMethod;
  content: string;
}

/** Result shape returned by the a2a:getPending IPC channel. */
export interface A2APendingResult {
  ok: boolean;
  messages: A2AMessage[];
  error?: string;
}

/** Result shape returned by a2a:send IPC channel. */
export interface A2ASendResult {
  ok: boolean;
  error?: string;
}
