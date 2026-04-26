import React, { useState } from 'react';
import {
  Boxes,
  ChevronDown,
  FolderOpen,
  Search,
  Star,
  MapPinned,
  LayoutTemplate,
  Ticket,
} from 'lucide-react';
import './ActivityBar.css';

export type ActivityView =
  | 'files'
  | 'search'
  | 'starnet'
  | 'guide'
  | 'suites'
  | 'templates'
  | 'passes';

interface ActivityBarProps {
  active: ActivityView;
  onChange: (view: ActivityView) => void;
}

const PRIMARY_ITEMS: { id: ActivityView; label: string; Icon: React.FC }[] = [
  { id: 'files', label: 'Explorer', Icon: () => <FolderOpen size={22} strokeWidth={1.5} /> },
  { id: 'search', label: 'Search', Icon: () => <Search size={22} strokeWidth={1.5} /> },
  { id: 'starnet', label: 'STARNET', Icon: () => <Star size={22} strokeWidth={1.5} /> },
  { id: 'passes', label: 'IDE Passes', Icon: () => <Ticket size={22} strokeWidth={1.5} /> },
];

const ADVANCED_ITEMS: { id: ActivityView; label: string; Icon: React.FC }[] = [
  { id: 'templates', label: 'Templates', Icon: () => <LayoutTemplate size={18} strokeWidth={1.5} /> },
  { id: 'suites', label: 'Holonic Suites', Icon: () => <Boxes size={18} strokeWidth={1.5} /> },
  { id: 'guide', label: 'Guide Map', Icon: () => <MapPinned size={18} strokeWidth={1.5} /> },
];

export const ActivityBar: React.FC<ActivityBarProps> = ({ active, onChange }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedActive = ADVANCED_ITEMS.some((i) => i.id === active);

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {PRIMARY_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`activity-bar-item${active === id ? ' active' : ''}`}
            title={label}
            aria-label={label}
            onClick={() => onChange(id)}
          >
            <Icon />
          </button>
        ))}

        <button
          type="button"
          className={`activity-bar-advanced-chevron${advancedOpen ? ' is-open' : ''}${advancedActive ? ' has-active-child' : ''}`}
          title={advancedOpen ? 'Hide advanced features' : 'Show advanced features'}
          aria-label="Advanced features"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <ChevronDown size={20} strokeWidth={1.8} />
        </button>

        {advancedOpen ? (
          <div className="activity-bar-advanced-menu" aria-label="Advanced features">
            {ADVANCED_ITEMS.map(({ id: advId, label: advLabel, Icon: AdvIcon }) => (
              <button
                key={advId}
                type="button"
                className={`activity-bar-item activity-bar-item-nested${active === advId ? ' active' : ''}`}
                title={advLabel}
                aria-label={advLabel}
                onClick={() => onChange(advId)}
              >
                <AdvIcon />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
