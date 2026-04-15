import React from 'react';
import {
  FolderOpen,
  Search,
  GitBranch,
  Star,
  LayoutTemplate,
} from 'lucide-react';
import './ActivityBar.css';

export type ActivityView = 'files' | 'search' | 'git' | 'starnet' | 'templates';

interface ActivityBarProps {
  active: ActivityView;
  onChange: (view: ActivityView) => void;
}

const ITEMS: { id: ActivityView; label: string; Icon: React.FC }[] = [
  { id: 'files',     label: 'Explorer',          Icon: () => <FolderOpen     size={22} strokeWidth={1.5} /> },
  { id: 'search',    label: 'Search',             Icon: () => <Search         size={22} strokeWidth={1.5} /> },
  { id: 'git',       label: 'Source Control',     Icon: () => <GitBranch      size={22} strokeWidth={1.5} /> },
  { id: 'starnet',   label: 'STARNET',            Icon: () => <Star           size={22} strokeWidth={1.5} /> },
  { id: 'templates', label: 'Templates',           Icon: () => <LayoutTemplate size={22} strokeWidth={1.5} /> },
];

export const ActivityBar: React.FC<ActivityBarProps> = ({ active, onChange }) => (
  <div className="activity-bar">
    <div className="activity-bar-top">
      {ITEMS.map(({ id, label, Icon }) => (
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
    </div>
  </div>
);
