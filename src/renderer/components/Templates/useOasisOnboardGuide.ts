import { useState, useCallback, useRef } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { requestActivityView } from '../../utils/activityViewBridge';

export function safeFolderName(raw: string): string {
  const t = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '');
  return t.length > 0 ? t : 'oasis-app';
}

/** Derive a short, safe folder name from a freeform description. */
export function descriptionToFolderName(desc: string): string {
  const SKIP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'using', 'a', 'an', 'my', 'our', 'some']);
  const words = desc
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SKIP.has(w))
    .slice(0, 3);
  return words.length > 0 ? words.join('-') : 'oasis-app';
}

export const DEFAULT_OASIS_ONBOARD_FOLDER = 'oasis-app';

export type OasisGuideScreen = 'prompt' | 'copying' | 'installing' | 'done' | 'error';

export interface UseOasisOnboardGuideOptions {
  onSuccessBanner: (message: string) => void;
  /**
   * Called immediately after a successful creation if the user provided a description.
   * Fires the customization prompt to the Composer agent so the app is personalized
   * without any extra click.
   */
  onAutoCustomize?: (prompt: string) => void;
}

/** Build the agent prompt that rewrites index.html + style.css for the user's description. */
export function buildCustomizationPrompt(projectPath: string, folderName: string, description: string): string {
  return (
    `[OASIS app just created at ${projectPath}]\n\n` +
    `The user wants to build: ${description.trim()}\n\n` +
    `Transform the starter into a visually impressive, design-forward app that matches the description above.\n\n` +
    `Steps (run sequentially):\n` +
    `1. read_file src/style.css (inside ${projectPath}) — understand the existing structure.\n` +
    `2. read_file index.html — understand existing element IDs and HTML structure.\n` +
    `3. Rewrite src/style.css:\n` +
    `   - Pick a strong colour palette and typography that suits "${description.trim()}"\n` +
    `   - Add a full-width hero section style, card grid, and polished button variants\n` +
    `   - Make it look production-ready, not a grey bootstrap default\n` +
    `4. Rewrite index.html:\n` +
    `   - Add a compelling hero section ABOVE the existing cards (headline, subheadline, CTA matching the theme)\n` +
    `   - Rename visible labels and headings to suit the app context\n` +
    `   - KEEP all element IDs unchanged (#login-form, #login-error, #session-section, #logout-btn,\n` +
    `     #wallet-section, #ensure-wallet-btn, #wallet-status, #wallet-address, #wallet-error,\n` +
    `     #mint-section, #mint-form, #json-url, #mint-output, #mint-error) — the JavaScript depends on them\n` +
    `   - Do NOT change src/main.ts, oasisApi.ts, oasisTransport.ts, vite.config.ts, or .env\n` +
    `5. Reply with a one-line summary: "Done — reload the browser at http://localhost:5174 to see your app."\n\n` +
    `Be concise in your reply; the value is in the file edits, not the explanation.`
  );
}

export function useOasisOnboardGuide(options: UseOasisOnboardGuideOptions) {
  const { onSuccessBanner, onAutoCustomize } = options;
  const { workspacePath, refreshTree, openFile } = useWorkspace();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<OasisGuideScreen>('prompt');
  const [description, setDescription] = useState('');
  const [folderName, setFolderName] = useState(DEFAULT_OASIS_ONBOARD_FOLDER);
  /** True when the user has manually edited the folder name so auto-derive stops overwriting it. */
  const [folderNameLocked, setFolderNameLocked] = useState(false);
  const [skipNpm, setSkipNpm] = useState(false);
  const [errText, setErrText] = useState('');
  const [working, setWorking] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [lastProjectPath, setLastProjectPath] = useState<string | null>(null);
  const [npmLogTail, setNpmLogTail] = useState('');

  const api = window.electronAPI;
  const canCopy = typeof api?.copyOasisOnboardStarter === 'function';
  const canNpm = typeof api?.npmInstallInProject === 'function';
  const canApplyBranding = typeof (api as { applyOasisOnboardBranding?: unknown })?.applyOasisOnboardBranding ===
    'function';

  const resolvedRoot = workspacePath?.trim() ?? '';
  const previewPath =
    resolvedRoot && folderName
      ? `${resolvedRoot.replace(/\/$/, '')}/${safeFolderName(folderName)}/`
      : '';

  /** Keep folder name in sync with description unless the user locked it. */
  const handleDescriptionChange = useCallback((val: string) => {
    setDescription(val);
    if (!folderNameLocked) {
      const derived = descriptionToFolderName(val) || DEFAULT_OASIS_ONBOARD_FOLDER;
      setFolderName(derived);
    }
  }, [folderNameLocked]);

  const goCreate = useCallback(async () => {
    setErrText('');
    setErrorDetail('');
    setNpmLogTail('');
    setLastProjectPath(null);

    if (!canCopy) {
      setErrText('This IDE build does not expose the copy API. Update or rebuild.');
      return;
    }

    const parent = resolvedRoot;
    if (!parent) {
      setErrText('Open a workspace folder first so we know where to create the project.');
      return;
    }
    const name = safeFolderName(folderName || DEFAULT_OASIS_ONBOARD_FOLDER);
    if (!name) {
      setErrText('Enter a valid folder name.');
      return;
    }
    if (!skipNpm && !canNpm) {
      setErrText('This build cannot run npm in the IDE. Check "Skip npm install" or use a current build.');
      return;
    }

    setWorking(true);
    setScreen('copying');

    try {
      const copy = await api.copyOasisOnboardStarter!(parent, name);
      if (!copy.ok) {
        setErrorDetail(copy.error);
        setScreen('error');
        return;
      }

      setLastProjectPath(copy.projectPath);
      await refreshTree();
      const readMePath = `${copy.projectPath}/README.md`;

      if (skipNpm) {
        setScreen('done');
        onSuccessBanner(
          `Created ${copy.folderName}/. Run npm install in that folder when you're ready.`
        );
        requestActivityView('files');
        void openFile(readMePath);
        if (description.trim() && onAutoCustomize) {
          onAutoCustomize(buildCustomizationPrompt(copy.projectPath, copy.folderName, description));
        }
        return;
      }

      setScreen('installing');
      const npmR = await api.npmInstallInProject!(copy.projectPath);
      if (!npmR.ok) {
        setErrorDetail(npmR.error);
        setScreen('error');
        return;
      }
      if (!npmR.npmOk) {
        const tail = npmR.log.length > 2000 ? npmR.log.slice(-2000) : npmR.log;
        setNpmLogTail(tail);
        setErrorDetail('npm install exited with a non-zero status.');
        setScreen('error');
        return;
      }

      setScreen('done');
      onSuccessBanner(
        `Created ${copy.folderName}/ and installed dependencies. Start ONODE, then run npm run dev in that folder.`
      );
      requestActivityView('files');
      void openFile(readMePath);
      if (description.trim() && onAutoCustomize) {
        onAutoCustomize(buildCustomizationPrompt(copy.projectPath, copy.folderName, description));
      }
    } catch (e: unknown) {
      setErrorDetail(e instanceof Error ? e.message : String(e));
      setScreen('error');
    } finally {
      setWorking(false);
    }
  }, [canCopy, canNpm, canApplyBranding, description, folderName, onAutoCustomize, onSuccessBanner, openFile, refreshTree, resolvedRoot, skipNpm, api]);

  const retryNpm = useCallback(async () => {
    if (!api?.npmInstallInProject || !lastProjectPath) return;
    setErrText('');
    setErrorDetail('');
    setNpmLogTail('');
    setWorking(true);
    setScreen('installing');
    try {
      const npmR = await api.npmInstallInProject(lastProjectPath);
      if (!npmR.ok) {
        setErrorDetail(npmR.error);
        setScreen('error');
        return;
      }
      if (!npmR.npmOk) {
        const tail = npmR.log.length > 2000 ? npmR.log.slice(-2000) : npmR.log;
        setNpmLogTail(tail);
        setErrorDetail('npm install exited with a non-zero status.');
        setScreen('error');
        return;
      }
      setScreen('done');
      onSuccessBanner('Dependencies installed. Run npm run dev in that folder when ONODE is up.');
      requestActivityView('files');
      const readMePath = `${lastProjectPath}/README.md`;
      void openFile(readMePath);
    } catch (e: unknown) {
      setErrorDetail(e instanceof Error ? e.message : String(e));
      setScreen('error');
    } finally {
      setWorking(false);
    }
  }, [api, lastProjectPath, onSuccessBanner, openFile]);

  const reset = useCallback(() => {
    setScreen('prompt');
    setDescription('');
    setFolderName(DEFAULT_OASIS_ONBOARD_FOLDER);
    setFolderNameLocked(false);
    setSkipNpm(false);
    setErrText('');
    setErrorDetail('');
    setNpmLogTail('');
    setLastProjectPath(null);
  }, []);

  return {
    rootRef,
    screen,
    setScreen,
    description,
    setDescription: handleDescriptionChange,
    folderName,
    setFolderName: (v: string) => { setFolderNameLocked(true); setFolderName(v); },
    skipNpm,
    setSkipNpm,
    errText,
    setErrText,
    working,
    errorDetail,
    setErrorDetail,
    lastProjectPath,
    setLastProjectPath,
    npmLogTail,
    setNpmLogTail,
    resolvedRoot,
    previewPath,
    canCopy,
    canNpm,
    goCreate,
    retryNpm,
    reset,
    safeFolderName,
  };
}

export type OasisOnboardGuideViewModel = ReturnType<typeof useOasisOnboardGuide>;
