/**
 * Model ids aligned with common IDE pickers (e.g. Cursor-style menus).
 * Routing: OpenAI chat/completions, Anthropic messages, Gemini generateContent, xAI OpenAI-compatible.
 */

export type IdeChatProviderId = 'openai' | 'anthropic' | 'google' | 'xai';

export interface IdeChatModelOption {
  /** API model id passed to ONODE /api/ide/chat and local ChatService */
  id: string;
  /** Short label in the UI */
  label: string;
  provider: IdeChatProviderId;
}

export const IDE_CHAT_MODEL_STORAGE_KEY = 'oasis-ide-selected-chat-model';

/** Composer: plain chat vs tool agent loop (OpenAI/Grok + local tools). */
export const IDE_COMPOSER_MODE_STORAGE_KEY = 'oasis-ide-composer-mode';
export type ComposerModeId = 'chat' | 'agent';

/** Agent only: plan (read-only + one question + chips) vs execute (full tools). */
export const IDE_AGENT_EXECUTION_MODE_STORAGE_KEY = 'oasis-ide-agent-execution-mode';
export type AgentExecutionModeId = 'plan' | 'execute';
/** Per-session game dev config (engine preference, NPC roster, etc.) */
export const IDE_GAME_DEV_STORAGE_KEY = 'oasis-ide-game-dev-config';

/** Default when nothing stored */
export const IDE_CHAT_DEFAULT_MODEL_ID = 'gpt-4o-mini';

export const IDE_CHAT_MODELS: IdeChatModelOption[] = [
  // OpenAI
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'o1', label: 'o1', provider: 'openai' },
  { id: 'o1-mini', label: 'o1 mini', provider: 'openai' },
  { id: 'o3-mini', label: 'o3 mini', provider: 'openai' },
  // Anthropic
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic' },
  // Google Gemini (ids must match Google AI Studio / generateContent)
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'google' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'google' },
  // xAI Grok (OpenAI-compatible)
  { id: 'grok-3', label: 'Grok 3', provider: 'xai' },
  { id: 'grok-2-latest', label: 'Grok 2', provider: 'xai' }
];

export function getIdeChatModelById(id: string): IdeChatModelOption | undefined {
  return IDE_CHAT_MODELS.find((m) => m.id === id);
}
