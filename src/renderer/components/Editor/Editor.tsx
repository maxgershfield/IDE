import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { useGameDev } from '../../contexts/GameDevContext';
import { GameBuilderPane } from '../Chat/GameBuilderPane';
import { OappBuildPlanPanel } from './OappBuildPlanPanel';
import { HolonicCanvas } from '../HolonicCanvas/HolonicCanvas';
import { useHolonicCanvas } from '../../contexts/HolonicCanvasContext';
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
  const {
    activeBuilderTab,
    closeBuilderTab,
    openBuilderTab,
    buildPlanPaneOpen,
    openBuildPlanPane,
    closeBuildPlanPane
  } = useEditorTab();
  const { isGameDevMode } = useGameDev();
  const ignoreNextChange = useRef(false);

  // ── Holonic Canvas tab ──────────────────────────────────────────────────────
  const [canvasPaneOpen, setCanvasPaneOpen] = useState(false);
  const { nodes: canvasNodes, edges: canvasEdges, unviewedCount, markViewed, addCanvasEdge } = useHolonicCanvas();

  const openCanvas = useCallback(() => {
    setCanvasPaneOpen(true);
    markViewed();
    if (buildPlanPaneOpen) closeBuildPlanPane();
  }, [buildPlanPaneOpen, closeBuildPlanPane, markViewed]);

  const handleCanvasConnect = useCallback((parentId: string, childId: string) => {
    addCanvasEdge(parentId, childId, 'connect');
    // Fire holon_connect via MCP (best-effort, non-blocking)
    (window as any).electronAPI?.executeTool?.('holon_connect', { parentId, childId, relationLabel: 'connect' })
      .catch(() => { /* silently fail if MCP not available */ });
  }, [addCanvasEdge]);

  const handleCanvasExport = useCallback((diagramJson: string) => {
    // Dispatch a custom event that ComposerSessionPanel can listen to
    window.dispatchEvent(new CustomEvent('oasis-insert-diagram', { detail: { diagramJson } }));
  }, []);

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
  const showBuildPlan = buildPlanPaneOpen && !showBuilder && !canvasPaneOpen;
  const showCanvas = canvasPaneOpen && !showBuilder;
  const showMonaco = !showBuilder && !showBuildPlan && !showCanvas;

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
          className={`editor-tab-btn${showMonaco ? ' is-active' : ''}`}
          onClick={() => {
            if (showBuilder) closeBuilderTab();
            if (buildPlanPaneOpen) closeBuildPlanPane();
          }}
          title={fileLabel}
        >
          {fileLabel}
          {dirty && showMonaco && <span className="editor-dirty" title="Unsaved changes">●</span>}
        </button>

        <button
          type="button"
          className={`editor-tab-btn${showBuildPlan ? ' is-active' : ''}`}
          onClick={() => { openBuildPlanPane(); setCanvasPaneOpen(false); }}
          title="Structured OAPP template and holon selection"
        >
          Build plan
        </button>

        <button
          type="button"
          className={`editor-tab-btn${showCanvas ? ' is-active' : ''}`}
          onClick={openCanvas}
          title="Live holonic composition graph for this session"
          style={{ position: 'relative' }}
        >
          ◈ Canvas
          {unviewedCount > 0 && !showCanvas && (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: '#4daa6f',
                color: '#fff',
                borderRadius: '50%',
                fontSize: 9,
                width: 14,
                height: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {unviewedCount > 9 ? '9+' : unviewedCount}
            </span>
          )}
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
        style={{ display: showMonaco ? undefined : 'none' }}
      />

      {/* Builder pane — rendered inline when a builder tab is active */}
      {showBuilder && (
        <GameBuilderPane builderId={activeBuilderTab} onClose={closeBuilderTab} />
      )}

      {showBuildPlan ? (
        <div className="editor-build-plan-slot">
          <OappBuildPlanPanel />
        </div>
      ) : null}

      {showCanvas ? (
        <div className="editor-build-plan-slot">
          <HolonicCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            onConnect={handleCanvasConnect}
            onExportDiagram={handleCanvasExport}
            onRefresh={() => {
              (window as any).electronAPI?.executeTool?.('holon_session_graph', { format: 'diagram' })
                .catch(() => {});
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
