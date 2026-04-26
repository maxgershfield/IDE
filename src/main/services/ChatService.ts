/**
 * Local LLM completions when API keys are set in the environment (Electron main).
 * Mirrors ONODE /api/ide/chat routing by model id prefix.
 */
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_IDE = `You are the OASIS IDE Assistant in **Composer Chat** mode.

Capabilities here: you only see the user message and any [IDE context] block (workspace path, attached paths). You cannot read the disk, run terminals, or execute builds from this mode.

Style: reply like a teammate—brief, natural language. Do not repeat the same numbered “how to build” template across turns. If you already explained a limitation, acknowledge the new message in one sentence and pivot.

When the user wants the IDE to **build, install, run, or fix** something in a repo: say clearly that Chat cannot do that, and tell them to switch the composer to **Agent**, pick **OpenAI or Grok**, open the workspace folder that contains the project (or attach paths), and ask again—the agent can inspect files and run workspace commands there.

Do not pretend you ran commands or read files. Static-only sites may have no npm build; you may say that in general terms if context suggests HTML-only.`;

function routeFromModelId(modelId: string): 'openai' | 'anthropic' | 'google' | 'xai' {
  const m = (modelId || '').toLowerCase();
  if (m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('gemini-') || m.startsWith('models/gemini-')) return 'google';
  if (m.startsWith('grok-')) return 'xai';
  return 'openai';
}

function usesOpenAINewTokenParameter(modelId: string): boolean {
  const normalized = (modelId || '').trim().toLowerCase();
  return (
    normalized.startsWith('gpt-5') ||
    normalized.includes('/gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.includes('/o1') ||
    normalized.startsWith('o3') ||
    normalized.includes('/o3')
  );
}

export class ChatService {
  private openai: OpenAI | null = null;
  private xai: OpenAI | null = null;

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      const base = process.env.OPENAI_BASE_URL?.trim() || undefined;
      this.openai = base ? new OpenAI({ apiKey: openaiKey, baseURL: base }) : new OpenAI({ apiKey: openaiKey });
    }
    const xaiKey = process.env.XAI_API_KEY?.trim();
    if (xaiKey) {
      const xbase = process.env.XAI_BASE_URL?.trim() || 'https://api.x.ai/v1';
      this.xai = new OpenAI({ apiKey: xaiKey, baseURL: xbase });
    }
  }

  /** True if any provider can handle at least one model from the catalog. */
  hasLLM(): boolean {
    return (
      this.openai !== null ||
      this.xai !== null ||
      Boolean(process.env.ANTHROPIC_API_KEY?.trim()) ||
      Boolean(process.env.GOOGLE_AI_API_KEY?.trim())
    );
  }

  async complete(
    messages: ChatMessage[],
    options?: { model?: string }
  ): Promise<{ content: string; error?: string }> {
    const model =
      (options?.model || process.env.OPENAI_CHAT_MODEL || 'gpt-5.5').trim();
    const route = routeFromModelId(model);

    try {
      if (route === 'anthropic') {
        return await this.completeAnthropic(messages, model);
      }
      if (route === 'google') {
        return await this.completeGemini(messages, model);
      }
      if (route === 'xai') {
        return await this.completeXai(messages, model);
      }
      return await this.completeOpenAI(messages, model);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: '', error: message };
    }
  }

  private async completeOpenAI(
    messages: ChatMessage[],
    model: string
  ): Promise<{ content: string; error?: string }> {
    if (!this.openai) {
      return {
        content: '',
        error: 'OpenAI not configured. Set OPENAI_API_KEY for OpenAI models.'
      };
    }
    const sys = messages.find((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sys) {
      apiMessages.push({ role: 'system', content: sys.content });
    } else {
      apiMessages.push({ role: 'system', content: SYSTEM_IDE });
    }
    for (const m of rest) {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }
    const request: any = {
      model,
      messages: apiMessages,
    };
    if (usesOpenAINewTokenParameter(model)) {
      request.max_completion_tokens = 2048;
    } else {
      request.max_tokens = 2048;
      request.temperature = 0.7;
    }
    const response = await this.createOpenAIChatCompletionWithTokenParamRepair(this.openai, request);
    const content = response.choices?.[0]?.message?.content?.trim() ?? '';
    return { content };
  }

  private async createOpenAIChatCompletionWithTokenParamRepair(
    client: OpenAI,
    request: any
  ): Promise<OpenAI.Chat.ChatCompletion> {
    try {
      return await client.chat.completions.create(request);
    } catch (err: any) {
      const message = String(err?.message ?? err ?? '');
      const code = String(err?.code ?? '');
      const unsupportedParameter =
        /unsupported[_ ]parameter/i.test(message) || /unsupported[_ ]parameter/i.test(code);
      const unsupportedMaxTokens = /max_tokens/i.test(message);
      const unsupportedMaxCompletionTokens = /max_completion_tokens/i.test(message);
      if (!unsupportedParameter || (!unsupportedMaxTokens && !unsupportedMaxCompletionTokens)) {
        throw err;
      }

      const retryRequest = { ...request };
      if (unsupportedMaxTokens && retryRequest.max_tokens !== undefined) {
        retryRequest.max_completion_tokens = retryRequest.max_tokens;
        delete retryRequest.max_tokens;
        delete retryRequest.temperature;
        return await client.chat.completions.create(retryRequest);
      }
      if (unsupportedMaxCompletionTokens && retryRequest.max_completion_tokens !== undefined) {
        retryRequest.max_tokens = retryRequest.max_completion_tokens;
        delete retryRequest.max_completion_tokens;
        retryRequest.temperature ??= 0.7;
        return await client.chat.completions.create(retryRequest);
      }
      throw err;
    }
  }

  private async completeXai(
    messages: ChatMessage[],
    model: string
  ): Promise<{ content: string; error?: string }> {
    if (!this.xai) {
      return {
        content: '',
        error: 'xAI not configured. Set XAI_API_KEY for Grok models.'
      };
    }
    const sys = messages.find((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    apiMessages.push({ role: 'system', content: sys?.content ?? SYSTEM_IDE });
    for (const m of rest) {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }
    const response = await this.xai.chat.completions.create({
      model,
      messages: apiMessages,
      max_tokens: 2048,
      temperature: 0.7
    });
    const content = response.choices?.[0]?.message?.content?.trim() ?? '';
    return { content };
  }

  private async completeAnthropic(
    messages: ChatMessage[],
    model: string
  ): Promise<{ content: string; error?: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return {
        content: '',
        error: 'Anthropic not configured. Set ANTHROPIC_API_KEY for Claude models.'
      };
    }
    const sys = messages.find((m) => m.role === 'system')?.content ?? SYSTEM_IDE;
    const rest = messages.filter((m) => m.role !== 'system');
    const anthropicMessages: { role: string; content: string }[] = [];
    for (const m of rest) {
      if (m.role === 'user' || m.role === 'assistant') {
        anthropicMessages.push({ role: m.role, content: m.content });
      }
    }
    const base = process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com/v1';
    const res = await fetch(`${base.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: sys,
        messages: anthropicMessages
      })
    });
    const text = await res.text();
    if (!res.ok) {
      return { content: '', error: `Anthropic API error: ${text}` };
    }
    const jo = JSON.parse(text) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const block = jo.content?.[0];
    const content = (block?.text ?? '').trim();
    return { content };
  }

  private async completeGemini(
    messages: ChatMessage[],
    model: string
  ): Promise<{ content: string; error?: string }> {
    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    if (!apiKey) {
      return {
        content: '',
        error: 'Google AI not configured. Set GOOGLE_AI_API_KEY for Gemini models.'
      };
    }
    const base =
      process.env.GOOGLE_AI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta';
    const sys = messages.find((m) => m.role === 'system')?.content ?? SYSTEM_IDE;
    const rest = messages.filter((m) => m.role !== 'system');
    const contents: { role: string; parts: { text: string }[] }[] = [];
    for (const m of rest) {
      if (m.role === 'user' || m.role === 'assistant') {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        });
      }
    }
    const modelName = model.startsWith('models/') ? model : `models/${model}`;
    const url = `${base.replace(/\/$/, '')}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: sys }] }
      })
    });
    const text = await res.text();
    if (!res.ok) {
      return { content: '', error: `Google AI error: ${text}` };
    }
    const jo = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = jo.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    return { content };
  }
}
