import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { SettingsNav, NAV_ITEMS } from './SettingsNav';
import { GeneralSection } from './sections/GeneralSection';
import { PlanUsageSection } from './sections/PlanUsageSection';
import { AgentsSection } from './sections/AgentsSection';
import { ModelsSection } from './sections/ModelsSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { RulesSkillsSection } from './sections/RulesSkillsSection';
import { MCPToolsSection } from './sections/MCPToolsSection';
import { AvatarSection } from './sections/AvatarSection';
import { StarnetSection } from './sections/StarnetSection';
import { AIRoutingSection } from './sections/AIRoutingSection';
import { GameDevSection } from './sections/GameDevSection';
import { DataProvidersSection } from './sections/DataProvidersSection';
import './Settings.css';

const SECTION_COMPONENTS: Record<string, React.FC> = {
  general: GeneralSection,
  plan: PlanUsageSection,
  agents: AgentsSection,
  models: ModelsSection,
  integrations: IntegrationsSection,
  rules: RulesSkillsSection,
  mcp: MCPToolsSection,
  avatar: AvatarSection,
  starnet: StarnetSection,
  'ai-routing': AIRoutingSection,
  'game-dev': GameDevSection,
  providers: DataProvidersSection,
};

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, closeSettings, activeSection, setActiveSection } = useSettings();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    if (isSettingsOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  const activeItem = NAV_ITEMS.find((i) => i.id === activeSection);
  const SectionComponent = SECTION_COMPONENTS[activeSection] ?? GeneralSection;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) closeSettings();
  };

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="settings-modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <SettingsNav active={activeSection} onSelect={setActiveSection} />

        <div className="settings-content">
          <div className="settings-content-header">
            <span className="settings-content-title">{activeItem?.label ?? 'Settings'}</span>
            <button
              type="button"
              className="settings-close-btn"
              onClick={closeSettings}
              aria-label="Close settings"
            >
              <X size={16} />
            </button>
          </div>

          <div className="settings-scroll">
            <SectionComponent />
          </div>
        </div>
      </div>
    </div>
  );
};
