import React from 'react';
import {
  Settings,
  CreditCard,
  Bot,
  Cpu,
  Plug,
  BookOpen,
  Wrench,
  User,
  Globe,
  Zap,
  Gamepad2,
  Database,
  Link2,
  type LucideIcon,
} from 'lucide-react';

export interface SettingsNavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  group: 'ide' | 'oasis';
}

export const NAV_ITEMS: SettingsNavItem[] = [
  // Core IDE settings
  { id: 'general',       label: 'General',             Icon: Settings,  group: 'ide' },
  { id: 'plan',          label: 'Plan & Usage',         Icon: CreditCard, group: 'ide' },
  { id: 'agents',        label: 'Agents',               Icon: Bot,       group: 'ide' },
  { id: 'models',        label: 'Models',               Icon: Cpu,       group: 'ide' },
  { id: 'integrations',  label: 'Integrations',         Icon: Plug,      group: 'ide' },
  { id: 'rules',         label: 'Rules & Skills',       Icon: BookOpen,  group: 'ide' },
  { id: 'mcp',           label: 'Tools & MCPs',         Icon: Wrench,    group: 'ide' },
  // OASIS-specific
  { id: 'avatar',        label: 'OASIS Avatar',         Icon: User,      group: 'oasis' },
  { id: 'starnet',       label: 'STARNET',              Icon: Globe,     group: 'oasis' },
  { id: 'onchain',       label: 'On-chain',             Icon: Link2,     group: 'oasis' },
  { id: 'ai-routing',    label: 'AI Routing / BRAID',   Icon: Zap,       group: 'oasis' },
  { id: 'game-dev',      label: 'Game Dev Mode',        Icon: Gamepad2,  group: 'oasis' },
  { id: 'providers',     label: 'Data Providers',       Icon: Database,  group: 'oasis' },
];

interface SettingsNavProps {
  active: string;
  onSelect: (id: string) => void;
}

export const SettingsNav: React.FC<SettingsNavProps> = ({ active, onSelect }) => {
  const ideItems = NAV_ITEMS.filter((i) => i.group === 'ide');
  const oasisItems = NAV_ITEMS.filter((i) => i.group === 'oasis');

  return (
    <nav className="settings-nav">
      <div className="settings-nav-header">Settings</div>

      <div className="settings-nav-group">
        {ideItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`settings-nav-item${active === id ? ' active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="settings-nav-group">
        <div className="settings-nav-group-label">OASIS</div>
        {oasisItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`settings-nav-item${active === id ? ' active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
};
