import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { useGameDev } from '../../contexts/GameDevContext';
import { GameBuilderPane } from '../Chat/GameBuilderPane';
import './Editor.css';

function languageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    py: 'python',
    sh: 'shell',
  };
  return map[ext] ?? 'plaintext';
}

export const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { fileContent, openFilePath, setFileContent, save, dirty, starWorkspaceConfig } = useWorkspace();
  const { activeBuilderTab, closeBuilderTab, openBuilderTab } = useEditorTab();
  const { isGameDevMode } = useGameDev();
  const ignoreNextChange = useRef(false);

  // Create Monaco once
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = monaco.editor.create(editorRef.current, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      wordWrap: 'on',
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: false,
      cursorStyle: 'line',
      fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    });

    monacoEditorRef.current = editor;

    return () => {
      editor.dispose();
      monacoEditorRef.current = null;
    };
  }, []);

  // Sync editor content when open file or fileContent (from open) changes
  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const current = editor.getValue();
    if (current !== fileContent) {
      ignoreNextChange.current = true;
      editor.pushUndoStop();
      model.setValue(fileContent);
      editor.pushUndoStop();
    }

    const lang = openFilePath ? languageFromPath(openFilePath) : 'plaintext';
    monaco.editor.setModelLanguage(model, lang);
  }, [openFilePath, fileContent]);

  // Subscribe to content changes and Cmd+S
  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;

    const disposable = editor.onDidChangeModelContent(() => {
      if (ignoreNextChange.current) {
        ignoreNextChange.current = false;
        return;
      }
      setFileContent(editor.getValue());
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      disposable.dispose();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setFileContent, save]);

  const fileLabel = openFilePath ? openFilePath.replace(/^.*[/\\]/, '') : 'Untitled';
  const showBuilder = activeBuilderTab !== null;

  // Builder tab label from builderId
  const BUILDER_LABELS: Record<string, string> = {
    newWorld: 'New World',
    worldPreview: 'Live Preview',
    quest: 'New Quest',
    npc: 'New NPC',
    missionArc: 'Mission Arc',
    npcVoice: 'NPC Voice',
    mintItem: 'Mint Item',
    dialogueTree: 'Dialogue Tree',
    lore: 'Generate Lore',
    geoHotspot: 'GeoHotSpot'
  };
  const builderLabel = activeBuilderTab ? (BUILDER_LABELS[activeBuilderTab] ?? activeBuilderTab) : '';
  // Show the Preview button when a game project is open (star-workspace.json with a gameEngine)
  const showPreviewBtn = isGameDevMode || !!starWorkspaceConfig?.gameEngine;
  const isPreviewActive = activeBuilderTab === 'worldPreview';

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        {/* File tab */}
        <button
          type="button"
          className={`editor-tab-btn${!showBuilder ? ' is-active' : ''}`}
          onClick={showBuilder ? closeBuilderTab : undefined}
          title={fileLabel}
        >
          {fileLabel}
          {dirty && !showBuilder && <span className="editor-dirty" title="Unsaved changes">●</span>}
        </button>

        {/* Builder tab — only rendered when a builder is open */}
        {showBuilder && (
          <div className="editor-tab-btn is-active editor-tab-btn--builder">
            <span>{builderLabel}</span>
            <button
              type="button"
              className="editor-tab-close"
              onClick={closeBuilderTab}
              aria-label="Close builder tab"
            >
              ×
            </button>
          </div>
        )}

        {/* Live Preview button — shown when a game project is open */}
        {showPreviewBtn && (
          <button
            type="button"
            className={`editor-tab-btn editor-tab-btn--preview${isPreviewActive ? ' is-active' : ''}`}
            onClick={() =>
              isPreviewActive ? closeBuilderTab() : openBuilderTab('worldPreview')
            }
            title="Toggle live world preview"
          >
            ⬡ Preview
          </button>
        )}
      </div>

      {/* Monaco — hidden (not unmounted) when a builder tab is active */}
      <div
        ref={editorRef}
        className="editor"
        style={{ display: showBuilder ? 'none' : undefined }}
      />

      {/* Builder pane — rendered inline when a builder tab is active */}
      {showBuilder && (
        <GameBuilderPane builderId={activeBuilderTab} onClose={closeBuilderTab} />
      )}
    </div>
  );
};
