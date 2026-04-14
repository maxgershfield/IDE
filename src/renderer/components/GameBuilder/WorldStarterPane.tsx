/**
 * WorldStarterPane — "New World" builder tab.
 *
 * Two paths:
 *  1. AI Generate — describe your world in natural language; sends a structured
 *     agent message so the AI writes custom files into the workspace.
 *  2. Quick Scaffold — writes a real starter template instantly (Hyperfy,
 *     Three.js/R3F, or Babylon.js), then opens a terminal and runs
 *     `npm install && npm run dev` so the world pops up in the browser.
 */
import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useEditorTab } from '../../contexts/EditorTabContext';
import './WorldStarterPane.css';

const VITE_DEFAULT_PORT = 5173;

interface EngineOption {
  id: string;
  label: string;
  abbr: string;
  color: string;
  bg: string;
  devUrl: string;
  tagline: string;
}

const ENGINES: EngineOption[] = [
  {
    id: 'hyperfy',
    label: 'Hyperfy',
    abbr: 'HY',
    color: '#22d3ee',
    bg: 'linear-gradient(135deg, #0a1a1f 0%, #0d2830 100%)',
    devUrl: `http://localhost:${VITE_DEFAULT_PORT}`,
    tagline: 'Multiplayer, WebXR, VRM avatars, ELIZA NPCs',
  },
  {
    id: 'threejs',
    label: 'Three.js + R3F',
    abbr: 'R3F',
    color: '#a78bfa',
    bg: 'linear-gradient(135deg, #0f0a1f 0%, #1a1040 100%)',
    devUrl: `http://localhost:${VITE_DEFAULT_PORT}`,
    tagline: 'React Three Fiber, Rapier physics, VRM',
  },
  {
    id: 'babylonjs',
    label: 'Babylon.js',
    abbr: 'BJS',
    color: '#f97316',
    bg: 'linear-gradient(135deg, #1a0d00 0%, #2d1800 100%)',
    devUrl: `http://localhost:${VITE_DEFAULT_PORT}`,
    tagline: 'Production engine, Havok physics, GUI',
  },
];

type TabMode = 'ai' | 'scaffold';
type ScaffoldStatus = 'idle' | 'scaffolding' | 'launching' | 'done' | 'error';

interface Props {
  onClose: () => void;
}

export const WorldStarterPane: React.FC<Props> = ({ onClose }) => {
  const { workspacePath, refreshTree, reloadStarWorkspace } = useWorkspace();
  const { setPendingComposerText } = useEditorTab();

  const [tabMode, setTabMode] = useState<TabMode>('ai');
  const [description, setDescription] = useState('');
  const [selectedEngine, setSelectedEngine] = useState<string>('threejs');
  const [projectName, setProjectName] = useState('');
  const [destDir, setDestDir] = useState(workspacePath ?? '');
  const [scaffoldStatus, setScaffoldStatus] = useState<ScaffoldStatus>('idle');
  const [createdFiles, setCreatedFiles] = useState<string[]>([]);
  const [projectPath, setProjectPath] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [ipcAvailable, setIpcAvailable] = useState(true);

  // Sync dest when workspace changes
  useEffect(() => {
    if (workspacePath && !destDir) setDestDir(workspacePath);
  }, [workspacePath]);

  // Check if new IPC is available (requires IDE restart after first Phase 1.5 deploy)
  useEffect(() => {
    setIpcAvailable(typeof window.electronAPI?.scaffoldTemplate === 'function');
  }, []);

  const selectedEngineData = ENGINES.find((e) => e.id === selectedEngine)!;

  // ── AI Generate ────────────────────────────────────────────────
  const handleAIGenerate = () => {
    if (!description.trim()) return;
    const name = projectName.trim() || 'my-world';
    const dest = destDir.trim() || workspacePath || '/your/projects';
    const eng = selectedEngineData;

    const msg = `Generate a ${eng.label} metaverse world called "${name}".

**World description:**
${description.trim()}

**Engine:** ${eng.label} (${eng.tagline})
**Project path:** ${dest}/${name}

Please:
1. Use \`write_file\` to create all necessary files at \`${dest}/${name}/\` — include \`package.json\`, \`index.html\`, \`vite.config.js\` (or \`vite.config.ts\`), \`.star-workspace.json\` (with \`gameEngine: "${eng.id}"\`), source files, and a \`README.md\`.
2. Base the scene on the description above — terrain, atmosphere, lighting, any named locations.
3. Include at least one NPC that fits the world's theme.
4. Wire OASIS holons for player state persistence (\`lib/oasis.js\`).
5. After writing files, run \`npm install\` then \`npm run dev\` with \`run_workspace_command\` from \`${dest}/${name}\`.

Keep files small and composable. One concern per file.`;

    // Populate the composer input so the user can review the prompt and send it.
    // (setPendingComposerText also closes the builder tab automatically.)
    setPendingComposerText(msg);
  };

  // ── Quick Scaffold ──────────────────────────────────────────────
  const handleScaffold = async () => {
    if (!ipcAvailable) return;

    const name = projectName.trim();
    const dest = destDir.trim();

    if (!name || !dest) return;

    setScaffoldStatus('scaffolding');
    setErrorMsg('');

    let result: { ok: boolean; files?: string[]; projectPath?: string; error?: string } | undefined;

    try {
      result = await window.electronAPI.scaffoldTemplate(selectedEngine, dest, name);
    } catch (err: any) {
      setScaffoldStatus('error');
      setErrorMsg(`IPC error: ${err?.message ?? String(err)}`);
      return;
    }

    if (!result?.ok) {
      setScaffoldStatus('error');
      setErrorMsg(result?.error ?? 'Scaffold returned ok=false with no error message.');
      return;
    }

    setCreatedFiles(result.files ?? []);
    const fullPath = `${dest}/${name}`;
    setProjectPath(fullPath);
    await refreshTree();
    await reloadStarWorkspace();

    // Launch: open a terminal and run npm install && npm run dev
    setScaffoldStatus('launching');
    try {
      const sessionId = await window.electronAPI.terminalCreate(fullPath);
      await window.electronAPI.terminalWrite(sessionId, 'npm install && npm run dev\n');
    } catch {
      // Terminal launch failure is non-fatal — the files are already on disk
    }

    // Brief wait then open browser (Vite needs a few seconds to start)
    setTimeout(async () => {
      try {
        await window.electronAPI.openUrl(selectedEngineData.devUrl);
      } catch {
        // openUrl might not be available yet — non-fatal
      }
      setScaffoldStatus('done');
    }, 4000);
  };

  const canGenerate = description.trim().length > 0;
  const canScaffold = ipcAvailable && projectName.trim().length > 0 && destDir.trim().length > 0;

  return (
    <div className="wsp-outer">
      {/* Tab switcher */}
      <div className="wsp-tabs">
        <button
          type="button"
          className={`wsp-tab${tabMode === 'ai' ? ' is-active' : ''}`}
          onClick={() => setTabMode('ai')}
        >
          AI Generate
        </button>
        <button
          type="button"
          className={`wsp-tab${tabMode === 'scaffold' ? ' is-active' : ''}`}
          onClick={() => setTabMode('scaffold')}
        >
          Quick Scaffold
        </button>
      </div>

      {/* IPC unavailable notice */}
      {tabMode === 'scaffold' && !ipcAvailable && (
        <div className="wsp-notice wsp-notice--warn">
          The scaffold IPC requires an IDE restart to activate. Restart the IDE and try again,
          or use <strong>AI Generate</strong> which works immediately.
        </div>
      )}

      {/* ── Shared: engine pills ── */}
      <div className="wsp-section">
        <span className="wsp-label">Engine</span>
        <div className="wsp-engine-pills">
          {ENGINES.map((eng) => (
            <button
              key={eng.id}
              type="button"
              className={`wsp-engine-pill${selectedEngine === eng.id ? ' is-selected' : ''}`}
              style={
                selectedEngine === eng.id
                  ? { background: eng.bg, borderColor: eng.color, color: eng.color }
                  : {}
              }
              onClick={() => setSelectedEngine(eng.id)}
            >
              <span className="wsp-pill-abbr">{eng.abbr}</span>
              <span className="wsp-pill-label">{eng.label}</span>
            </button>
          ))}
        </div>
        <span className="wsp-engine-tagline">{selectedEngineData.tagline}</span>
      </div>

      {/* ── AI Generate tab ── */}
      {tabMode === 'ai' && (
        <>
          <div className="wsp-section">
            <label className="wsp-label" htmlFor="wsp-desc">Describe your world</label>
            <textarea
              id="wsp-desc"
              className="wsp-textarea"
              rows={6}
              placeholder="A cyberpunk city at night with neon signs, rain-slicked streets, and a black-market trader NPC in a back alley..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="wsp-row">
            <div className="wsp-field">
              <label className="wsp-label" htmlFor="wsp-ai-name">Project name</label>
              <input
                id="wsp-ai-name"
                className="wsp-input"
                type="text"
                placeholder="my-metaverse-world"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="wsp-field wsp-field--grow">
              <label className="wsp-label" htmlFor="wsp-ai-dest">Destination</label>
              <input
                id="wsp-ai-dest"
                className="wsp-input"
                type="text"
                placeholder="/path/to/projects"
                value={destDir}
                onChange={(e) => setDestDir(e.target.value)}
              />
            </div>
          </div>

          <div className="wsp-actions">
            <button type="button" className="wsp-btn wsp-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`wsp-btn wsp-btn--generate${canGenerate ? '' : ' is-disabled'}`}
              disabled={!canGenerate}
              onClick={handleAIGenerate}
            >
              Build Prompt
            </button>
          </div>

          <p className="wsp-hint">
            Builds a detailed agent prompt from your description and loads it into the chat composer.
            Review it, add any extra details, then hit Send — the AI will write all the files, run <code>npm install</code>, and start the dev server.
          </p>
        </>
      )}

      {/* ── Quick Scaffold tab ── */}
      {tabMode === 'scaffold' && (
        <>
          <div className="wsp-row">
            <div className="wsp-field">
              <label className="wsp-label" htmlFor="wsp-name">Project name</label>
              <input
                id="wsp-name"
                className="wsp-input"
                type="text"
                placeholder="my-metaverse-world"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="wsp-field wsp-field--grow">
              <label className="wsp-label" htmlFor="wsp-dest">Destination folder</label>
              <div className="wsp-dest-row">
                <input
                  id="wsp-dest"
                  className="wsp-input"
                  type="text"
                  placeholder="/path/to/projects"
                  value={destDir}
                  onChange={(e) => setDestDir(e.target.value)}
                />
                {workspacePath && (
                  <button
                    type="button"
                    className="wsp-use-workspace"
                    onClick={() => setDestDir(workspacePath)}
                  >
                    Use workspace
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          {projectName.trim() && destDir.trim() && (
            <div className="wsp-preview">
              <span className="wsp-preview-heading">Will create</span>
              <code className="wsp-preview-path">{destDir.trim()}/{projectName.trim()}</code>
              <span className="wsp-preview-engine" style={{ color: selectedEngineData.color }}>
                {selectedEngineData.label} starter
              </span>
            </div>
          )}

          {/* Status */}
          {scaffoldStatus === 'launching' && (
            <div className="wsp-status wsp-status--info">
              Files written. Running <code>npm install && npm run dev</code> in a terminal…
              <br />
              Opening <strong>{selectedEngineData.devUrl}</strong> in your browser shortly.
            </div>
          )}

          {scaffoldStatus === 'done' && (
            <div className="wsp-result wsp-result--success">
              <div className="wsp-result-heading">World is live</div>
              <p className="wsp-result-hint">
                Dev server running at{' '}
                <button
                  type="button"
                  className="wsp-link"
                  onClick={() => window.electronAPI?.openUrl?.(selectedEngineData.devUrl)}
                >
                  {selectedEngineData.devUrl}
                </button>
                . Check the Terminal tab for output.
              </p>
              <ul className="wsp-result-files">
                {createdFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button type="button" className="wsp-btn wsp-btn--close" onClick={onClose}>
                Close
              </button>
            </div>
          )}

          {scaffoldStatus === 'error' && (
            <div className="wsp-result wsp-result--error">
              <div className="wsp-result-heading">Scaffold failed</div>
              <p className="wsp-result-body">{errorMsg}</p>
              {errorMsg.includes('IPC') && (
                <p className="wsp-result-hint">
                  Restart the IDE to activate the scaffold feature, then try again.
                </p>
              )}
            </div>
          )}

          {scaffoldStatus !== 'done' && (
            <div className="wsp-actions">
              <button type="button" className="wsp-btn wsp-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={`wsp-btn wsp-btn--create${canScaffold ? '' : ' is-disabled'}`}
                disabled={!canScaffold || scaffoldStatus === 'scaffolding' || scaffoldStatus === 'launching'}
                onClick={handleScaffold}
              >
                {scaffoldStatus === 'scaffolding'
                  ? 'Writing files…'
                  : scaffoldStatus === 'launching'
                  ? 'Launching…'
                  : 'Create World'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
