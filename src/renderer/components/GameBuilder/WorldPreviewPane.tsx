/**
 * WorldPreviewPane — live in-IDE preview of the running Vite / Hyperfy dev server.
 *
 * Uses Electron's <webview> tag (sandboxed WebContents) to embed the world
 * directly alongside the chat. Polls for the dev server to come up, then
 * loads it automatically. Vite's HMR means every file the agent writes
 * hot-reloads in the preview without a manual refresh.
 *
 * Also provides an "Open in browser" button for a full-window view.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './WorldPreviewPane.css';

// Default ports per engine (Vite default is 5173; Hyperfy uses 3000)
const ENGINE_PORTS: Record<string, number> = {
  hyperfy: 3000,
  threejs: 5173,
  babylonjs: 5173,
  unity: 8080,
  roblox: 8080,
};

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40; // ~60 seconds

type PreviewStatus = 'waiting' | 'loading' | 'ready' | 'error';

interface Props {
  onClose?: () => void;
}

// Electron's <webview> tag — augment the existing WebViewHTMLAttributes
// to add Electron-specific string attributes the base type doesn't include.
declare module 'react' {
  interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
    partition?: string;
    webpreferences?: string;
  }
}

export const WorldPreviewPane: React.FC<Props> = ({ onClose }) => {
  const { starWorkspaceConfig, workspacePath } = useWorkspace();

  const defaultPort = ENGINE_PORTS[starWorkspaceConfig?.gameEngine ?? ''] ?? 5173;
  const [port, setPort] = useState(defaultPort);
  const [customUrl, setCustomUrl] = useState('');
  const [status, setStatus] = useState<PreviewStatus>('waiting');
  const [pollCount, setPollCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const webviewRef = useRef<HTMLElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const previewUrl = customUrl.trim() || `http://localhost:${port}`;
  const engineLabel = starWorkspaceConfig?.gameEngine ?? 'world';
  const projectLabel = starWorkspaceConfig?.name ?? workspacePath?.split('/').pop() ?? 'project';

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Start polling the port until the dev server is up
  const startPolling = useCallback(() => {
    stopPolling();
    setStatus('waiting');
    setPollCount(0);
    setErrorMsg('');

    let attempts = 0;
    pollTimerRef.current = setInterval(async () => {
      attempts++;
      setPollCount(attempts);

      if (attempts > MAX_POLL_ATTEMPTS) {
        stopPolling();
        setStatus('error');
        setErrorMsg(`Dev server not detected on port ${port} after ${MAX_POLL_ATTEMPTS} attempts. Start it with npm run dev, then click Retry.`);
        return;
      }

      const open = await window.electronAPI?.checkPort?.(port);
      if (open) {
        stopPolling();
        setStatus('loading');
      }
    }, POLL_INTERVAL_MS);
  }, [port, stopPolling]);

  // Start polling when the pane mounts or the port changes
  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  // Update default port when engine changes
  useEffect(() => {
    const p = ENGINE_PORTS[starWorkspaceConfig?.gameEngine ?? ''] ?? 5173;
    setPort(p);
  }, [starWorkspaceConfig?.gameEngine]);

  // Wire webview load events
  useEffect(() => {
    const wv = webviewRef.current as any;
    if (!wv || status !== 'loading') return;

    const onReady = () => setStatus('ready');
    const onFail = (_e: any) => {
      setStatus('error');
      setErrorMsg('Failed to load the preview. Is the dev server running?');
    };

    wv.addEventListener('did-finish-load', onReady);
    wv.addEventListener('did-fail-load', onFail);
    return () => {
      wv.removeEventListener('did-finish-load', onReady);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, [status]);

  const handleRefresh = () => {
    const wv = webviewRef.current as any;
    if (wv?.reload) {
      wv.reload();
    } else {
      startPolling();
    }
  };

  const handleOpenInBrowser = () => {
    window.electronAPI?.openUrl?.(previewUrl);
  };

  const handleRetry = () => {
    startPolling();
  };

  return (
    <div className="wpp-outer">
      {/* Toolbar */}
      <div className="wpp-toolbar">
        <div className="wpp-toolbar-left">
          <span className="wpp-engine-badge">{engineLabel}</span>
          <span className="wpp-project-label">{projectLabel}</span>
          <div className="wpp-url-wrap">
            <input
              className="wpp-url-input"
              type="text"
              value={customUrl}
              placeholder={`localhost:${port}`}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') startPolling();
              }}
            />
          </div>
        </div>

        <div className="wpp-toolbar-right">
          {status === 'ready' && (
            <button type="button" className="wpp-btn wpp-btn--icon" title="Refresh" onClick={handleRefresh}>
              ↺
            </button>
          )}
          <button type="button" className="wpp-btn wpp-btn--open" onClick={handleOpenInBrowser} title="Open in browser">
            ↗ Browser
          </button>
          {onClose && (
            <button type="button" className="wpp-btn wpp-btn--close" onClick={onClose} title="Close preview">
              ×
            </button>
          )}
        </div>
      </div>

      {/* States */}
      {status === 'waiting' && (
        <div className="wpp-overlay">
          <div className="wpp-spinner" />
          <p className="wpp-overlay-title">Waiting for dev server…</p>
          <p className="wpp-overlay-sub">
            Checking <code>localhost:{port}</code> — attempt {pollCount}
          </p>
          <p className="wpp-overlay-hint">
            Run <code>npm run dev</code> in the terminal tab if it isn't running yet.
          </p>
          <button type="button" className="wpp-btn wpp-btn--open" onClick={handleOpenInBrowser}>
            ↗ Open in browser when ready
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="wpp-overlay">
          <div className="wpp-spinner" />
          <p className="wpp-overlay-title">Loading world…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="wpp-overlay">
          <p className="wpp-overlay-title wpp-overlay-title--error">Preview unavailable</p>
          <p className="wpp-overlay-sub">{errorMsg}</p>
          <div className="wpp-overlay-actions">
            <button type="button" className="wpp-btn wpp-btn--open" onClick={handleRetry}>
              Retry
            </button>
            <button type="button" className="wpp-btn wpp-btn--open" onClick={handleOpenInBrowser}>
              ↗ Open in browser
            </button>
          </div>
        </div>
      )}

      {/* Webview — rendered immediately when loading/ready so it starts loading.
          React.createElement used instead of JSX to avoid @types/react attribute conflicts. */}
      {(status === 'loading' || status === 'ready') &&
        React.createElement('webview', {
          ref: webviewRef,
          src: previewUrl,
          className: `wpp-webview${status === 'ready' ? ' is-visible' : ''}`,
          partition: 'persist:worldpreview',
          allowpopups: 'true',
          webpreferences: 'allowRunningInsecureContent=yes',
        } as any)
      }
    </div>
  );
};
