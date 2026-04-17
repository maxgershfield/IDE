/**
 * Structured rows for the Composer "Live progress" panel (renderer + agent loop).
 */

export type AgentActivityFeedItem =
  | { kind: 'text'; text: string }
  | {
      kind: 'file_edit';
      /** Basename for display */
      displayPath: string;
      /** Workspace-relative or absolute path from tool */
      fullPath: string;
      addedLines: number;
      removedLines: number;
      isNewFile: boolean;
      source: 'write' | 'search_replace';
      replacementCount?: number;
      /** Unified diff snippet; omitted when too large */
      diffPreview?: string | null;
    };
