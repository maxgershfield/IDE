/**
 * WorldPreviewPane — monitors the generated world's dev server and opens it
 * in the user's default browser automatically once it's ready.
 *
 * The generated world (Hyperfy, Three.js, Babylon.js, etc.) is a standard
 * web project that runs best in a real browser — WebXR, full DevTools,
 * no sandbox restrictions. This pane polls the port and launches the browser
 * the moment the server answers, then shows a "live in browser" status card.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, RefreshCw, Server, Terminal, Play } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './WorldPreviewPane.css';

// All generated worlds use port 5174 to avoid conflicting with the OASIS IDE
// renderer dev server (port 3000) and Vite's own default (port 5173).
const ENGINE_PORTS: Record<string, number> = {
  hyperfy:   5174,
  threejs:   5174,
  babylonjs: 5174,
  unity:     8080,
  roblox:    8080,
};

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60; // ~90 seconds

// Three stages: 'ready-to-launch' (agent still writing), 'polling' (server starting), 'launched', 'error'
type PreviewStatus = 'ready-to-launch' | 'polling' | 'launched' | 'error';

interface Props {
  onClose?: () => void;
}

export const WorldPreviewPane: React.FC<Props> = ({ onClose }) => {
  const { starWorkspaceConfig, workspacePath } = useWorkspace();

  // Read the project path that WorldStarterPane stored when Generate was clicked
  const pendingPath = localStorage.getItem('oasis:pending-world-path') ?? '';
  const resolvedProjectPath = pendingPath || workspacePath || '';

  const defaultPort = ENGINE_PORTS[starWorkspaceConfig?.gameEngine ?? ''] ?? 5174;
  const [port, setPort] = useState(defaultPort);
  const [customUrl, setCustomUrl] = useState('');
  const [status, setStatus] = useState<PreviewStatus>('ready-to-launch');
  const [pollCount, setPollCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [launching, setLaunching] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const previewUrl = customUrl.trim() || `http://localhost:${port}`;
  const engineLabel = starWorkspaceConfig?.gameEngine ?? 'world';
  const projectName = pendingPath.split('/').pop()
    || starWorkspaceConfig?.name
    || workspacePath?.split('/').pop()
    || 'project';

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const openInBrowser = useCallback((url: string) => {
    window.electronAPI?.openUrl?.(url);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setStatus('polling');
    setPollCount(0);
    setErrorMsg('');

    let attempts = 0;
    let wasOpenAtStart: boolean | null = null;

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      setPollCount(attempts);

      if (attempts > MAX_POLL_ATTEMPTS) {
        stopPolling();
        setStatus('error');
        setErrorMsg(
          `Dev server not detected on port ${port} after ${Math.round((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000)}s. ` +
          `Make sure "npm run dev" is running in the Terminal tab.`
        );
        return;
      }

      const open = await window.electronAPI?.checkPort?.(port);

      if (wasOpenAtStart === null) {
        wasOpenAtStart = !!open;
        if (open) return; // skip a pre-existing server on this port
      }

      if (open && !wasOpenAtStart) {
        stopPolling();
        openInBrowser(previewUrl);
        setStatus('launched');
      } else if (!open && wasOpenAtStart) {
        wasOpenAtStart = false; // pre-existing server went away — now wait for world
      }
    }, POLL_INTERVAL_MS);
  }, [port, previewUrl, stopPolling, openInBrowser]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const p = ENGINE_PORTS[starWorkspaceConfig?.gameEngine ?? ''] ?? 5174;
    setPort(p);
  }, [starWorkspaceConfig?.gameEngine]);

  const handleLaunch = async () => {
    if (!resolvedProjectPath) {
      setStatus('error');
      setErrorMsg('No project path found. Open the project folder and try again.');
      return;
    }
    setLaunching(true);
    try {
      const sessionId = await window.electronAPI.terminalCreate(resolvedProjectPath);
      await window.electronAPI.terminalWrite(sessionId, `npm install && npm run dev\n`);
    } catch {
      // Directory may not exist yet — still start polling so user can retry
    }
    setLaunching(false);
    startPolling();
  };

  return (
    <div className="wpp-outer">
      {/* Toolbar */}
      <div className="wpp-toolbar">
        <div className="wpp-toolbar-left">
          <span className="wpp-engine-badge">{engineLabel}</span>
          <span className="wpp-project-label">{projectName}</span>
          <div className="wpp-url-wrap">
            <input
              className="wpp-url-input"
              type="text"
              value={customUrl}
              placeholder={`localhost:${port}`}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') startPolling(); }}
            />
          </div>
        </div>
        <div className="wpp-toolbar-right">
          <button
            type="button"
            className="wpp-btn wpp-btn--open"
            onClick={() => openInBrowser(previewUrl)}
            title="Open in browser"
          >
            <ExternalLink size={13} strokeWidth={1.8} />
            Open in browser
          </button>
          {onClose && (
            <button type="button" className="wpp-btn wpp-btn--close" onClick={onClose} title="Close preview">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Ready-to-launch — agent is still writing files */}
      {status === 'ready-to-launch' && (
        <div className="wpp-overlay">
          <div className="wpp-launched-icon">
            <Terminal size={36} strokeWidth={1.2} />
          </div>
          <p className="wpp-overlay-title">Agent is writing your world files</p>
          <p className="wpp-overlay-sub">
            Watch the AI panel on the right. Once the agent says it has finished writing files,
            click the button below to install packages and start the dev server.
          </p>
          {resolvedProjectPath && (
            <p className="wpp-overlay-hint">
              Project: <code>{resolvedProjectPath}</code>
            </p>
          )}
          <div className="wpp-overlay-actions">
            <button
              type="button"
              className="wpp-btn wpp-btn--primary"
              onClick={handleLaunch}
              disabled={launching}
            >
              <Play size={13} strokeWidth={1.8} />
              {launching ? 'Opening terminal…' : 'Launch dev server'}
            </button>
          </div>
          <p className="wpp-overlay-hint" style={{ marginTop: 8 }}>
            Or open the Terminal tab and run:
            <code style={{ display: 'block', marginTop: 4 }}>
              cd {resolvedProjectPath || '<project-path>'} &amp;&amp; npm install &amp;&amp; npm run dev
            </code>
          </p>
        </div>
      )}

      {/* Polling — npm install + dev server starting */}
      {status === 'polling' && (
        <div className="wpp-overlay">
          <div className="wpp-spinner" />
          <p className="wpp-overlay-title">Waiting for dev server on port {port}…</p>
          <p className="wpp-overlay-sub">
            {pollCount > 0 ? `${pollCount * POLL_INTERVAL_MS / 1000}s elapsed — npm install may still be running.` : 'Starting…'}
          </p>
          <p className="wpp-overlay-hint">
            The browser will open automatically. Check the Terminal tab for npm output.
          </p>
        </div>
      )}

      {/* Launched */}
      {status === 'launched' && (
        <div className="wpp-overlay wpp-overlay--launched">
          <div className="wpp-launched-icon">
            <Server size={36} strokeWidth={1.2} />
          </div>
          <p className="wpp-overlay-title">World launched in your browser</p>
          <p className="wpp-overlay-sub">Running at <code>{previewUrl}</code></p>
          <p className="wpp-overlay-hint">
            Vite HMR is active — edits to your world files reload instantly.
          </p>
          <div className="wpp-overlay-actions">
            <button type="button" className="wpp-btn wpp-btn--primary" onClick={() => openInBrowser(previewUrl)}>
              <ExternalLink size={13} strokeWidth={1.8} />
              Re-open in browser
            </button>
            <button type="button" className="wpp-btn" onClick={startPolling}>
              <RefreshCw size={13} strokeWidth={1.8} />
              Restart detection
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="wpp-overlay">
          <p className="wpp-overlay-title wpp-overlay-title--error">Server not detected</p>
          <p className="wpp-overlay-sub">{errorMsg}</p>
          <div className="wpp-overlay-actions">
            <button type="button" className="wpp-btn wpp-btn--primary" onClick={handleLaunch}>
              <Play size={13} strokeWidth={1.8} />
              Try launching again
            </button>
            <button type="button" className="wpp-btn" onClick={startPolling}>
              <RefreshCw size={13} strokeWidth={1.8} />
              Poll for server
            </button>
            <button type="button" className="wpp-btn" onClick={() => openInBrowser(previewUrl)}>
              <ExternalLink size={13} strokeWidth={1.8} />
              Try opening anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
