import React, { useMemo, useState } from 'react';
import {
  Boxes,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  GitBranch,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  DomainPack,
  DomainPackDashboardTab,
  DomainPackHolonSchema,
  DomainPackQuickAction,
  DomainPackRecipe,
} from '../../../shared/domainPackTypes';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { useDomainPacks } from '../../contexts/DomainPackContext';
import './HolonicSuitesDashboard.css';

type TabId = 'overview' | 'schemas' | 'relationships' | 'recipes' | 'safety';

const TAB_LABELS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'schemas', label: 'Holon Schemas' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'safety', label: 'Safety Rules' },
];

function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="hs-status">{children}</span>;
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="hs-stat">
      <span className="hs-stat-icon">{icon}</span>
      <span className="hs-stat-value">{value}</span>
      <span className="hs-stat-label">{label}</span>
    </div>
  );
}

function PackSelector({
  packs,
  selected,
  onSelect,
}: {
  packs: DomainPack[];
  selected: DomainPack;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="hs-sidebar">
      <div className="hs-sidebar-title">Domain packs</div>
      <div className="hs-pack-list">
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            className={`hs-pack-card${pack.id === selected.id ? ' active' : ''}`}
            onClick={() => onSelect(pack.id)}
          >
            <span className="hs-pack-label">{pack.label}</span>
            <span className="hs-pack-tagline">{pack.tagline}</span>
            <span className="hs-pack-status">{pack.status}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function QuickActionButton({ action }: { action: DomainPackQuickAction }) {
  const { injectComposerDraft } = useIdeChat();
  return (
    <button
      type="button"
      className="hs-action-card"
      onClick={() => injectComposerDraft(action.prompt)}
      title="Draft this action in Composer"
    >
      <span className="hs-action-top">
        <Sparkles size={14} />
        <span>{action.label}</span>
        <span className={`hs-mode hs-mode--${action.mode}`}>{action.mode}</span>
      </span>
      <span className="hs-action-description">{action.description}</span>
    </button>
  );
}

function SchemaCard({ schema }: { schema: DomainPackHolonSchema }) {
  return (
    <div className="hs-schema-card">
      <div className="hs-schema-head">
        <span className="hs-schema-name">{schema.name}</span>
        <span className="hs-chip">{schema.category}</span>
      </div>
      <p>{schema.description}</p>
      <div className="hs-field-list">
        {schema.fields.slice(0, 6).map((field) => (
          <code key={field}>{field}</code>
        ))}
      </div>
      {schema.requiredRelationships && schema.requiredRelationships.length > 0 ? (
        <div className="hs-required">
          Requires: {schema.requiredRelationships.map((rel) => ` ${rel}`).join(',')}
        </div>
      ) : null}
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: DomainPackRecipe }) {
  return (
    <div className="hs-recipe-card">
      <div className="hs-recipe-title">{recipe.title}</div>
      <p>{recipe.description}</p>
      <ol className="hs-step-list">
        {recipe.steps.map((step) => (
          <li key={step.label}>
            <span>{step.label}</span>
            <span className={`hs-mode hs-mode--${step.mode}`}>{step.mode}</span>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OverviewPanel({ pack }: { pack: DomainPack }) {
  return (
    <div className="hs-overview">
      <section className="hs-hero-card">
        <div className="hs-hero-copy">
          <h2>{pack.label}</h2>
          <p>{pack.description}</p>
          <div className="hs-hero-meta">
            <StatusPill>{pack.status} pack</StatusPill>
            {pack.docsPath ? <StatusPill>{pack.docsPath}</StatusPill> : null}
          </div>
        </div>
        <div className="hs-stat-grid">
          <StatCard icon={<Boxes size={16} />} value={pack.holonSchemas.length} label="Holon schemas" />
          <StatCard icon={<GitBranch size={16} />} value={pack.relationships.length} label="Relationships" />
          <StatCard icon={<BookOpen size={16} />} value={pack.recipes.length} label="Recipes" />
          <StatCard icon={<ShieldCheck size={16} />} value={pack.safetyRules.length} label="Safety rules" />
        </div>
      </section>

      <section className="hs-section">
        <div className="hs-section-title">Cockpit tabs from this pack</div>
        <div className="hs-tab-grid">
          {pack.dashboardTabs.map((tab) => (
            <DashboardTabCard key={tab.id} tab={tab} pack={pack} />
          ))}
        </div>
      </section>

      <section className="hs-section">
        <div className="hs-section-title">Quick actions</div>
        <div className="hs-action-grid">
          {pack.quickActions.map((action) => (
            <QuickActionButton key={action.id} action={action} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardTabCard({ tab, pack }: { tab: DomainPackDashboardTab; pack: DomainPack }) {
  const schemaNames = tab.holonSchemaIds
    .map((id) => pack.holonSchemas.find((schema) => schema.id === id)?.name)
    .filter(Boolean);
  const recipeTitles = (tab.recipeIds ?? [])
    .map((id) => pack.recipes.find((recipe) => recipe.id === id)?.title)
    .filter(Boolean);

  return (
    <div className="hs-domain-tab-card">
      <div className="hs-domain-tab-title">{tab.label}</div>
      <p>{tab.description}</p>
      <div className="hs-mini-list">
        {schemaNames.slice(0, 5).map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      {recipeTitles.length > 0 ? (
        <div className="hs-mini-recipes">
          {recipeTitles.map((title) => (
            <span key={title}>{title}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SchemasPanel({ pack }: { pack: DomainPack }) {
  const categories = useMemo(
    () => Array.from(new Set(pack.holonSchemas.map((schema) => schema.category))),
    [pack.holonSchemas]
  );
  return (
    <div className="hs-section-stack">
      {categories.map((category) => (
        <section key={category} className="hs-section">
          <div className="hs-section-title">{category}</div>
          <div className="hs-schema-grid">
            {pack.holonSchemas
              .filter((schema) => schema.category === category)
              .map((schema) => (
                <SchemaCard key={schema.id} schema={schema} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RelationshipsPanel({ pack }: { pack: DomainPack }) {
  return (
    <section className="hs-section">
      <div className="hs-section-title">Relationship vocabulary</div>
      <div className="hs-table">
        <div className="hs-table-row hs-table-head">
          <span>From</span>
          <span>Relation</span>
          <span>To</span>
          <span>Purpose</span>
        </div>
        {pack.relationships.map((rel) => (
          <div key={rel.id} className="hs-table-row">
            <span>{rel.from}</span>
            <code>{rel.label}</code>
            <span>{rel.to}</span>
            <span>{rel.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecipesPanel({ pack }: { pack: DomainPack }) {
  return (
    <section className="hs-section">
      <div className="hs-section-title">Recipes in this domain pack</div>
      <div className="hs-recipe-grid">
        {pack.recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}

function SafetyPanel({ pack }: { pack: DomainPack }) {
  return (
    <section className="hs-section">
      <div className="hs-section-title">Safety rules</div>
      <div className="hs-safety-list">
        {pack.safetyRules.map((rule) => (
          <div key={rule.id} className="hs-safety-card">
            <ShieldCheck size={16} />
            <div>
              <div className="hs-safety-title">{rule.title}</div>
              <p>{rule.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HolonicSuitesDashboard() {
  const { packs, activePackId, activePack, setActivePackId } = useDomainPacks();
  const [selectedPackId, setSelectedPackId] = useState(activePackId ?? packs[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? packs[0];

  if (!selectedPack) {
    return (
      <div className="hs-dashboard">
        <div className="hs-empty-state">No domain packs are available.</div>
      </div>
    );
  }

  return (
    <div className="hs-dashboard">
      <div className="hs-topbar">
        <BrainCircuit size={16} />
        <span className="hs-topbar-title">Holonic Suites</span>
        <span className="hs-topbar-subtitle">Schema-driven domain workbench</span>
        <span className="hs-topbar-spacer" />
        <StatusPill>{packs.length} pack{packs.length === 1 ? '' : 's'}</StatusPill>
      </div>

      <div className="hs-body">
        <PackSelector packs={packs} selected={selectedPack} onSelect={setSelectedPackId} />
        <main className="hs-main">
          <div className="hs-pack-header">
            <div>
              <div className="hs-kicker">Active domain pack</div>
              <h1>{selectedPack.label}</h1>
              <p>{selectedPack.tagline}</p>
            </div>
            <div className="hs-header-icons">
              <button
                type="button"
                className="hs-activate-btn"
                onClick={() =>
                  setActivePackId(activePack?.id === selectedPack.id ? null : selectedPack.id)
                }
              >
                {activePack?.id === selectedPack.id ? 'Active in Composer' : 'Use in Composer'}
              </button>
              <FileText size={18} />
              <ClipboardCheck size={18} />
              <Package size={18} />
            </div>
          </div>

          <div className="hs-tab-bar">
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`hs-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hs-content">
            {activeTab === 'overview' ? <OverviewPanel pack={selectedPack} /> : null}
            {activeTab === 'schemas' ? <SchemasPanel pack={selectedPack} /> : null}
            {activeTab === 'relationships' ? <RelationshipsPanel pack={selectedPack} /> : null}
            {activeTab === 'recipes' ? <RecipesPanel pack={selectedPack} /> : null}
            {activeTab === 'safety' ? <SafetyPanel pack={selectedPack} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
