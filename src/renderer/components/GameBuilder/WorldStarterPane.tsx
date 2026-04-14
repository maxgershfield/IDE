import React, { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './WorldStarterPane.css';

interface EngineOption {
  id: string;
  label: string;
  tagline: string;
  abbr: string;
  color: string;
  bg: string;
  stack: string[];
  bestFor: string;
}

const ENGINES: EngineOption[] = [
  {
    id: 'hyperfy',
    label: 'Hyperfy',
    tagline: 'Multiplayer worlds in the browser, batteries included.',
    abbr: 'HY',
    color: '#22d3ee',
    bg: 'linear-gradient(135deg, #0a1a1f 0%, #0d2830 100%)',
    stack: ['Three.js', 'PhysX', 'WebXR', 'VRM avatars', 'ELIZA agents'],
    bestFor: 'Social / RP worlds with built-in avatar + physics',
  },
  {
    id: 'threejs',
    label: 'Three.js + R3F',
    tagline: 'Composable React scenes with full control.',
    abbr: 'R3F',
    color: '#a78bfa',
    bg: 'linear-gradient(135deg, #0f0a1f 0%, #1a1040 100%)',
    stack: ['React Three Fiber', 'Drei', 'Rapier physics', 'VRM', 'Colyseus'],
    bestFor: 'Custom game engines and browser-native experiences',
  },
  {
    id: 'babylonjs',
    label: 'Babylon.js',
    tagline: 'Production-grade engine with built-in Havok physics.',
    abbr: 'BJS',
    color: '#f97316',
    bg: 'linear-gradient(135deg, #1a0d00 0%, #2d1800 100%)',
    stack: ['Babylon.js 7', 'Havok physics', 'Babylon GUI', 'glTF/VRM'],
    bestFor: 'Complex scenes needing advanced physics and shadows',
  },
];

interface Props {
  onClose: () => void;
}

export const WorldStarterPane: React.FC<Props> = ({ onClose }) => {
  const { workspacePath, refreshTree, reloadStarWorkspace } = useWorkspace();
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [destDir, setDestDir] = useState(workspacePath ?? '');
  const [status, setStatus] = useState<'idle' | 'scaffolding' | 'done' | 'error'>('idle');
  const [createdFiles, setCreatedFiles] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const canScaffold = selectedEngine && projectName.trim() && destDir.trim();

  const handleScaffold = async () => {
    if (!canScaffold) return;
    setStatus('scaffolding');
    setErrorMsg('');
    try {
      const result = await window.electronAPI?.scaffoldTemplate?.(
        selectedEngine,
        destDir.trim(),
        projectName.trim()
      );
      if (!result?.ok) {
        setStatus('error');
        setErrorMsg(result?.error ?? 'Scaffold failed.');
        return;
      }
      setCreatedFiles(result.files ?? []);
      setStatus('done');
      await refreshTree();
      await reloadStarWorkspace();
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message ?? String(err));
    }
  };

  const selectedEngineData = ENGINES.find((e) => e.id === selectedEngine);

  return (
    <div className="wsp-outer">
      <div className="wsp-header">
        <span className="wsp-title">New World</span>
        <span className="wsp-subtitle">Pick an engine and scaffold a starter project</span>
      </div>

      {/* Engine cards */}
      <div className="wsp-engine-grid">
        {ENGINES.map((eng) => (
          <button
            key={eng.id}
            type="button"
            className={`wsp-engine-card${selectedEngine === eng.id ? ' is-selected' : ''}`}
            style={{
              background: eng.bg,
              borderColor: selectedEngine === eng.id ? eng.color : 'transparent',
            }}
            onClick={() => setSelectedEngine(eng.id)}
          >
            <div className="wsp-engine-abbr" style={{ color: eng.color, borderColor: eng.color + '55' }}>
              {eng.abbr}
            </div>
            <div className="wsp-engine-name">{eng.label}</div>
            <div className="wsp-engine-tagline">{eng.tagline}</div>
            <div className="wsp-engine-best">
              <span className="wsp-engine-best-label">Best for</span>
              {eng.bestFor}
            </div>
            <div className="wsp-engine-stack">
              {eng.stack.map((s) => (
                <span key={s} className="wsp-engine-tag" style={{ borderColor: eng.color + '44', color: eng.color }}>
                  {s}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Config fields */}
      <div className="wsp-form">
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

        <div className="wsp-field">
          <label className="wsp-label" htmlFor="wsp-dest">Destination folder</label>
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
              Use current workspace
            </button>
          )}
        </div>
      </div>

      {/* Preview of what will be created */}
      {selectedEngineData && projectName.trim() && (
        <div className="wsp-preview">
          <span className="wsp-preview-heading">Will create in</span>
          <code className="wsp-preview-path">
            {destDir.trim() || '(no folder set)'}/{projectName.trim()}
          </code>
          <div className="wsp-preview-engine" style={{ color: selectedEngineData.color }}>
            {selectedEngineData.label} starter
          </div>
        </div>
      )}

      {/* Status messages */}
      {status === 'done' && (
        <div className="wsp-result wsp-result--success">
          <div className="wsp-result-heading">World scaffolded!</div>
          <ul className="wsp-result-files">
            {createdFiles.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="wsp-result-hint">
            Run <code>npm install</code> then <code>npm run dev</code> to start your world.
            <br />
            The IDE has detected your engine and will inject{' '}
            <strong>{selectedEngineData?.label}</strong> context into the agent.
          </p>
          <button type="button" className="wsp-btn wsp-btn--close" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="wsp-result wsp-result--error">
          <div className="wsp-result-heading">Scaffold failed</div>
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      {status !== 'done' && (
        <div className="wsp-actions">
          <button
            type="button"
            className="wsp-btn wsp-btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`wsp-btn wsp-btn--create${canScaffold ? '' : ' is-disabled'}`}
            disabled={!canScaffold || status === 'scaffolding'}
            onClick={handleScaffold}
          >
            {status === 'scaffolding' ? 'Creating…' : 'Create World'}
          </button>
        </div>
      )}
    </div>
  );
};
