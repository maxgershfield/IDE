import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContentTemplateMeta } from '../../../shared/templateTypes';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useEditorTab } from '../../contexts/EditorTabContext';
import {
  Building2,
  Swords,
  Users,
  Package,
  Clapperboard,
  Wand2,
  type LucideProps,
} from 'lucide-react';
import './MetaverseTemplatePanel.css';

// ─── Icon map ─────────────────────────────────────────────────────────────────

type IconComponent = React.FC<LucideProps>;

const TEMPLATE_ICONS: Record<string, IconComponent> = {
  'rp-server':       Building2,
  'quest-chain':     Swords,
  'npc-pack':        Users,
  'item-drop':       Package,
  'content-creator': Clapperboard,
};

const TemplateIcon: React.FC<{ id: string }> = ({ id }) => {
  const Icon = TEMPLATE_ICONS[id];
  if (!Icon) return null;
  return <Icon size={28} strokeWidth={1.4} />;
};

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'World Engines',
  'rp-server': 'Game Content Kits',
  'quest-chain': 'Game Content Kits',
  'npc-pack': 'Game Content Kits',
  'item-drop': 'Game Content Kits',
  'content-creator': 'Game Content Kits',
};

// ─── VariableModal ────────────────────────────────────────────────────────────

interface VariableModalProps {
  template: ContentTemplateMeta;
  destDir: string;
  onClose: () => void;
  onApplied: (template: ContentTemplateMeta, variables: Record<string, string>, filesCreated: string[]) => void;
  onPickWorkspace: () => void;
}

const VariableModal: React.FC<VariableModalProps> = ({
  template,
  destDir,
  onClose,
  onApplied,
  onPickWorkspace,
}) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.variables.map((v: { key: string; default?: string }) => [v.key, v.default ?? '']))
  );
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const handleApply = async () => {
    if (!destDir) {
      setError('No workspace folder open. Open a folder first.');
      return;
    }
    setApplying(true);
    setError('');
    try {
      let result: { ok: boolean; filesCreated?: string[]; files?: string[]; projectPath?: string; error?: string };
      if (template.category === 'engine') {
        if (typeof window.electronAPI?.scaffoldTemplate !== 'function') {
          setError('Scaffold API not available. Restart the IDE.');
          setApplying(false);
          return;
        }
        const projectName = values['PROJECT_NAME'] ?? template.name;
        result = await window.electronAPI.scaffoldTemplate(template.id, destDir, projectName);
        if (result.ok) result = { ...result, filesCreated: result.files };
      } else {
        if (typeof window.electronAPI?.applyContentTemplate !== 'function') {
          setError('Template API not available. Restart the IDE.');
          setApplying(false);
          return;
        }
        result = await window.electronAPI.applyContentTemplate(template.id, destDir, values);
      }
      if (!result.ok) { setError(result.error ?? 'Unknown error'); setApplying(false); return; }
      onApplied(template, values, result.filesCreated ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
      setApplying(false);
    }
  };

  const modal = (
    <div
      className="tmpl-modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="tmpl-modal" role="dialog" aria-modal="true">
        <div className="tmpl-modal-header">
          <span className="tmpl-modal-icon"><TemplateIcon id={template.id} /></span>
          <h2 className="tmpl-modal-title">{template.name}</h2>
          <button type="button" className="tmpl-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="tmpl-modal-desc">{template.description}</p>

        {destDir ? (
          <p className="tmpl-modal-dest">Destination: <code>{destDir.split('/').pop()}</code></p>
        ) : (
          <div className="tmpl-no-workspace">
            <span>No workspace open.</span>
            <button type="button" className="tmpl-btn tmpl-btn-sm" onClick={onPickWorkspace}>
              Open folder…
            </button>
          </div>
        )}

        <div className="tmpl-modal-vars">
          {template.variables.map((v: { key: string; prompt: string; default?: string }) => (
            <label key={v.key} className="tmpl-var-label">
              {v.prompt}
              <input
                className="tmpl-var-input"
                value={values[v.key] ?? ''}
                onChange={(e) => setValue(v.key, e.target.value)}
                placeholder={v.default ?? ''}
              />
            </label>
          ))}
        </div>
        {error && <p className="tmpl-error">{error}</p>}
        <div className="tmpl-modal-footer">
          <button type="button" className="tmpl-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="tmpl-btn tmpl-btn-primary"
            onClick={handleApply}
            disabled={applying || !destDir}
          >
            {applying ? 'Applying…' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>
  );

  // Render via portal so it escapes any panel overflow/transform context
  return createPortal(modal, document.body);
};

// ─── TemplateCard ─────────────────────────────────────────────────────────────

const TemplateCard: React.FC<{
  template: ContentTemplateMeta;
  onClick: () => void;
}> = ({ template, onClick }) => (
  <button type="button" className="tmpl-card" onClick={onClick}>
    <span className="tmpl-card-icon"><TemplateIcon id={template.id} /></span>
    <span className="tmpl-card-name">{template.name}</span>
    <span className="tmpl-card-desc">{template.description}</span>
  </button>
);

// ─── MetaverseTemplatePanel ───────────────────────────────────────────────────

interface MetaverseTemplatePanelProps {
  /** When present, show as an inline panel instead of a modal overlay. */
  inline?: boolean;
  onClose?: () => void;
}

export const MetaverseTemplatePanel: React.FC<MetaverseTemplatePanelProps> = ({
  inline = false,
  onClose,
}) => {
  const { workspacePath, openFile, pickWorkspace } = useWorkspace();
  const { openBuilderTab } = useEditorTab();
  const [templates, setTemplates] = useState<ContentTemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ContentTemplateMeta | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (typeof window.electronAPI?.listTemplateMeta !== 'function') {
      setLoading(false);
      setError('Template API not available. Restart the IDE to enable templates.');
      return;
    }
    window.electronAPI.listTemplateMeta()
      .then((res) => {
        setLoading(false);
        if (res.ok) setTemplates(res.templates);
        else setError('Could not load templates.');
      })
      .catch((e: unknown) => {
        setLoading(false);
        setError((e as Error)?.message ?? 'Failed to load templates.');
      });
  }, []);

  const handleApplied = (
    template: ContentTemplateMeta,
    variables: Record<string, string>,
    filesCreated: string[]
  ) => {
    setSelected(null);
    const fileCount = filesCreated.length;
    setSuccessMsg(`${template.name} applied — ${fileCount} file${fileCount !== 1 ? 's' : ''} created.`);

    // Inject the post-install prompt into game mode chat
    const prompt = template.postInstallPrompt.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => variables[k] ?? `{{${k}}}`);
    window.dispatchEvent(new CustomEvent('oasis:inject-prompt', { detail: { prompt } }));

    // Open the first created file
    if (filesCreated.length > 0 && workspacePath) {
      const first = filesCreated.find((f) => f.endsWith('.md') || f.endsWith('.json')) ?? filesCreated[0];
      openFile(`${workspacePath}/${first}`);
    }

    if (onClose) setTimeout(onClose, 2000);
  };

  const destDir = workspacePath ?? '';

  const contentTemplates = templates.filter((t) => t.category !== 'engine');

  const panelContent = (
    <div className={`tmpl-panel${inline ? ' tmpl-panel-inline' : ''}`}>
      {onClose && !inline && (
        <button type="button" className="tmpl-panel-close" onClick={onClose} aria-label="Close templates">✕</button>
      )}

      {/* ── World Builder hero ─────────────────────────────────────────────── */}
      <div className="tmpl-world-hero">
        <div className="tmpl-world-hero-text">
          <h2 className="tmpl-world-hero-title">Build a World</h2>
          <p className="tmpl-world-hero-desc">
            Describe your world in natural language and let the AI generate all files,
            run <code>npm install</code>, and launch the dev server. Or quick-scaffold
            a Hyperfy, Three.js, or Babylon.js starter.
          </p>
        </div>
        <button
          type="button"
          className="tmpl-world-hero-btn"
          onClick={() => openBuilderTab('newWorld')}
        >
          <Wand2 size={16} strokeWidth={1.6} />
          Open World Builder
        </button>
      </div>

      <div className="tmpl-divider" />

      {/* ── Game Content Kits ──────────────────────────────────────────────── */}
      <div className="tmpl-panel-header">
        <h2 className="tmpl-panel-title">Game Content Kits</h2>
        <p className="tmpl-panel-hint">
          Scaffolds lore, quests, NPCs, items, or a creator kit into your open workspace.
          No install step — files are ready to edit immediately.
          {workspacePath
            ? <> Writing into <code>{workspacePath.split('/').pop()}</code>.</>
            : <> <span className="warn">Open a workspace folder first.</span></>
          }
        </p>
      </div>

      {successMsg && <div className="tmpl-success-banner">{successMsg}</div>}
      {loading && <p className="tmpl-hint">Loading templates…</p>}
      {error && <p className="tmpl-error" style={{ padding: '0 20px' }}>{error}</p>}

      {!loading && contentTemplates.length > 0 && (
        <div className="tmpl-group">
          <div className="tmpl-card-grid">
            {contentTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} onClick={() => setSelected(t)} />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <VariableModal
          template={selected}
          destDir={destDir}
          onClose={() => setSelected(null)}
          onApplied={handleApplied}
          onPickWorkspace={pickWorkspace}
        />
      )}
    </div>
  );

  if (inline) return panelContent;

  return (
    <div className="tmpl-overlay" onClick={(e) => { if (e.currentTarget === e.target && onClose) onClose(); }}>
      {panelContent}
    </div>
  );
};
