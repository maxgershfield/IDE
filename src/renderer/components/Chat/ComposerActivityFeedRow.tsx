import React, { useId } from 'react';
import type { AgentActivityFeedItem } from '../../../shared/agentActivityFeed';

type Props = {
  item: AgentActivityFeedItem;
};

export const ComposerActivityFeedRow: React.FC<Props> = ({ item }) => {
  const baseId = useId();

  if (item.kind === 'text') {
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
