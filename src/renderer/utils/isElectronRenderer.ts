/** True when the preload script exposed `electronAPI` (Electron shell, not a normal browser tab). */
export function isElectronRenderer(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}
