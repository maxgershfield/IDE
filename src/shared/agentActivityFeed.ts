/**
 * Structured rows for the Composer "Live progress" panel (renderer + agent loop).
 */

/** Semantic category of the tool being invoked — drives icon and accent colour in the feed. */
export type ToolKind = 'read' | 'write' | 'search' | 'command' | 'mcp' | 'web' | 'other';

export type AgentActivityFeedItem =
  | { kind: 'text'; text: string; toolKind?: ToolKind }
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
