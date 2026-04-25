import React, { useState } from 'react';
import {
  Boxes,
  FolderOpen,
  Search,
  Star,
  MapPinned,
  LayoutTemplate,
  Ticket,
  Rocket,
} from 'lucide-react';
import './ActivityBar.css';

export type ActivityView = 'files' | 'search' | 'build' | 'starnet' | 'guide' | 'suites' | 'templates' | 'passes';

interface ActivityBarProps {
  active: ActivityView;
  onChange: (view: ActivityView) => void;
}

const PRIMARY_ITEMS: { id: ActivityView; label: string; Icon: React.FC }[] = [
  { id: 'files',   label: 'Explorer',  Icon: () => <FolderOpen size={22} strokeWidth={1.5} /> },
  { id: 'search',  label: 'Search',    Icon: () => <Search     size={22} strokeWidth={1.5} /> },
  { id: 'build',   label: 'Build',     Icon: () => <Rocket     size={22} strokeWidth={1.5} /> },
  { id: 'starnet', label: 'STARNET',   Icon: () => <Star       size={22} strokeWidth={1.5} /> },
  { id: 'passes',  label: 'IDE Passes', Icon: () => <Ticket    size={22} strokeWidth={1.5} /> },
];

const BUILD_ITEMS: { id: ActivityView; label: string; Icon: React.FC }[] = [
  { id: 'templates', label: 'Templates',       Icon: () => <LayoutTemplate size={18} strokeWidth={1.5} /> },
  { id: 'suites',    label: 'Holonic Suites',  Icon: () => <Boxes          size={18} strokeWidth={1.5} /> },
  { id: 'guide',     label: 'Guide Map',       Icon: () => <MapPinned      size={18} strokeWidth={1.5} /> },
];

export const ActivityBar: React.FC<ActivityBarProps> = ({ active, onChange }) => {
  const [buildExpanded, setBuildExpanded] = useState(false);

  const selectItem = (id: ActivityView) => {
    if (id === 'build') {
      setBuildExpanded((value) => !value);
      onChange('build');
      return;
    }
    onChange(id);
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {PRIMARY_ITEMS.map(({ id, label, Icon }) => (
          <React.Fragment key={id}>
            <button
              type="button"
              className={`activity-bar-item${active === id ? ' active' : ''}${id === 'build' && buildExpanded ? ' expanded' : ''}`}
              title={label}
              aria-label={label}
              onClick={() => selectItem(id)}
            >
              <Icon />
            </button>
            {id === 'build' && buildExpanded ? (
              <div className="activity-bar-build-menu" aria-label="Build features">
                {BUILD_ITEMS.map(({ id: buildId, label: buildLabel, Icon: BuildIcon }) => (
                  <button
                    key={buildId}
                    type="button"
                    className={`activity-bar-item activity-bar-item-nested${active === buildId ? ' active' : ''}`}
                    title={buildLabel}
                    aria-label={buildLabel}
                    onClick={() => onChange(buildId)}
                  >
                    <BuildIcon />
                  </button>
                ))}
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
