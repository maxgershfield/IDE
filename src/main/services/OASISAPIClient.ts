import { randomUUID } from 'crypto';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { AgentChatMessage } from '../../shared/agentTurnTypes.js';
import { DEV_LOCAL_OASIS_API_BASE } from '../../shared/oasisIdeBundleDefaults.js';

export class OASISAPIClient {
  private client: AxiosInstance;
  private baseURL: string;
  private authToken: string | null = null;
  /** OASIS refresh token (not the JWT); used with POST /api/avatar/refresh-token */
  private refreshToken: string | null = null;

  /** Normalize ONODE base URL (no trailing slash). */
  static normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/$/, '');
  }

  constructor(baseURL?: string) {
    this.baseURL = OASISAPIClient.normalizeBaseUrl(
      baseURL ?? process.env.OASIS_API_URL ?? DEV_LOCAL_OASIS_API_BASE
    );

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500
    });
  }

  /** Point the client at a different ONODE base (e.g. after Settings > Integrations override). */
  setBaseURL(url: string): void {
    this.baseURL = OASISAPIClient.normalizeBaseUrl(url);
    this.client.defaults.baseURL = this.baseURL;
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  setAuthToken(token: string) {
    this.authToken = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    this.authToken = null;
    this.refreshToken = null;
    delete this.client.defaults.headers.common['Authorization'];
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token && token.trim() ? token.trim() : null;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private parseAvatarAuthPayload(data: unknown): {
    token: string;
    refreshToken: string;
    avatarId: string;
    username?: string;
  } {
    const d = data as Record<string, unknown>;
    const isError = d.isError === true || d.IsError === true;
    if (isError) {
      const msg = (d.message ?? d.Message ?? 'Request failed') as string;
      throw new Error(typeof msg === 'string' ? msg : 'Request failed');
    }
    const inner = (d.result ?? d.Result) as Record<string, unknown> | undefined;
    const result = (inner?.result ?? inner?.Result ?? inner ?? d) as Record<string, unknown>;
    const token =
      (result.jwtToken ?? result.JwtToken ?? result.token ?? result.Token) as string | undefined;
    const refreshToken =
      (result.refreshToken ?? result.RefreshToken ?? result.refresh_token) as string | undefined;
    const avatarId = (result.avatarId ??
      result.id ??
      result.AvatarId ??
      result.Id ??
      '') as string;
    const usernameOut = (result.username ?? result.Username) as string | undefined;
    if (!token) {
      throw new Error('No JWT token in OASIS API response');
    }
    return {
      token,
      refreshToken: refreshToken ?? '',
      avatarId,
      username: usernameOut
    };
  }

  private unwrapA2AResult(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    const record = data as Record<string, unknown>;
    return record.result ?? record.Result ?? data;
  }

  private unwrapA2AList(data: unknown): any[] {
    const result = this.unwrapA2AResult(data);
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      if (Array.isArray(record.messages)) return record.messages as any[];
      if (Array.isArray(record.items)) return record.items as any[];
      if (Array.isArray(record.agents)) return record.agents as any[];
    }
    return [];
  }

  private buildA2AJsonRpcParams(
    toAgentId: string,
    params: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const rest = { ...params };
    delete rest.toAgentId;
    delete rest.to_agent_id;
    return {
      ...rest,
      to_agent_id: toAgentId
    };
  }

  /**
   * Authenticate avatar and get JWT. Sets token for subsequent requests.
   * Persists refresh token when the API returns it (needed for session extension).
   */
  async authenticateAvatar(
    username: string,
    password: string
  ): Promise<{ token: string; avatarId: string; username?: string; refreshToken: string }> {
    const response = await this.client.post('/api/avatar/authenticate', {
      username,
      password
    });

    const parsed = this.parseAvatarAuthPayload(response.data ?? response);
    this.setAuthToken(parsed.token);
    if (parsed.refreshToken) {
      this.setRefreshToken(parsed.refreshToken);
    }
    return {
      token: parsed.token,
      avatarId: parsed.avatarId,
      username: parsed.username,
      refreshToken: parsed.refreshToken
    };
  }

  /**
   * Register a new avatar (ONODE POST /api/avatar/register).
   * Does not set a session; call authenticateAvatar afterward to sign in.
   */
  async registerAvatar(params: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  }): Promise<void> {
    const response = await this.client.post('/api/avatar/register', {
      title: '',
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      avatarType: 'User',
      email: params.email.trim(),
      username: params.username.trim(),
      password: params.password,
      confirmPassword: params.confirmPassword,
      acceptTerms: true
    });

    const status = response.status;
    const data = (response.data ?? {}) as Record<string, unknown>;
    if (status >= 400 && status < 500) {
      const msg = (data.message ?? data.Message ?? `Registration failed (${status})`) as string;
      throw new Error(typeof msg === 'string' ? msg : `Registration failed (${status})`);
    }
    if (data.isError === true || data.IsError === true) {
      const msg = (data.message ?? data.Message ?? 'Registration failed') as string;
      throw new Error(typeof msg === 'string' ? msg : 'Registration failed');
    }
  }

  /**
   * Exchange refresh token for a new JWT (does not send the expired JWT).
   * Uses POST /api/avatar/refresh-token.
   */
  async refreshSession(refreshToken: string): Promise<{
    token: string;
    refreshToken: string;
    avatarId: string;
    username?: string;
  }> {
    const rt = refreshToken.trim();
    if (!rt) {
      throw new Error('No refresh token');
    }
    const response = await axios.post(
      `${this.baseURL}/api/avatar/refresh-token`,
      { refreshToken: rt },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        validateStatus: (status) => status < 500
      }
    );
    const parsed = this.parseAvatarAuthPayload(response.data ?? response);
    this.setAuthToken(parsed.token);
    if (parsed.refreshToken) {
      this.setRefreshToken(parsed.refreshToken);
    }
    return parsed;
  }

  /**
   * Get pending A2A messages for the authenticated avatar.
   */
  async getPendingA2AMessages(): Promise<any[]> {
    const response = await this.client.get('/api/a2a/messages');
    return this.unwrapA2AList(response.data ?? response);
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
      params: this.buildA2AJsonRpcParams(toAgentId, params),
      id: randomUUID()
    });
    return this.unwrapA2AResult(response.data ?? response);
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
      ? `/api/a2a/agents/discover-onet?service=${encodeURIComponent(serviceName)}`
      : '/api/a2a/agents/discover-onet';
    
    try {
      const response = await this.client.get(url);
      return this.unwrapA2AList(response.data ?? response);
    } catch (error: any) {
      console.error('[OASIS] Agent discovery error:', error);
      return [];
    }
  }

  async getAgentCard(agentId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/a2a/agent-card/${agentId}`);
      return this.unwrapA2AResult(response.data ?? response);
    } catch (error: any) {
      throw new Error(`Failed to get agent card: ${error.message}`);
    }
  }

  async sendA2AMessage(toAgentId: string, message: any): Promise<any> {
    try {
      const response = await this.client.post('/api/a2a/jsonrpc', {
        jsonrpc: '2.0',
        method: message?.method ?? 'service_request',
        params: this.buildA2AJsonRpcParams(toAgentId, message?.params ?? message ?? {}),
        id: message?.id ?? randomUUID()
      });
      return this.unwrapA2AResult(response.data ?? response);
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
      params: this.buildA2AJsonRpcParams(toAgentId, { content }),
      id: randomUUID()
    });
  }

  /**
   * Register the IDE session as a discoverable A2A agent.
   * Called after login so other agents can find and message this user.
   * Fire-and-forget — failure should not block login.
   */
  async registerAgentCapabilities(agentId: string, capabilities: string[]): Promise<void> {
    await this.client.post('/api/a2a/agent/capabilities', {
      services: capabilities,
      skills: ['OASIS-IDE'],
      description: `OASIS IDE session${agentId ? ` (${agentId})` : ''}`
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

  /** Workspace-scoped notes holon (metadata `oasis.ide.memoryJson`). */
  async saveProjectMemoryHolon(params: {
    memoryKey: string;
    workspaceRoot?: string | null;
    rootHolonId?: string | null;
    memoryJson: string;
  }): Promise<{ rootHolonId?: string; error?: string }> {
    const HOLON_TYPE_HOLON = 36;

    const metaData: Record<string, string> = {
      'oasis.ide.schema': 'project_memory',
      'oasis.ide.memoryKey': params.memoryKey,
      'oasis.ide.version': '1',
      'oasis.ide.memoryJson': params.memoryJson
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
        name: `OASIS IDE project memory — ${params.memoryKey}`,
        description: 'IDE project memory (metadata.memoryJson)',
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
        return { error: 'Not authorized — log in to sync project memory to OASIS.' };
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

  async loadProjectMemoryByMemoryKey(memoryKey: string): Promise<{
    rootHolonId?: string;
    memoryJson?: string;
    error?: string;
  }> {
    const qs = new URLSearchParams({
      metaKey: 'oasis.ide.memoryKey',
      metaValue: memoryKey,
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
        meta['oasis.ide.memoryJson'] ??
        meta['Oasis.Ide.MemoryJson'] ??
        meta['memoryJson'];
      const memoryJson =
        typeof rawJson === 'string' ? rawJson : rawJson != null ? JSON.stringify(rawJson) : undefined;
      const id = pick.id ?? pick.Id;
      return {
        rootHolonId: id != null ? String(id) : undefined,
        memoryJson: memoryJson || undefined
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
      /** plan | plan_gather | plan_present = read-only tools; execute = full tool set (default). */
      executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
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
          messages: body.messages.map((m) => {
            const row: Record<string, unknown> = {
              role: m.role,
              toolCallId: m.toolCallId,
              toolCalls: m.toolCalls?.map((tc) => ({
                id: tc.id,
                name: tc.name,
                argumentsJson: tc.argumentsJson
              }))
            };
            if (m.contentParts && m.contentParts.length > 0) {
              row.contentParts = m.contentParts.map((p) =>
                p.type === 'text'
                  ? { type: 'text', text: p.text }
                  : { type: 'image_url', imageUrl: p.imageUrl }
              );
            } else {
              row.content = m.content ?? '';
            }
            return row;
          }),
          workspaceRoot: body.workspaceRoot ?? undefined,
          referencedPaths: body.referencedPaths?.length ? body.referencedPaths : undefined,
          fromAvatarId: body.fromAvatarId,
          contextPack: body.contextPack?.trim() ? body.contextPack.trim() : undefined,
          executionMode:
            body.executionMode === 'plan' ||
            body.executionMode === 'plan_gather' ||
            body.executionMode === 'plan_present'
              ? body.executionMode
              : 'execute'
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
