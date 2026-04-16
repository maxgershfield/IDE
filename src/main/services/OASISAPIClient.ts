import { randomUUID } from 'crypto';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { AgentChatMessage } from '../../shared/agentTurnTypes.js';

export class OASISAPIClient {
  private client: AxiosInstance;
  private baseURL: string;
  private authToken: string | null = null;

  constructor() {
    this.baseURL = process.env.OASIS_API_URL || 'http://127.0.0.1:5003';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500
    });
  }

  setAuthToken(token: string) {
    this.authToken = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    this.authToken = null;
    delete this.client.defaults.headers.common['Authorization'];
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Authenticate avatar and get JWT. Sets token for subsequent requests.
   */
  async authenticateAvatar(username: string, password: string): Promise<{ token: string; avatarId: string; username?: string }> {
    const response = await this.client.post('/api/avatar/authenticate', {
      username,
      password
    });

    const data = response.data ?? response;
    const isError = data.isError === true || data.IsError === true;
    if (isError) {
      const msg = data.message ?? data.Message ?? 'Authentication failed';
      throw new Error(msg);
    }

    const result = data.result?.result ?? data.result ?? data;
    const token =
      result.jwtToken ?? result.JwtToken ?? result.token ?? result.Token;
    const avatarId = result.avatarId ?? result.id ?? result.AvatarId ?? result.Id ?? '';
    const usernameOut = result.username ?? result.Username;

    if (!token) {
      throw new Error('No JWT token received from OASIS API');
    }

    this.setAuthToken(token);
    return { token, avatarId, username: usernameOut };
  }

  /**
   * Get pending A2A messages for the authenticated avatar.
   */
  async getPendingA2AMessages(): Promise<any[]> {
    const response = await this.client.get('/api/a2a/messages');
    const data = response.data ?? response;
    const result = data.result ?? data;
    const list = Array.isArray(result) ? result : result?.messages ?? result?.items ?? [];
    return list;
  }

  /**
   * Mark an A2A message as processed.
   */
  async markMessageProcessed(messageId: string): Promise<void> {
    await this.client.post(`/api/a2a/messages/${messageId}/process`);
  }

  /**
   * Send A2A JSON-RPC (e.g. service_request for reply). Use for replying to a message.
   */
  async sendA2AJsonRpc(toAgentId: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
    const response = await this.client.post('/api/a2a/jsonrpc', {
      jsonrpc: '2.0',
      method,
      params: { toAgentId, ...params }
    });
    return (response.data ?? response).result;
  }

  async healthCheck(): Promise<any> {
    try {
      const response = await this.client.get('/api/health');
      return { status: 'healthy', data: response.data };
    } catch (error: any) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async discoverAgents(serviceName?: string): Promise<any[]> {
    const url = serviceName
      ? `/api/serv/agents/discover-serv?service=${encodeURIComponent(serviceName)}`
      : '/api/serv/agents/discover-serv';
    
    try {
      const response = await this.client.get(url);
      return response.data.result || [];
    } catch (error: any) {
      console.error('[OASIS] Agent discovery error:', error);
      return [];
    }
  }

  async getAgentCard(agentId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/serv/agent-card/${agentId}`);
      return response.data.result;
    } catch (error: any) {
      throw new Error(`Failed to get agent card: ${error.message}`);
    }
  }

  async sendA2AMessage(toAgentId: string, message: any): Promise<any> {
    try {
      const response = await this.client.post('/api/serv/jsonrpc', {
        toAgentId,
        ...message
      });
      return response.data.result;
    } catch (error: any) {
      throw new Error(`Failed to send A2A message: ${error.message}`);
    }
  }

  /**
   * Send a new outbound A2A message from the authenticated avatar.
   * Method is a JSON-RPC 2.0 method name (e.g. "service_request", "ping").
   */
  async sendA2ANewMessage(
    toAgentId: string,
    method: string,
    content: string
  ): Promise<void> {
    await this.client.post('/api/a2a/jsonrpc', {
      jsonrpc: '2.0',
      method,
      params: { toAgentId, content }
    });
  }

  /**
   * Register the IDE session as a discoverable A2A agent.
   * Called after login so other agents can find and message this user.
   * Fire-and-forget — failure should not block login.
   */
  async registerAgentCapabilities(agentId: string, capabilities: string[]): Promise<void> {
    await this.client.post('/api/a2a/agents/register', {
      agentId,
      capabilities,
      agentType: 'ide',
      description: 'OASIS IDE session'
    });
  }

  /** IDE chat messages as stored on a single conversation holon (metadata JSON). */
  async saveIdeConversationHolon(params: {
    threadKey: string;
    workspaceRoot?: string | null;
    rootHolonId?: string | null;
    messagesJson: string;
  }): Promise<{ rootHolonId?: string; error?: string }> {
    const HOLON_TYPE_HOLON = 36; // HolonType.Holon

    const metaData: Record<string, string> = {
      'oasis.ide.schema': 'conversation',
      'oasis.ide.threadKey': params.threadKey,
      'oasis.ide.version': '1',
      'oasis.ide.messagesJson': params.messagesJson
    };
    if (params.workspaceRoot) {
      metaData['oasis.ide.workspaceRoot'] = params.workspaceRoot;
    }

    const id =
      params.rootHolonId && params.rootHolonId.length > 8
        ? params.rootHolonId
        : randomUUID();

    const body = {
      holon: {
        id,
        name: `OASIS IDE chat — ${params.threadKey}`,
        description: 'IDE assistant conversation (metadata.messagesJson)',
        holonType: HOLON_TYPE_HOLON,
        metaData,
        children: [] as unknown[]
      },
      saveChildren: false,
      recursive: false,
      maxChildDepth: 0,
      continueOnError: true
    };

    try {
      const response = await this.client.post('/api/data/save-holon', body);
      const data = response.data ?? response;
      if (response.status === 401) {
        return { error: 'Not authorized — log in to sync chat to OASIS.' };
      }
      if (response.status >= 400) {
        const msg =
          (data as any)?.message ??
          (data as any)?.Message ??
          (data as any)?.result?.message ??
          `save-holon failed (${response.status})`;
        return { error: String(msg) };
      }

      const unwrapHolon = (d: any): { holon: any | null; error?: string } => {
        if (!d || typeof d !== 'object') return { holon: null, error: 'Empty response' };
        if (d.isError === true || d.IsError === true) {
          return { holon: null, error: String(d.message ?? d.Message ?? 'OASIS error') };
        }
        const r = d.result ?? d.Result;
        if (r && typeof r === 'object') {
          if (r.isError === true || r.IsError === true) {
            return { holon: null, error: String(r.message ?? r.Message ?? 'OASIS error') };
          }
          const inner = r.result ?? r.Result ?? r;
          if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
            if (inner.isError === true || inner.IsError === true) {
              return { holon: null, error: String(inner.message ?? inner.Message ?? 'OASIS error') };
            }
            return { holon: inner };
          }
        }
        return { holon: null, error: 'Unexpected save-holon response shape' };
      };

      const { holon, error: unwrapErr } = unwrapHolon(data);
      const rid = holon?.id ?? holon?.Id;
      if (rid) {
        return { rootHolonId: String(rid) };
      }
      const errMsg =
        unwrapErr ??
        (data as any)?.message ??
        (data as any)?.result?.message ??
        'save-holon returned no holon id';
      return { error: String(errMsg) };
    } catch (err: any) {
      return { error: err?.message ?? String(err) };
    }
  }

  /**
   * Load IDE conversation holon by metadata oasis.ide.threadKey (requires JWT).
   */
  async loadIdeConversationByThreadKey(threadKey: string): Promise<{
    rootHolonId?: string;
    messagesJson?: string;
    error?: string;
  }> {
    const qs = new URLSearchParams({
      metaKey: 'oasis.ide.threadKey',
      metaValue: threadKey,
      holonType: 'Holon',
      loadChildren: 'false',
      recursive: 'false',
      maxChildDepth: '0',
      continueOnError: 'true'
    });

    try {
      const response = await this.client.get(
        `/api/data/load-holons-by-metadata?${qs.toString()}`
      );
      const data = response.data ?? response;
      if (response.status === 401) {
        return { error: 'Not authorized' };
      }
      if (response.status >= 400) {
        const msg =
          (data as any)?.message ??
          (data as any)?.result?.message ??
          `load-holons-by-metadata failed (${response.status})`;
        return { error: String(msg) };
      }

      const unwrapList = (d: any): any[] => {
        if (!d || typeof d !== 'object') return [];
        if (d.isError === true || d.IsError === true) return [];
        const r = d.result ?? d.Result;
        if (Array.isArray(r)) return r;
        if (r && typeof r === 'object') {
          if (r.isError === true || r.IsError === true) return [];
          const inner = r.result ?? r.Result;
          if (Array.isArray(inner)) return inner;
        }
        return [];
      };

      const list = unwrapList(data);
      if (list.length === 0) {
        return {};
      }

      const pick = list[0] as Record<string, unknown>;
      const meta = (pick.metaData ?? pick.MetaData ?? {}) as Record<string, unknown>;
      const rawJson =
        meta['oasis.ide.messagesJson'] ??
        meta['Oasis.Ide.MessagesJson'] ??
        meta['messagesJson'];
      const messagesJson =
        typeof rawJson === 'string' ? rawJson : rawJson != null ? JSON.stringify(rawJson) : undefined;
      const id = pick.id ?? pick.Id;
      return {
        rootHolonId: id != null ? String(id) : undefined,
        messagesJson: messagesJson || undefined
      };
    } catch (err: any) {
      return { error: err?.message ?? String(err) };
    }
  }

  /**
   * Chat with the built-in IDE assistant via POST /api/ide/chat (ONODE routes by model id).
   */
  async chatWithAgent(
    agentId: string,
    message: string,
    options?: {
      conversationId?: string;
      history?: Array<{ role: string; content: string }>;
      fromAvatarId?: string;
      model?: string;
      workspaceRoot?: string | null;
      referencedPaths?: string[];
      /** Canonical OASIS / STAR reference; same text as agent turns (ONODE appends to system prompt). */
      contextPack?: string;
    }
  ): Promise<{ content: string; toolCalls?: any[]; error?: string }> {
    try {
      const response = await this.client.post<{
        content?: string;
        toolCalls?: any[];
        error?: string;
      }>(
        '/api/ide/chat',
        {
          agentId: agentId || 'oasis-ide-assistant',
          message,
          conversationId: options?.conversationId,
          history: options?.history ?? [],
          fromAvatarId: options?.fromAvatarId,
          model: options?.model,
          workspaceRoot: options?.workspaceRoot ?? undefined,
          referencedPaths:
            options?.referencedPaths && options.referencedPaths.length > 0
              ? options.referencedPaths
              : undefined,
          contextPack:
            options?.contextPack && options.contextPack.trim().length > 0
              ? options.contextPack
              : undefined
        },
        { timeout: 120000 }
      );

      const data = response.data;
      if (response.status >= 400) {
        const errMsg = (data as any)?.error ?? response.statusText ?? 'IDE chat failed';
        return { content: '', error: errMsg };
      }

      const content = data?.content ?? '';
      const toolCalls = data?.toolCalls;
      const error = data?.error;
      return { content: content || '', toolCalls, error };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      return { content: '', error: msg };
    }
  }

  /**
   * One step of the IDE agent (tools). POST /api/ide/agent/turn — long timeout for tool-heavy turns.
   * Pass `signal` to cancel in flight (Electron main calls `AbortController.abort()` from IPC).
   */
  async agentTurn(
    body: {
      model: string;
      messages: AgentChatMessage[];
      workspaceRoot?: string | null;
      referencedPaths?: string[];
      fromAvatarId?: string;
      /** Bounded OASIS/STAR reference text from the IDE (see IdeAgentController max length). */
      contextPack?: string | null;
      /** plan = read-only tools; execute = full tool set (default). */
      executionMode?: 'plan' | 'execute';
    },
    options?: { signal?: AbortSignal }
  ): Promise<
    | {
        ok: true;
        kind: 'message' | 'tool_calls';
        content?: string;
        toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
        finishReason?: string;
      }
    | { ok: false; error: string }
  > {
    try {
      const response = await this.client.post<{
        kind?: string;
        content?: string;
        finishReason?: string;
        toolCalls?: Array<{ id?: string; name?: string; argumentsJson?: string }>;
        error?: string;
      }>(
        '/api/ide/agent/turn',
        {
          model: body.model,
          messages: body.messages.map((m) => ({
            role: m.role,
            content: m.content,
            toolCallId: m.toolCallId,
            toolCalls: m.toolCalls?.map((tc) => ({
              id: tc.id,
              name: tc.name,
              argumentsJson: tc.argumentsJson
            }))
          })),
          workspaceRoot: body.workspaceRoot ?? undefined,
          referencedPaths: body.referencedPaths?.length ? body.referencedPaths : undefined,
          fromAvatarId: body.fromAvatarId,
          contextPack: body.contextPack?.trim() ? body.contextPack.trim() : undefined,
          executionMode: body.executionMode === 'plan' ? 'plan' : 'execute'
        },
        {
          timeout: 120000,
          signal: options?.signal,
          validateStatus: (status) => status >= 200 && status < 600
        }
      );

      const data = response.data as Record<string, unknown>;
      if (response.status >= 400) {
        const err = (data?.error as string) || `Agent turn failed (${response.status})`;
        return { ok: false, error: err };
      }

      const kind = data?.kind as string;
      if (kind === 'error') {
        return { ok: false, error: (data?.error as string) || 'Agent error' };
      }
      if (kind === 'tool_calls') {
        const raw = (data?.toolCalls as Array<Record<string, unknown>>) ?? [];
        const toolCalls = raw.map((t: Record<string, unknown>) => ({
          id: String(t.id ?? ''),
          name: String(t.name ?? ''),
          argumentsJson: String(t.argumentsJson ?? '{}')
        }));
        return {
          ok: true,
          kind: 'tool_calls',
          content: (data?.content as string) ?? '',
          toolCalls,
          finishReason: data?.finishReason as string | undefined
        };
      }
      return {
        ok: true,
        kind: 'message',
        content: (data?.content as string) ?? '',
        finishReason: data?.finishReason as string | undefined
      };
    } catch (err: unknown) {
      if (isAxiosError(err) && err.code === 'ERR_CANCELED') {
        return { ok: false, error: 'Stopped.' };
      }
      if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
        const d = err.response.data as { error?: string };
        if (d.error) return { ok: false, error: d.error };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
