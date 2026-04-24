import React, { useId } from 'react';
import { Eye, Pencil, Search, Terminal, Zap, Globe, Activity, type LucideIcon } from 'lucide-react';
import type { AgentActivityFeedItem, ToolKind } from '../../../shared/agentActivityFeed';

type Props = {
  item: AgentActivityFeedItem;
};

const TOOL_ICONS: Record<ToolKind, LucideIcon> = {
  read:    Eye,
  write:   Pencil,
  search:  Search,
  command: Terminal,
  mcp:     Zap,
  web:     Globe,
  other:   Activity,
};

const TOOL_KIND_CLASS: Record<ToolKind, string> = {
  read:    'composer-activity-tool--read',
  write:   'composer-activity-tool--write',
  search:  'composer-activity-tool--search',
  command: 'composer-activity-tool--command',
  mcp:     'composer-activity-tool--mcp',
  web:     'composer-activity-tool--web',
  other:   'composer-activity-tool--other',
};

export const ComposerActivityFeedRow: React.FC<Props> = ({ item }) => {
  const baseId = useId();

  if (item.kind === 'text') {
    if (item.toolKind) {
      const Icon = TOOL_ICONS[item.toolKind];
      return (
        <li className={`composer-activity-tool ${TOOL_KIND_CLASS[item.toolKind]}`}>
          <span className="composer-activity-tool-icon" aria-hidden="true">
            <Icon size={11} />
          </span>
          <span className="composer-activity-tool-label">{item.text}</span>
        </li>
      );
    }
    return (
      <li className="composer-activity-text">
        <span className="composer-activity-text-inner">{item.text}</span>
      </li>
    );
  }

  const showWriteBadges = item.source === 'write';
  const showReplace = item.source === 'search_replace';

  return (
    <li className="composer-activity-file-edit">
      <div className="composer-activity-file-edit-header">
        <span className="composer-activity-tool-icon composer-activity-tool-icon--write" aria-hidden="true">
          <Pencil size={11} />
        </span>
        <span className="composer-activity-file-name" title={item.fullPath}>
          {item.displayPath}
        </span>
        {showWriteBadges && (
          <span className="composer-activity-badges">
            {item.isNewFile ? (
              <span className="composer-activity-badge composer-activity-badge--new">new</span>
            ) : (
              <>
                <span className="composer-activity-badge composer-activity-badge--add">
                  +{item.addedLines}
                </span>
                <span className="composer-activity-badge composer-activity-badge--del">
                  −{item.removedLines}
                </span>
              </>
            )}
          </span>
        )}
        {showReplace && (
          <span className="composer-activity-badges">
            <span className="composer-activity-badge composer-activity-badge--edit">
              {item.replacementCount ?? 1}× replace
            </span>
          </span>
        )}
      </div>
      {item.diffPreview ? (
        <details className="composer-activity-diff-details">
          <summary className="composer-activity-diff-summary">View diff</summary>
          <pre className="composer-activity-diff-pre" id={`${baseId}-diff`}>
            {item.diffPreview}
          </pre>
        </details>
      ) : null}
    </li>
  );
};
