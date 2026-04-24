import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Send, PenSquare, X, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useA2A } from '../../contexts/A2AContext';
import { normaliseA2AMessage, type A2AMessage, type A2AMethod } from '../../../shared/a2aTypes';
import './InboxPanel.css';

const POLL_INTERVAL_MS = 15_000;

const A2A_METHODS: { value: A2AMethod; label: string }[] = [
  { value: 'service_request', label: 'Service Request' },
  { value: 'ping',            label: 'Ping' },
  { value: 'capability_query', label: 'Capability Query' },
  { value: 'task_delegation', label: 'Task Delegation' },
];

export function InboxPanel({ embedded = false }: { embedded?: boolean }) {
  const { loggedIn } = useAuth();
  const { composeTarget, setComposeTarget } = useA2A();

  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [selected, setSelected] = useState<A2AMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState('');

  // Compose state
  const [composing, setComposing] = useState(false);
  const [composeToId, setComposeToId] = useState('');
  const [composeMethod, setComposeMethod] = useState<A2AMethod>('service_request');
  const [composeContent, setComposeContent] = useState('');
  const [sending, setSending] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!window.electronAPI?.a2aGetPending) return;
    setLoading(true);
    setFetchError('');
    try {
      const result = await window.electronAPI.a2aGetPending() as { ok: boolean; messages: unknown[]; error?: string };
      if (result.ok) {
        setMessages((result.messages ?? []).map((raw) => normaliseA2AMessage(raw as Record<string, unknown>)));
      } else {
        setFetchError(result.error ?? 'Failed to fetch messages');
        setMessages([]);
      }
    } catch (e: any) {
      setFetchError(e?.message ?? 'Failed to load inbox');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    if (!loggedIn) {
      setMessages([]);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    load();
    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loggedIn, load]);

  // Open compose pane when another panel sets a target agent
  useEffect(() => {
    if (composeTarget) {
      setComposeToId(composeTarget);
      setComposing(true);
      setComposeTarget(null);
    }
  }, [composeTarget, setComposeTarget]);

  const handleMarkProcessed = async () => {
    if (!selected) return;
    try {
      await window.electronAPI?.a2aMarkProcessed?.(selected.messageId);
      setMessages((prev) => prev.filter((m) => m.messageId !== selected.messageId));
      setSelected(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark processed');
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    if (!selected.fromAgentId) {
      setError('Cannot determine sender agent ID');
      return;
    }
    try {
      await window.electronAPI?.a2aSendReply?.(selected.fromAgentId, replyText.trim());
      setReplyText('');
      await handleMarkProcessed();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send reply');
    }
  };

  const handleComposeSend = async () => {
    if (!composeToId.trim() || !composeContent.trim()) return;
    setSending(true);
    setError('');
    try {
      const result = await window.electronAPI?.a2aSend?.(
        composeToId.trim(),
        composeMethod,
        composeContent.trim()
      ) as { ok: boolean; error?: string } | undefined;
      if (result && !result.ok) {
        setError(result.error ?? 'Failed to send message');
      } else {
        setComposeContent('');
        setComposeToId('');
        setComposing(false);
        await load();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (!loggedIn) {
    return (
      <div className={`inbox-panel${embedded ? ' inbox-panel--embedded' : ''}`}>
        {!embedded && <div className="inbox-panel-header">A2A Inbox</div>}
        <div className="inbox-panel-empty">Log in to see A2A messages.</div>
      </div>
    );
  }

  return (
    <div className={`inbox-panel${embedded ? ' inbox-panel--embedded' : ''}`}>
      {/* Header */}
      <div className={embedded ? 'inbox-panel-header inbox-panel-header--embedded' : 'inbox-panel-header'}>
        {!embedded && <span>A2A Inbox</span>}
        {embedded && <span className="inbox-header-spacer" />}
        <div className="inbox-header-actions">
          <button
            type="button"
            className="inbox-action-btn"
            title="New message"
            onClick={() => { setComposing((v) => !v); setSelected(null); setError(''); }}
          >
            <PenSquare size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="inbox-action-btn"
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.8} className={loading ? 'inbox-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Compose pane */}
      {composing && (
        <div className="inbox-compose">
          <div className="inbox-compose-header">
            <span>New Message</span>
            <button type="button" className="inbox-detail-close" onClick={() => { setComposing(false); setError(''); }}>
              <X size={14} />
            </button>
          </div>
          <label className="inbox-compose-label">
            To (Agent ID)
            <input
              className="inbox-compose-input"
              type="text"
              placeholder="agent-id or avatar-id"
              value={composeToId}
              onChange={(e) => setComposeToId(e.target.value)}
            />
          </label>
          <label className="inbox-compose-label">
            Method
            <div className="inbox-compose-select-wrap">
              <select
                className="inbox-compose-select"
                value={composeMethod}
                onChange={(e) => setComposeMethod(e.target.value as A2AMethod)}
              >
                {A2A_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="inbox-compose-select-icon" />
            </div>
          </label>
          <label className="inbox-compose-label">
            Content
            <textarea
              className="inbox-compose-textarea"
              placeholder="Message content or JSON payload…"
              rows={3}
              value={composeContent}
              onChange={(e) => setComposeContent(e.target.value)}
            />
          </label>
          {error && <div className="inbox-error">{error}</div>}
          <button
            type="button"
            className="inbox-compose-send"
            disabled={sending || !composeToId.trim() || !composeContent.trim()}
            onClick={handleComposeSend}
          >
            <Send size={12} strokeWidth={2} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}

      {/* Message list */}
      <div className="inbox-panel-content">
        {fetchError && (
          <div className="inbox-error inbox-error--fetch">
            {fetchError}
            <button type="button" className="inbox-error-retry" onClick={load}>Retry</button>
          </div>
        )}
        {!fetchError && messages.length === 0 && !loading && (
          <div className="inbox-panel-empty">No pending messages.</div>
        )}
        {messages.length > 0 && (
          <ul className="inbox-list">
            {messages.map((m) => {
              const snippet = m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '');
              return (
                <li
                  key={m.messageId || m.fromAgentId + snippet}
                  className={`inbox-list-item ${selected === m ? 'selected' : ''}`}
                  onClick={() => { setSelected(m); setError(''); setReplyText(''); setComposing(false); }}
                >
                  <div className="inbox-item-from">{m.fromAgentName || m.fromAgentId || 'Unknown'}</div>
                  {m.method && <div className="inbox-item-method">{m.method}</div>}
                  <div className="inbox-item-snippet">{snippet || '(no content)'}</div>
                  {m.createdAt && (
                    <div className="inbox-item-time">
                      {(() => { try { return new Date(m.createdAt!).toLocaleString(); } catch { return m.createdAt; } })()}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail / reply pane */}
      {selected && (
        <div className="inbox-detail">
          <div className="inbox-detail-header">
            <span>From: {selected.fromAgentName || selected.fromAgentId}</span>
            <button type="button" className="inbox-detail-close" onClick={() => setSelected(null)}>
              <X size={14} />
            </button>
          </div>
          {selected.method && (
            <div className="inbox-detail-method">Method: {selected.method}</div>
          )}
          <pre className="inbox-detail-body">{selected.content || '(empty)'}</pre>
          {error && <div className="inbox-error">{error}</div>}
          <div className="inbox-detail-reply">
            <textarea
              placeholder="Reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
            />
            <div className="inbox-detail-actions">
              <button type="button" onClick={handleReply} disabled={!replyText.trim()}>
                <Send size={11} strokeWidth={2} /> Reply
              </button>
              <button type="button" onClick={handleMarkProcessed}>
                Mark processed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
