import React from 'react';
import type { DomainPackQuickAction } from '../../../shared/domainPackTypes';

interface DomainPackQuickPaletteProps {
  packLabel: string;
  actions: DomainPackQuickAction[];
  onDraftAction: (action: DomainPackQuickAction) => void;
}

export const DomainPackQuickPalette: React.FC<DomainPackQuickPaletteProps> = ({
  packLabel,
  actions,
  onDraftAction,
}) => {
  if (actions.length === 0) return null;

  return (
    <div className="domain-pack-quick-palette" aria-label={`${packLabel} quick starts`}>
      <span className="domain-pack-quick-palette__heading">{packLabel}</span>
      <div className="domain-pack-quick-palette__actions" role="list">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="listitem"
            className="domain-pack-quick-palette__btn"
            title={action.description}
            onClick={() => onDraftAction(action)}
          >
            <span className="domain-pack-quick-palette__label">{action.label}</span>
            <span className="domain-pack-quick-palette__sublabel">{action.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
