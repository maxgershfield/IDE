import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  OappBuildPlanHolonRow,
  OappBuildPlanPayload,
  OappTemplateRecommendation
} from '../../shared/oappBuildPlanTypes';
import { useWorkspace } from './WorkspaceContext';
import { resolveWorkspaceRelativePath } from '../utils/buildPlanningDocContextNote';

interface OappBuildPlanContextValue {
  template: OappTemplateRecommendation | null;
  holonRows: OappBuildPlanHolonRow[];
  lastIngestedAt: number | null;
  applyPayload: (payload: OappBuildPlanPayload) => void;
  clearPlan: () => void;
  toggleHolon: (id: string) => void;
  setHolonSelected: (id: string, selected: boolean) => void;
  selectAllHolons: (selected: boolean) => void;
  /** Text for composer: selected holons + template summary */
  buildContinuationDraft: () => string;

  /** Absolute path to the markdown planning index (e.g. FirstRow_IDE_Build_Context.md) */
  planningDocPath: string | null;
  planningDocContent: string | null;
  planningDocLoading: boolean;
  planningDocError: string | null;
  loadPlanningDocFromAbsolutePath: (absolutePath: string) => Promise<void>;
  /** Reads `.oasiside/planning-doc.path` in the workspace (first path line), then loads that file */
  loadPlanningDocFromProjectHint: () => Promise<void>;
  /** Typed or pasted plan in the Build plan panel (no file path; sent in context pack) */
  setPlanningDocFromUserText: (text: string) => void;
  clearPlanningDoc: () => void;
}

const OappBuildPlanContext = createContext<OappBuildPlanContextValue | null>(null);

function normalizeHolonRows(payload: OappBuildPlanPayload): OappBuildPlanHolonRow[] {
  const raw = payload.holonFeatures ?? [];
  const out: OappBuildPlanHolonRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const h = raw[i];
    const id = (h.id && String(h.id).trim()) || `holon-${i}`;
    const feature = (h.feature && String(h.feature).trim()) || '(feature)';
    out.push({
      ...h,
      id,
      feature,
      selected: h.selected !== false
    });
  }
  return out;
}

export const OappBuildPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { workspacePath } = useWorkspace();
  const [template, setTemplate] = useState<OappTemplateRecommendation | null>(null);
  const [holonRows, setHolonRows] = useState<OappBuildPlanHolonRow[]>([]);
  const [lastIngestedAt, setLastIngestedAt] = useState<number | null>(null);

  const [planningDocPath, setPlanningDocPath] = useState<string | null>(null);
  const [planningDocContent, setPlanningDocContent] = useState<string | null>(null);
  const [planningDocLoading, setPlanningDocLoading] = useState(false);
  const [planningDocError, setPlanningDocError] = useState<string | null>(null);

  const loadPlanningDocFromAbsolutePath = useCallback(async (absolutePath: string) => {
    const abs = absolutePath.trim();
    if (!abs) {
      setPlanningDocError('Empty path');
      return;
    }
    setPlanningDocLoading(true);
    setPlanningDocError(null);
    try {
      const api = (window as { electronAPI?: { readFile?: (p: string) => Promise<string | null> } })
        .electronAPI;
      if (!api?.readFile) {
        setPlanningDocError('File API unavailable');
        return;
      }
      const text = await api.readFile(abs);
      if (text == null) {
        setPlanningDocError('Could not read file');
        return;
      }
      setPlanningDocPath(abs);
      setPlanningDocContent(text);
    } catch (e: unknown) {
      setPlanningDocError(e instanceof Error ? e.message : 'Read failed');
    } finally {
      setPlanningDocLoading(false);
    }
  }, []);

  const loadPlanningDocFromProjectHint = useCallback(async () => {
    if (!workspacePath) {
      setPlanningDocError('Open a workspace folder first');
      return;
    }
    setPlanningDocLoading(true);
    setPlanningDocError(null);
    try {
      const api = (window as { electronAPI?: { readFile?: (p: string) => Promise<string | null> } })
        .electronAPI;
      if (!api?.readFile) {
        setPlanningDocError('File API unavailable');
        return;
      }
      const hintFs = `${workspacePath.replace(/\/$/, '')}/.oasiside/planning-doc.path`;
      const raw = await api.readFile(hintFs);
      if (raw == null) {
        setPlanningDocError('Missing .oasiside/planning-doc.path in the workspace');
        return;
      }
      const line = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('#'));
      if (!line) {
        setPlanningDocError('No path line in .oasiside/planning-doc.path');
        return;
      }
      const resolved = resolveWorkspaceRelativePath(workspacePath, line);
      await loadPlanningDocFromAbsolutePath(resolved);
    } catch (e: unknown) {
      setPlanningDocError(e instanceof Error ? e.message : 'Read failed');
    } finally {
      setPlanningDocLoading(false);
    }
  }, [workspacePath, loadPlanningDocFromAbsolutePath]);

  const clearPlanningDoc = useCallback(() => {
    setPlanningDocPath(null);
    setPlanningDocContent(null);
    setPlanningDocError(null);
  }, []);

  const setPlanningDocFromUserText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) {
        clearPlanningDoc();
        return;
      }
      setPlanningDocPath(null);
      setPlanningDocContent(text);
      setPlanningDocError(null);
    },
    [clearPlanningDoc]
  );

  /** When the workspace opens, load planning doc if `.oasiside/planning-doc.path` exists (no UI step). */
  useEffect(() => {
    if (!workspacePath) return;
    const api = (window as { electronAPI?: { readFile?: (p: string) => Promise<string | null> } })
      .electronAPI;
    if (!api?.readFile) return;
    let alive = true;
    void (async () => {
      const hintFs = `${workspacePath.replace(/\/$/, '')}/.oasiside/planning-doc.path`;
      const raw = await api.readFile(hintFs);
      if (!alive || raw == null) return;
      const line = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('#'));
      if (!line) return;
      const resolved = resolveWorkspaceRelativePath(workspacePath, line);
      const doc = await api.readFile(resolved);
      if (!alive || doc == null) return;
      setPlanningDocPath(resolved);
      setPlanningDocContent(doc);
      setPlanningDocError(null);
    })();
    return () => {
      alive = false;
    };
  }, [workspacePath]);

  const applyPayload = useCallback((payload: OappBuildPlanPayload) => {
    if (payload.templateRecommendation && typeof payload.templateRecommendation === 'object') {
      const t = payload.templateRecommendation;
      if (t.label && t.framework) {
        setTemplate({
          label: String(t.label),
          framework: String(t.framework),
          templatePathOrId: t.templatePathOrId ? String(t.templatePathOrId) : undefined,
          rationale: t.rationale ? String(t.rationale) : undefined
        });
      }
    }
    const rows = normalizeHolonRows(payload);
    if (rows.length > 0) {
      setHolonRows(rows);
    }
    setLastIngestedAt(Date.now());
  }, []);

  const clearPlan = useCallback(() => {
    setTemplate(null);
    setHolonRows([]);
    setLastIngestedAt(null);
  }, []);

  const toggleHolon = useCallback((id: string) => {
    setHolonRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  }, []);

  const setHolonSelected = useCallback((id: string, selected: boolean) => {
    setHolonRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected } : r)));
  }, []);

  const selectAllHolons = useCallback((selected: boolean) => {
    setHolonRows((prev) => prev.map((r) => ({ ...r, selected })));
  }, []);

  const buildContinuationDraft = useCallback((): string => {
    const lines: string[] = [
      '[IDE: OAPP build plan — user-selected scope]',
      'Proceed with implementation for the following scope only (respect selections).',
      ''
    ];
    if (template) {
      lines.push('## Template');
      lines.push(`- **${template.label}** (${template.framework})`);
      if (template.templatePathOrId) lines.push(`- Template / recipe: \`${template.templatePathOrId}\``);
      if (template.rationale) lines.push(`- Rationale: ${template.rationale}`);
      lines.push('');
    }
    const chosen = holonRows.filter((r) => r.selected);
    lines.push('## Holons to include');
    if (chosen.length === 0) {
      lines.push('_(none selected in Build plan panel — select rows or ask to revise the plan)_');
    } else {
      for (const r of chosen) {
        const cat = r.catalogId ? ` id \`${r.catalogId}\`` : '';
        const name = r.catalogHolonName ? `**${r.catalogHolonName}**` : r.id;
        lines.push(`- ${name}${cat}: ${r.feature}`);
        if (r.roleInApp) lines.push(`  - Role: ${r.roleInApp}`);
      }
    }
    lines.push('');
    lines.push('Use MCP / workspace tools as needed. Do not add holons outside this list unless the user asks.');
    return lines.join('\n');
  }, [template, holonRows]);

  const value: OappBuildPlanContextValue = useMemo(
    () => ({
      template,
      holonRows,
      lastIngestedAt,
      applyPayload,
      clearPlan,
      toggleHolon,
      setHolonSelected,
      selectAllHolons,
      buildContinuationDraft,
      planningDocPath,
      planningDocContent,
      planningDocLoading,
      planningDocError,
      loadPlanningDocFromAbsolutePath,
      loadPlanningDocFromProjectHint,
      setPlanningDocFromUserText,
      clearPlanningDoc
    }),
    [
      template,
      holonRows,
      lastIngestedAt,
      applyPayload,
      clearPlan,
      toggleHolon,
      setHolonSelected,
      selectAllHolons,
      buildContinuationDraft,
      planningDocPath,
      planningDocContent,
      planningDocLoading,
      planningDocError,
      loadPlanningDocFromAbsolutePath,
      loadPlanningDocFromProjectHint,
      setPlanningDocFromUserText,
      clearPlanningDoc
    ]
  );

  return <OappBuildPlanContext.Provider value={value}>{children}</OappBuildPlanContext.Provider>;
};

export function useOappBuildPlan(): OappBuildPlanContextValue {
  const ctx = useContext(OappBuildPlanContext);
  if (!ctx) {
    throw new Error('useOappBuildPlan must be used within OappBuildPlanProvider');
  }
  return ctx;
}
