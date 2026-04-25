import React from 'react';
import { Bot, Boxes, Gamepad2, MapPinned, Rocket, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import { useA2A } from '../../contexts/A2AContext';
import { useGameDev } from '../../contexts/GameDevContext';
import { CORE_WORKFLOW_STEPS } from '../../config/shellSurface';
import { requestActivityView } from '../../utils/activityViewBridge';
import './OasisBuildHub.css';

interface BuildHubCard {
  title: string;
  description: string;
  cta: string;
  Icon: LucideIcon;
  onClick: () => void;
}

export const OasisBuildHub: React.FC = () => {
  const { setActiveTab } = useA2A();
  const { isGameDevMode, toggleGameDevMode } = useGameDev();

  const cards: BuildHubCard[] = [
    {
      title: 'Build with STARNET',
      description: 'Describe an OAPP, match holons, then hand the grounded draft to the same Composer thread.',
      cta: 'Open STARNET',
      Icon: Rocket,
      onClick: () => requestActivityView('starnet'),
    },
    {
      title: 'Start from a Template',
      description: 'Use the OASIS onboarding starter or metaverse templates without making templates a top-level choice.',
      cta: 'Open templates',
      Icon: Sparkles,
      onClick: () => requestActivityView('templates'),
    },
    {
      title: 'Use OASIS Tools',
      description: 'Browse MCP and STAR tools only when the task needs them. Composer remains the main workflow.',
      cta: 'Show tools',
      Icon: Wrench,
      onClick: () => setActiveTab('tools'),
    },
    {
      title: 'Compose Holonic Suites',
      description: 'Open domain packs for guided prompts and OASIS-specific context when the project calls for them.',
      cta: 'Open suites',
      Icon: Boxes,
      onClick: () => requestActivityView('suites'),
    },
    {
      title: 'Inspect Guide Map',
      description: 'Use the map as an advanced inspection surface, not the first thing every user has to understand.',
      cta: 'Open guide map',
      Icon: MapPinned,
      onClick: () => requestActivityView('guide'),
    },
    {
      title: 'Agents',
      description: 'Find and message specialist agents after the core app-building path is clear.',
      cta: 'Open agents',
      Icon: Bot,
      onClick: () => setActiveTab('agents'),
    },
    {
      title: 'Game Dev Studio',
      description: 'Load metaverse context for quests, NPCs, voice, items, and mission building.',
      cta: isGameDevMode ? 'Open NPC voice' : 'Enable Game Dev',
      Icon: Gamepad2,
      onClick: () => {
        if (!isGameDevMode) {
          toggleGameDevMode();
        }
        setActiveTab('npc');
      },
    },
  ];

  return (
    <section className="oasis-build-hub" aria-label="OASIS build hub">
      <div className="oasis-build-hub-hero">
        <div>
          <p className="oasis-build-hub-kicker">OASIS Build</p>
          <h1>Build OASIS and STARNET apps from one Composer.</h1>
          <p>
            Keep the IDE calm by starting with files, editor, Composer, and terminal. Bring in
            STARNET, templates, tools, and domain packs only when they help the current task.
          </p>
        </div>
      </div>

      <div className="oasis-build-hub-loop" aria-label="Core workflow">
        {CORE_WORKFLOW_STEPS.map((step) => (
          <span key={step}>{step}</span>
        ))}
      </div>

      <div className="oasis-build-hub-grid">
        {cards.map(({ title, description, cta, Icon, onClick }) => (
          <button key={title} type="button" className="oasis-build-hub-card" onClick={onClick}>
            <span className="oasis-build-hub-card-icon">
              <Icon size={18} strokeWidth={1.8} />
            </span>
            <span className="oasis-build-hub-card-title">{title}</span>
            <span className="oasis-build-hub-card-desc">{description}</span>
            <span className="oasis-build-hub-card-cta">{cta}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
